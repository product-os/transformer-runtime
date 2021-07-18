import { ConstructorOptions, TaskContract } from "./types";
import fs from 'fs'
import { directory } from "./utils/helpers";
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
