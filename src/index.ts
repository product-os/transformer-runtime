import { ConstructorOptions, TaskContract } from "./types";
import fs from 'fs'
import { directory } from "./utils/helpers";
import { prepareWorkspace, processBackflow, pullTransformer, pushOutput, runTransformer, validateOutput } from "./lib/transformer";
import registry from "./lib/registry";
import env from "./utils/env";
import path from "path";
import { ContainerCreateOptions } from "dockerode";
export default class TransformerRunner {

  options: ConstructorOptions;

  constructor(options: ConstructorOptions) {
    this.options = options;
  }

  async cleanupWorkspace(task: TaskContract) {
    await fs.promises.rmdir(directory.input(task), { recursive: true });
    await fs.promises.rmdir(directory.output(task), { recursive: true });
  }

  async runTask(task: TaskContract) {
    console.log(`[WORKER] Running task ${task.slug}`);

    await this.validateTask(task);

    // The actor is the loop, and to start with that will always be product-os
    const actorCredentials = await jf.getActorCredentials(task.data.actor);

    await prepareWorkspace(task, actorCredentials);

    const transformerImageRef = await pullTransformer(task, actorCredentials);

    const transformerExitCode = await runTransformer(task, transformerImageRef);

    const outputManifest = await validateOutput(task, transformerExitCode);

    await pushOutput(task, outputManifest, actorCredentials);

    await processBackflow(task, outputManifest);

    await this.cleanupWorkspace(task);

    console.log(`[WORKER] Task ${task.slug} completed successfully`);
  }

  async runTransformer(task: TaskContract, transformerImageRef: string) {
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
          Privileged: this.options.privileged, //TODO: this should at least only happen for Transformers that need it
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

  async validateTask(task: TaskContract) {
    // this could be simplified with e.g. https://github.com/PicnicSupermarket/aegis
    const message = 'Task validation error: ';
    if (!task?.id || task?.id === '') {
      throw new Error(`${message} missing id`);
    }

    if (!task?.data) {
      throw new Error(`${message} missing data property`);
    }

    if (!task?.data?.actor || task?.id === '') {
      throw new Error(`${message} missing actor property`);
    }

    if (!task?.data?.input) {
      throw new Error(`${message} missing input contract`);
    }

    if (!task?.data?.transformer) {
      throw new Error(`${message} missing transformer`);
    }
  }
}
