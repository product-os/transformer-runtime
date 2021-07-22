import { ArtifactContract, ConstructorOptions, InputManifest, OutputManifest, TaskContract, TransformerContract } from "./types";
import * as fs from 'fs'
import { decryptSecrets } from "./utils/helpers";
import * as path from "path";
import * as Dockerode from "dockerode";
import { Contract } from "@balena/jellyfish-types/build/core";
export default class TransformerRuntime {

  decryptionKey: string
  docker: Dockerode

  constructor(decryptionKey: string) {
    this.decryptionKey = decryptionKey;
    this.docker = new Dockerode()
  }

  async runTransformer(artifactDirectory: string, inputContract: Contract<any>, transformerContract: TransformerContract, imageRef: string, inputDirectory: string, outputDirectory: string, privileged: boolean): Promise<OutputManifest> {

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

    //HACK - dockerode closes the stream unconditionally
    process.stdout.end = () => { }
    process.stderr.end = () => { }

    const runResult = await docker.run(
      imageRef,
      [],
      [process.stdout, process.stderr],
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

    console.log(3)

    const output = runResult[0];
    const container = runResult[1];

    await docker.getContainer(container.id).remove({force: true})
    await docker.getVolume(tmpDockerVolume).remove({force: true})

    console.log("[WORKER] run result", JSON.stringify(runResult));

    return await this.validateOutput(output.StatusCode, outputDirectory);
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
