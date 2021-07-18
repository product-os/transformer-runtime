import { ContainerCreateOptions } from "dockerode";
import path from "path";
import { ActorCredentials, ArtifactContract, InputManifest, OutputManifest, TaskContract } from "../types";
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

export async function validateOutput(task: TaskContract, transformerExitCode: number) {
	console.log(`[WORKER] Validating transformer output`);

	if (transformerExitCode !== 0) {
		throw new Error(
			`Transformer ${task.data.transformer.id} exited with non-zero status code: ${transformerExitCode}`,
		);
	}

	const outputDir = directory.output(task);

	let outputManifest;
	try {
		outputManifest = JSON.parse(
			await fs.promises.readFile(
				path.join(outputDir, env.outputManifestFilename),
				'utf8',
			),
		) as OutputManifest;
	} catch (e) {
		e.message = `Could not load output manifest: ${e.message}`;
		throw e;
	}

	await validateOutputManifest(outputManifest, outputDir);

	return outputManifest;
}

export async function validateOutputManifest(
	m: OutputManifest,
	outputDir: string,
) {
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

export async function pushOutput(
	task: TaskContract,
	outputManifest: OutputManifest,
	actorCredentials: ActorCredentials,
) {
	console.log(`[WORKER] Storing transformer output`);

	const outputDir = directory.output(task);
	const inputContract = task.data.input;

	for (const result of outputManifest.results) {
		// Because storing an artifact requires an existing contract,
		// but a contact may trigger another transformer,
		// this must be done in following order:
		// - store output contract (artifactReady: false)
		// - push artifact
		// - update output contract (artifactReady: true)

		// Store output contract
		const outputContract = result.contract;
		outputContract.version = inputContract.version;
		outputContract.data.$transformer = {
			...inputContract.data.$transformer,
			...outputContract.data.$transformer,
			artifactReady: false,
		};
		const baseSlug = inputContract.data.$transformer?.baseSlug;
		// If baseSlug exists, then set deterministic slug, 
		// otherwise keep transformer-defined slug
		if (baseSlug) {
			const outputType = outputContract.type.split('@')[0];
			outputContract.slug = `${outputType}-${baseSlug}`;
			const slugSuffix = outputContract.data.$transformer?.slugSuffix;
			if (slugSuffix) {
				outputContract.slug += `-${slugSuffix}`;
			}
		}
		await jf.storeArtifactContract(outputContract);

		// Store output artifact
		const artifactReference = createArtifactReference(outputContract);
		const authOptions = { username: actorCredentials.slug, password: actorCredentials.sessionToken };
		if (_.compact([result.imagePath, result.artifactPath, result.manifestList]).length > 1) {
			throw new Error(`result ${result.contract.slug} contained multiple kinds of artifact`);
		}
		if (result.imagePath) {
			await registry.pushImage(
				artifactReference,
				path.join(outputDir, result.imagePath),
				authOptions,
			)
		} else if (result.artifactPath) {
			await registry.pushArtifact(
				artifactReference,
				path.join(outputDir, result.artifactPath),
				authOptions,
			);
		}  else if (result.manifestList) {
			await registry.pushManifestList(
				artifactReference,
				result.manifestList,
				authOptions,
			);
		} else {
			console.log(`[WORKER] no artifact for result ${result.contract.slug}`);
		}

		// Create links to output contract
		const contractRepo = await jf.getContractRepository(outputContract)
		await jf.createLink(contractRepo, outputContract, 'contains')
		await jf.createLink(inputContract, outputContract, LinkNames.WasBuiltInto);
		await jf.createLink(task, outputContract, LinkNames.Generated);

		// Mark artifact ready, allowing it to be processed by downstream transformers
		await jf.markArtifactContractReady(outputContract);
	}
}

export async function processBackflow(task: TaskContract, outputManifest: OutputManifest) {
	console.log(`[WORKER] Processing backflow`);

	const inputContract = task.data.input;

	// Process backflow from each output contract, to input contract
	for (const result of outputManifest.results) {
		const outputContract = result.contract;
		await jf.updateBackflow(outputContract, inputContract, task);
	}

	// Propagate backflow recursively from input contract upstream
	const backflowLimit = 20;

	const propagate = async (contract: ArtifactContract, step: number = 1) => {
		if (step > backflowLimit) {
			console.log(`[WORKER] Backflow propagation limit reached, not following further`);
			return;
		}

		const parent = await jf.getUpstreamContract(contract);
		if (parent) {
			await jf.updateBackflow(contract, parent);
			await propagate(parent, step + 1);
		}
	}

	await propagate(inputContract);
}
