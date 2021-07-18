import { ContainerCreateOptions } from "dockerode";
import path from "path";
import { ActorCredentials, InputManifest, TaskContract } from "../types";
import env from "../utils/env";
import { decryptSecrets, directory, pathExists, secretsKey } from "../utils/helpers";
import { createArtifactReference } from "./artifact";
import registry from "./registry";
import fs from 'fs'

export async function pullTransformer(
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

export async function runTransformer(task: TaskContract, transformerImageRef: string) {
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

export async function prepareWorkspace(task: TaskContract, credentials: ActorCredentials) {
	console.log(`[WORKER] Preparing transformer workspace`);

	const outputDir = directory.output(task);
	const inputDir = directory.input(task);

	if (await pathExists(outputDir)) {
		console.log(`[WORKER] WARN output directory already existed (from previous run?) - deleting it`);
		await fs.promises.rm(outputDir, { recursive: true, force: true });
	}
	if (await pathExists(inputDir)) {
		console.log(`[WORKER] WARN input directory already existed (from previous run?) - deleting it`);
		await fs.promises.rm(inputDir, { recursive: true, force: true });
	}

	const inputArtifactDir = path.join(
		inputDir,
		env.artifactDirectoryName,
	);

	await fs.promises.mkdir(inputArtifactDir, { recursive: true });
	await fs.promises.mkdir(outputDir, { recursive: true });

	const inputContract = task.data.input;
	if (task.data.transformer.data.inputType != 'contract-only') {
		await registry.pullArtifact(createArtifactReference(inputContract), inputArtifactDir, { username: credentials.slug, password: credentials.sessionToken });
	}

	// Add input manifest
	const inputManifest: InputManifest = {
		input: {
			contract: inputContract,
			transformerContract: task.data.transformer,
			artifactPath: env.artifactDirectoryName,
			decryptedSecrets: decryptSecrets(secretsKey, inputContract.data.$transformer?.encryptedSecrets),
			decryptedTransformerSecrets:  decryptSecrets(secretsKey,  task.data.transformer.data.encryptedSecrets),
		},
	};

	await fs.promises.writeFile(
		path.join(directory.input(task), env.inputManifestFilename),
		JSON.stringify(inputManifest, null, 4),
		'utf8',
	);
}
