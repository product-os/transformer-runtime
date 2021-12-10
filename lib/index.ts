import {
	ErrorContract,
	InputManifest,
	OutputManifest,
	TransformerContract,
} from './types';
import * as fs from 'fs';
import { createDecryptor } from './secrets';
import * as path from 'path';
import Dockerode = require('dockerode');
import { Contract } from '@balena/jellyfish-types/build/core';
import * as stream from 'stream';
import { randomUUID } from 'crypto';

const RUN_LABEL = 'io.balena.transformer.run';
const TRANSFORMER_LABEL = 'io.balena.transformer';

export default class TransformerRuntime {
	private docker: Dockerode;
	private decryptor: (s: any) => any;

	constructor(decryptionKey?: string) {
		this.docker = new Dockerode();
		this.decryptor = createDecryptor(decryptionKey);
	}

	async runTransformer(
		artifactDirectory: string,
		inputContract: Contract<any>,
		transformerContract: TransformerContract,
		imageRef: string,
		workingDirectory: string,
		outputDirectory: string,
		privileged: boolean,
		labels?: { [key: string]: string },
		secondaryInput?: Array<{
			contract: Contract<any>;
			artifactDirectory: string;
		}>,
	): Promise<OutputManifest> {
		const runId = randomUUID();
		// Add input manifest
		const inputManifest: InputManifest = {
			input: {
				contract: inputContract,
				transformerContract,
				artifactPath: 'artifact',
				decryptedSecrets: this.decryptor(
					inputContract.data.$transformer?.encryptedSecrets,
				),
				decryptedTransformerSecrets: this.decryptor(
					transformerContract.data.encryptedSecrets,
				),
			},
			// we'll place each secondary input in directories named after the UUID to avoid collisions
			secondaryInput: secondaryInput?.map((si) => ({
				contract: si.contract,
				artifactPath: si.contract.id,
			})),
		};

		// Make sure input directory exists
		try {
			(await fs.promises.stat(workingDirectory)).isDirectory();
		} catch (e: any) {
			if (e.code !== 'ENOENT') {
				throw e;
			} else {
				await fs.promises.mkdir(workingDirectory);
			}
		}

		const inputManifestFile = 'inputManifest.json';
		await fs.promises.writeFile(
			path.join(workingDirectory, inputManifestFile),
			JSON.stringify(inputManifest, null, 4),
			'utf8',
		);

		// Make sure output directory exists
		try {
			(await fs.promises.stat(outputDirectory)).isDirectory();
		} catch (e: any) {
			if (e.code !== 'ENOENT') {
				throw e;
			} else {
				await fs.promises.mkdir(outputDirectory);
			}
		}

		console.log(`[RUNTIME] Running transformer image ${imageRef}`);

		const docker = this.docker;

		// docker-in-docker needs its storage to be a compatible fs
		const tmpDockerVolume = `tmp-docker-${runId}`;
		await docker.createVolume({
			Name: tmpDockerVolume,
			Labels: {
				...labels,
				[TRANSFORMER_LABEL]: 'true',
				[RUN_LABEL]: runId,
			},
		});

		const stdOutTail: string[] = [];
		const stdErrTail: string[] = [];
		try {
			// Use our own streams that hook into stdout and stderr
			const stdoutStream = new stream.PassThrough();
			const stderrStream = new stream.PassThrough();

			const logAndCacheTail = (tail: string[]) => (data: Buffer) => {
				const line = data.toString('utf8');
				process.stderr.write(line);
				tail.push(line);
				if (tail.length > 10) {
					tail.shift();
				}
			};
			stdoutStream.on('data', logAndCacheTail(stdOutTail));
			stderrStream.on('data', logAndCacheTail(stdErrTail));

			const secondaryInputBindings =
				secondaryInput?.map(
					(si) =>
						`${path.resolve(si.artifactDirectory)}:/input/${
							si.contract.id
						}/:ro`,
				) || [];

			const inputManifestBind = `${path.join(
				path.resolve(workingDirectory),
				inputManifestFile,
			)}:/input/${inputManifestFile}:ro`;
			const inputArtifactBind = `${path.resolve(
				artifactDirectory,
			)}:/input/artifact:ro`;
			const outputBind = `${path.resolve(outputDirectory)}:/output`;
			const runResult = await docker.run(
				imageRef,
				[],
				[stdoutStream, stderrStream],
				{
					Tty: false,
					Env: [
						`INPUT=/input/inputManifest.json`,
						`OUTPUT=/output/output-manifest.json`,
					],
					Volumes: {
						'/var/lib/docker': {}, // if the transformers uses docker-in-docker, this is required
					},
					Labels: {
						...labels,
						[TRANSFORMER_LABEL]: 'true',
						[RUN_LABEL]: runId,
					},
					HostConfig: {
						Init: true, // should ensure that containers never leave zombie processes
						Privileged: privileged,
						Binds: [
							inputManifestBind,
							inputArtifactBind,
							...secondaryInputBindings,
							outputBind,
							`${tmpDockerVolume}:/var/lib/docker`,
						],
					},
				} as Dockerode.ContainerCreateOptions,
			);

			stdoutStream.end();
			stderrStream.end();

			const exitCode = runResult[0].StatusCode;

			console.log('[RUNTIME] run result', { exitCode });

			return await this.createOutputManifest(
				exitCode,
				path.resolve(outputDirectory),
			);
		} catch (error: any) {
			console.error('[RUNTIME] ERROR RUNNING TRANSFORMER:', error);

			// TODO: remove temporary type
			const errorContract: ErrorContract = {
				type: 'error@1.0.0',
				name: `Runtime Error - ${transformerContract.name}`,
				data: {
					message: error.message,
					code: error.code ?? '1',
					transformer: `${transformerContract.slug}@${transformerContract.version}`,
					expectedOutputTypes:
						transformerContract.data?.expectedOutputTypes ?? [],
					stdOutTail: stdOutTail.join(''),
					stdErrTail: stdErrTail.join(''),
					$transformer: {
						// In a graph of transformations many error contracts can be produced
						// Appending the Transformer slug would help, but it's possible that the same Transformer runs
						// on several contracts in the graph, so that wouldn't fix the issue
						slugSuffix: new Date().getTime().toString(),
					},
				},
			};

			// Check if output manifest exists
			try {
				await fs.promises.access(
					path.join(path.resolve(outputDirectory), 'output-manifest.json'),
					fs.constants.F_OK,
				);
				console.log('[RUNTIME] Found output manifest');
				// Read in file since we found it
				const outputManifest = await fs.promises.readFile(
					path.join(path.resolve(outputDirectory), 'output-manifest.json'),
				);
				// Stick extra data in the contract body
				errorContract.data.outputManifest = JSON.parse(
					outputManifest.toString(),
				);
			} catch (err: any) {
				if (err.code !== 'ENOENT') {
					throw err;
				} // Something really bad happened
				console.log(
					'[RUNTIME] Did not find output manifest in',
					path.resolve(outputDirectory),
				);
			}

			// Return the output manifest
			return {
				results: [
					{
						contract: errorContract,
					},
				],
			};
		} finally {
			await this.cleanup(runId);
		}
	}

