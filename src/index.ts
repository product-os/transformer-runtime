import { ConstructorOptions, OutputManifest, TaskContract } from "./types";
import fs from 'fs'
import { directory } from "./utils/helpers";
import Registry from "./lib/registry";
import env from "./utils/env";
import path from "path";
import { ContainerCreateOptions } from "dockerode";
export default class TransformerRunner {

  options: ConstructorOptions;
  registry: Registry

  constructor(options: ConstructorOptions) {
    this.options = options;
    this.registry = new Registry(options.registryHost, options.registryPort);
  }

  async cleanupWorkspace(task: TaskContract) {
    await fs.promises.rmdir(directory.input(task), { recursive: true });
    await fs.promises.rmdir(directory.output(task), { recursive: true });
  }

  // TODO: Remove task contract abstraction, use contract
  async runTransformer(): Promise<OutputManifest> {
    console.log(`[WORKER] Running transformer image ${this.options.imageRef}`);

    const docker = this.registry.docker;

    // docker-in-docker work by mounting a tmpfs for the inner volumes
    const tmpDockerVolume = `tmp-docker-${this.options.inputContract.id}`;

    //HACK - dockerode closes the stream unconditionally
    process.stdout.end = () => { }
    process.stderr.end = () => { }

    const runResult = await docker.run(
      this.options.imageRef,
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
            `${path.resolve(directory.input(this.options.inputContract))}:/input/:ro`,
            `${path.resolve(directory.output(this.options.inputContract))}:/output/`,
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

    return await this.validateOutput(this.options.inputContract, output.StatusCode);
  }

  async validateOutput(task: TaskContract, transformerExitCode: number) {
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

    await this.validateOutputManifest(outputManifest, outputDir);

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
