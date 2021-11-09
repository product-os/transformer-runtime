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

		await fs.promises.writeFile(
			path.join(workingDirectory, 'inputManifest.json'),
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
		try {
			// Use our own streams that hook into stdout and stderr
			const stdoutStream = new stream.PassThrough();
			const stderrStream = new stream.PassThrough();

			stdoutStream.on('data', (data: Buffer) => {
				process.stdout.write(data.toString('utf8'));
			});

			stderrStream.on('data', (data: Buffer) => {
				process.stderr.write(data.toString('utf8'));
			});

			const secondaryInputBindings =
				secondaryInput?.map(
					(si) =>
						`${path.resolve(si.artifactDirectory)}:/input/${
							si.contract.id
						}/:ro`,
				) || [];

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
							`${path.resolve(workingDirectory)}:/input/:ro`,
							`${path.resolve(artifactDirectory)}:/input/artifact/:ro`,
							...secondaryInputBindings,
							`${path.resolve(outputDirectory)}:/output/`,
							`${tmpDockerVolume}:/var/lib/docker`,
						],
					},
				} as Dockerode.ContainerCreateOptions,
			);

			stdoutStream.end();
			stderrStream.end();

			console.log('[RUNTIME] run result', JSON.stringify(runResult));

			return await this.validateOutput(
				runResult[0].StatusCode,
				path.resolve(outputDirectory),
			);
		} catch (error: any) {
			console.error('[RUNTIME] ERROR RUNNING TRANSFORMER:');

			// TODO: remove temporary type
			const errorContractBody: ErrorContract = {
				name: 'Transformer Runtime Error',
				data: {
					message: error.message,
					code: error.code || '1',
				},
				type: 'error@1.0.0',
				version: '1.0.0',
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
				errorContractBody.data.outputManifest = JSON.parse(
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
						contract: errorContractBody as any,
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

	async validateOutput(exitCode: number, outputDirectory: string) {
		console.log(`[RUNTIME] Validating transformer output`);

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
