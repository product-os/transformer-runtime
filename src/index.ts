import { ArtifactContract, ConstructorOptions, InputManifest, OutputManifest, TaskContract, TransformerContract } from "./types";
import * as fs from 'fs'
import { decryptSecrets } from "./utils/helpers";
import * as path from "path";
import * as Dockerode from "dockerode";
import { Contract } from "@balena/jellyfish-types/build/core";
import * as stream from 'stream'
export default class TransformerRuntime {

  decryptionKey: string
  docker: Dockerode

  constructor(decryptionKey: string) {
    this.decryptionKey = decryptionKey;
    this.docker = new Dockerode()
  }

  async runTransformer(artifactDirectory: string, inputContract: Contract<any>, transformerContract: TransformerContract, imageRef: string, inputDirectory: string, outputDirectory: string, privileged: boolean, labels?: { [key: string]: any }): Promise<OutputManifest> {

    // Add input manifest
    const inputManifest: InputManifest = {
      input: {
        contract: inputContract,
        transformerContract,
        artifactPath: artifactDirectory,
        decryptedSecrets: decryptSecrets(this.decryptionKey, inputContract.data.$transformer?.encryptedSecrets),
        decryptedTransformerSecrets:  decryptSecrets(this.decryptionKey,  transformerContract.data.encryptedSecrets),
      },
    };

    await fs.promises.writeFile(
      path.join(inputDirectory, 'inputManifest.json'),
      JSON.stringify(inputManifest, null, 4),
      'utf8',
    );

    // Make sure output directory exists
    try {
      await (await fs.promises.stat(outputDirectory)).isDirectory()
    } catch (e) {
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
    let container: any
    try {
      // Use our own streams that hook into stdout and stderr
      const stdoutStream = new stream.PassThrough()
      const stderrStream  = new stream.PassThrough()

      stdoutStream.on('data', (data: Buffer) => {
        process.stdout.write(data.toString('utf8'))
      })

      stderrStream.on('data', (data: Buffer) => {
        process.stderr.write(data.toString('utf8'))
      })

      const runResult = await docker.run(
        imageRef,
        [],
        [stdoutStream, stderrStream],
        {
          Tty: false,
          Env: [
            `INPUT=${inputDirectory}/input.json`,
            `OUTPUT=${outputDirectory}/output.json`,
          ],
          Volumes: {
            '/input/': {},
            '/output/': {},
            '/var/lib/docker': {} // if the transformers uses docker-in-docker, this is required
          },
          Labels: {
            'io.balena.image': 'true',
            ...labels
          },
          HostConfig: {
            Init: true, // should ensure that containers never leave zombie processes
            Privileged: privileged,
            Binds: [
              `${path.resolve(inputDirectory)}:/input/:ro`,
              `${path.resolve(outputDirectory)}:/output/`,
              `${tmpDockerVolume}:/var/lib/docker`,
            ],
          },
        } as Dockerode.ContainerCreateOptions,
      );

      const output = runResult[0];
      container = runResult[1];

      stdoutStream.end()
      stderrStream.end()

      console.log("[WORKER] run result", JSON.stringify(runResult));

      return await this.validateOutput(output.StatusCode, outputDirectory);
    } catch (error) {
      console.error("[WORKER] ERROR RUNNING TRANSFORMER:")
      throw error
    } finally {
      await this.cleanup()
    }

  }

  async cleanup() {
    const docker = new Dockerode();
    const containers = await docker.listContainers({all: true, filters: {label: 'io.balena.image'}});
    console.log(`[WORKER] Removing ${containers.length} containers`);
    await Promise.all(containers.map(container => docker.getContainer(container.Id).remove({force: true})));
    const volumes = await docker.listVolumes({filters: {label: 'io.balena.image'}});
    console.log(`[WORKER] Removing ${volumes.Volumes.length} volumes`);
    await Promise.all(volumes.Volumes.map(volume => docker.getVolume(volume.Name).remove({force: true})));
  }

  async validateOutput(transformerExitCode: number, outputDirectory: string) {
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
          path.join(outputDirectory, 'outputManifest.json'),
          'utf8',
        ),
      ) as OutputManifest;
    } catch (e) {
      e.message = `Could not load output manifest: ${e.message}`;
      throw e;
    }

    await this.validateOutputManifest(outputManifest, outputDirectory);

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
