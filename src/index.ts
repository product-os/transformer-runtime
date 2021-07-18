import NodeRSA = require('node-rsa')
import env from './utils/env'
import path from 'path'
import { ActorCredentials, TaskContract } from './types';
import { Contract } from '@balena/jellyfish-types/build/core';
import registry from './lib/registry';

const secretsKey = env.secretKey ?
	new NodeRSA(Buffer.from(env.secretKey, 'base64').toString('utf-8'), 'pkcs1', { encryptionScheme: 'pkcs1' })
	: undefined

const directory = {
    input: (task: TaskContract) => path.join(env.inputDir, `task-${task.id}`),
    output: (task: TaskContract) => path.join(env.outputDir, `task-${task.id}`),
  };

function createArtifactReference ({ slug, version }: Contract) {
	let registryPort = "";
	if (env.registryPort) {
		registryPort = `:${env.registryPort}`;
	}
	return `${env.registryHost}${registryPort}/${slug}:${version}`;
}

  async function pullTransformer(
    task: TaskContract,
    actorCredentials: ActorCredentials,
  ) {
    const transformerImageReference = createArtifactReference(task.data.transformer);
    console.log(`[WORKER] Pulling transformer ${transformerImageReference}`);
    const transformerImageRef = await registry.pullImage(
      transformerImageReference,
      { username: actorCredentials.slug, password: actorCredentials.sessionToken },
    );

    return transformerImageRef;
  }

  async function runTransformer(task: TaskContract, transformerImageRef: string) {
    console.log(`[WORKER] Running transformer image ${transformerImageRef}`);

    const docker = registry.docker;

    // docker-in-docker work by mounting a tmpfs for the inner volumes
    const tmpDockerVolume = `tmp-docker-${task.id}`;

    //HACK - dockerode closes the stream unconditionally
    process.stdout.end = () => { }
    process.stderr.end = () => { }

    const runResult = await docker.run(
      transformerImageRef,
      [],
      [process.stdout, process.stderr],
      {
        Tty: false,
        Env: [
          `INPUT=/input/${env.inputManifestFilename}`,
          `OUTPUT=/output/${env.outputManifestFilename}`,
        ],
        Volumes: {
          '/input/': {},
          '/output/': {},
          '/var/lib/docker': {} // if the transformers uses docker-in-docker, this is required
        },
        HostConfig: {
          Init: true, // should ensure that containers never leave zombie processes
          Privileged: true, //TODO: this should at least only happen for Transformers that need it
          Binds: [
            `${path.resolve(directory.input(task))}:/input/:ro`,
            `${path.resolve(directory.output(task))}:/output/`,
            `${tmpDockerVolume}:/var/lib/docker`,
          ],
        },
      } as ContainerCreateOptions,
    );

    const output = runResult[0];
    const container = runResult[1];

    await docker.getContainer(container.id).remove({force: true})
    await docker.getVolume(tmpDockerVolume).remove({force: true})

    console.log("[WORKER] run result", JSON.stringify(runResult));

    return output.StatusCode;
  }

/**
 * This function takes an object tree with all string values expected to be
 * base64 encoded secrets and returns the same tree with the values decrypted
 * but again base64 encoded.
 * (The latter allows passing binary secrets as well)
 *
 * @param encryptedSecrets object that only contains string values or other encryptedSecrets objects
 */
 export function decryptSecrets(secretsKey: NodeRSA | undefined, sec: any): any {
	if (!sec) {
		return undefined;
	}
	if (!secretsKey) {
		console.log(`WARN: no secrets key provided! Will pass along secrets without decryption. Should not happen in production`)
		return sec;
	}
	let result: any = {};
	for (const key of Object.keys(sec)) {
		const val = sec[key];
		if (typeof val === 'string') {
			result[key] = secretsKey.decrypt(val, 'base64');
		} else if (typeof val === 'object') {
			result[key] = exports.decryptSecrets(secretsKey, val);
		} else {
			console.log(`WARN: unknown type in secrets for key ${key}`)
		}
	}
	return result
}
