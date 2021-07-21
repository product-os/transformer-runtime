import { ConstructorOptions, InputManifest, OutputManifest, TaskContract } from "./types";
import fs from 'fs'
import { decryptSecrets } from "./utils/helpers";
import env from "./utils/env";
import path from "path";
import Dockerode, { ContainerCreateOptions } from "dockerode";
export default class TransformerRunner {

  options: ConstructorOptions;
  docker: Dockerode

  constructor(options: ConstructorOptions) {
    this.options = options;
    this.docker = new Dockerode()
  }

  // TODO: Remove task contract abstraction, use contract
  async runTransformer(): Promise<OutputManifest> {

    // Add input manifest
    const inputManifest: InputManifest = {
      input: {
        contract: this.options.inputContract,
        transformerContract: this.options.transformerContract,
        artifactPath: env.artifactDirectoryName,
        decryptedSecrets: decryptSecrets(this.options.decryptionKey, this.options.inputContract.data.$transformer?.encryptedSecrets),
        decryptedTransformerSecrets:  decryptSecrets(this.options.decryptionKey,  this.options.transformerContract.data.encryptedSecrets),
      },
    };

    await fs.promises.writeFile(
      path.join(this.options.inputDirectory, env.inputManifestFilename),
      JSON.stringify(inputManifest, null, 4),
      'utf8',
    );

    console.log(`[WORKER] Running transformer image ${this.options.transformerImageRef}`);

    const docker = this.docker;

    // docker-in-docker work by mounting a tmpfs for the inner volumes
    const tmpDockerVolume = `tmp-docker-${this.options.inputContract.id}`;

    //HACK - dockerode closes the stream unconditionally
    process.stdout.end = () => { }
    process.stderr.end = () => { }

    const runResult = await docker.run(
      this.options.transformerImageRef,
      [],
      [process.stdout, process.stderr],
      {
        Tty: false,
        Env: [
          // `INPUT=/input/${env.inputManifestFilename}`,
          `INPUT=${this.options.inputDirectory}/input.json`,
          `OUTPUT=${this.options.outputDirectory}/output.json`,
        ],
        Volumes: {
          '/input/': {},
          '/output/': {},
          '/var/lib/docker': {} // if the transformers uses docker-in-docker, this is required
        },
        HostConfig: {
          Init: true, // should ensure that containers never leave zombie processes
          Privileged: this.options.privileged, //TODO: this should at least only happen for Transformers that need it
          Binds: [
            `${path.resolve(this.options.inputDirectory)}:/input/:ro`,
            `${path.resolve(this.options.outputDirectory)}:/output/`,
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

    return await this.validateOutput(output.StatusCode);
  }

  async validateOutput(transformerExitCode: number) {
    console.log(`[WORKER] Validating transformer output`);

    if (transformerExitCode !== 0) {
      throw new Error(
        `Transformer exited with non-zero status code: ${transformerExitCode}`,
      );
    }

    let outputManifest;
    try {
      outputManifest = JSON.parse(
        await fs.promises.readFile(
          path.join(this.options.outputDirectory, env.outputManifestFilename),
          'utf8',
        ),
      ) as OutputManifest;
    } catch (e) {
      e.message = `Could not load output manifest: ${e.message}`;
      throw e;
    }

    await this.validateOutputManifest(outputManifest, this.options.outputDirectory);

    return outputManifest;
  }

  async  validateOutputManifest(
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
}