	private async cleanup(runId: string) {
		const docker = new Dockerode();
		const containers = await docker.listContainers({
			all: true,
			filters: {
				label: [`${RUN_LABEL}=${runId}`],
			},
		});
		console.log(`[RUNTIME] Removing ${containers.length} containers`, runId);
		await Promise.all(
			containers.map((container) =>
				docker.getContainer(container.Id).remove({ force: true }),
			),
		);
		const volumes = await docker.listVolumes({
			filters: {
				label: [`${RUN_LABEL}=${runId}`],
			},
		});
		console.log(`[RUNTIME] Removing ${volumes.Volumes.length} volumes`, runId);
		await Promise.all(
			volumes.Volumes.map((volume) =>
				docker.getVolume(volume.Name).remove({ force: true }),
			),
		);
	}

	async createOutputManifest(exitCode: number, outputDirectory: string) {
		console.log(`[RUNTIME] Validating transformer output`);

		if (exitCode !== 0) {
			throw new Error(`exit-code ${exitCode}`);
		}

		console.log(
			'[RUNTIME] Reading output from',
			path.join(outputDirectory, 'output-manifest.json'),
		);

		let outputManifest: OutputManifest;
		try {
			outputManifest = {
				exitCode,
				...JSON.parse(
					await fs.promises.readFile(
						path.join(outputDirectory, 'output-manifest.json'),
						'utf8',
					),
				),
			} as OutputManifest;
		} catch (e: any) {
			e.message = `Could not load output manifest: ${e.message}`;
			throw e;
		}

		await this.validateOutputManifest(outputManifest, outputDirectory);

		return outputManifest;
	}

	async validateOutputManifest(m: OutputManifest, outputDir: string) {
		const message = 'Output manifest validation error: ';
		if (!Array.isArray(m.results)) {
			throw new Error(`${message} missing results array`);
		}

		if (m.results.length < 1) {
			console.log(`[RUNTIME] INFO: empty results array`);
		}

		for (const result of m.results) {
			if (!result.contract || !result.contract.data) {
				throw new Error(`${message} missing result contract`);
			}

			// Note: artifactPath can be empty
			if (result.artifactPath) {
				try {
					await fs.promises.access(
						path.join(outputDir, result.artifactPath),
						fs.constants.R_OK,
					);
					console.log('[RUNTIME] Successful validation of output');
				} catch (e) {
					throw new Error(
						`${message} artifact path ${result.artifactPath} is not readable`,
					);
				}
			}
		}
	}
}
