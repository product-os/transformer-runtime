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
		labels?: { [key: string]: any },
	): Promise<OutputManifest> {
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

		console.log(`[WORKER] Running transformer image ${imageRef}`);

		const docker = this.docker;

		// docker-in-docker work by mounting a tmpfs for the inner volumes
		const tmpDockerVolume = `tmp-docker-${inputContract.id}`;
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
						'/input/': {},
						'/output/': {},
						'/var/lib/docker': {}, // if the transformers uses docker-in-docker, this is required
					},
					Labels: {
						'io.balena.transformer': 'true',
						...labels,
					},
					HostConfig: {
						Init: true, // should ensure that containers never leave zombie processes
						Privileged: privileged,
						Binds: [
							`${path.resolve(workingDirectory)}:/input/`,
							`${path.resolve(artifactDirectory)}:/input/artifact/:ro`,
							`${path.resolve(outputDirectory)}:/output/`,
							`${tmpDockerVolume}:/var/lib/docker`,
						],
					},
				} as Dockerode.ContainerCreateOptions,
			);

			stdoutStream.end();
			stderrStream.end();

			console.log('[WORKER] run result', JSON.stringify(runResult));

			return await this.validateOutput(
				runResult[0].StatusCode,
				outputDirectory,
			);
		} catch (error: any) {
			console.error('[WORKER] ERROR RUNNING TRANSFORMER:');

			// TODO: remove temporary type
			const errorContractBody: ErrorContract = {
				name: 'Transformer Runtime Error',
				data: {
					message: error.message,
					code: error.code || '1',
				},
				type: 'error@1.0.0',
				version: '1.0.0',
				slug: `error${inputContract.slug}`,
			};

			// Check if output manifest exists
			try {
				await fs.promises.access(
					path.join(outputDirectory, 'output-manifest.json'),
					fs.constants.F_OK,
				);
				// Read in file since we found it
				const outputManifest = await fs.promises.readFile(
					path.join(outputDirectory, 'output-manifest.json'),
				);
				// Stick extra data in the contract body
				errorContractBody.data.outputManifest = JSON.parse(
					outputManifest.toString(),
				);
			} catch (err: any) {
				if (err.code !== 'ENOENT') {
					throw err;
				} // Something really bad happened
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
			await this.cleanup();
		}
	}

	async cleanup(label?: string) {
		const docker = new Dockerode();
		const containers = await docker.listContainers({
			all: true,
			filters: {
				label: {
					[label || 'io.balena.transformer']: true,
				},
			},
		});
		console.log(`[WORKER] Removing ${containers.length} containers`, label);
		await Promise.all(
			containers.map((container) =>
				docker.getContainer(container.Id).remove({ force: true }),
			),
		);
		const volumes = await docker.listVolumes({
			filters: {
				label: {
					[label || 'io.balena.transformer']: true,
				},
			},
		});
		console.log(`[WORKER] Removing ${volumes.Volumes.length} volumes`);
		await Promise.all(
			volumes.Volumes.map((volume) =>
				docker.getVolume(volume.Name).remove({ force: true }),
			),
		);
	}

	async validateOutput(exitCode: number, outputDirectory: string) {
		console.log(`[WORKER] Validating transformer output`);

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
			console.log(`[WORKER] INFO: empty results array`);
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
				} catch (e) {
					throw new Error(
						`${message} artifact path ${result.artifactPath} is not readable`,
					);
				}
			}
		}
	}
}
