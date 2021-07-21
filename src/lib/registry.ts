import Docker from 'dockerode';
import spawn from '@ahmadnassri/spawn-promise';
import * as fs from 'fs';
import { streamToPromise } from '../utils/helpers';


const isLocalRegistry = (registryUri: string) => !registryUri.includes('.') || registryUri.includes(".local");

export interface RegistryAuthOptions {
	username: string;
	password: string;
}

export default class Registry {
	public readonly registryUrl: string;
	public readonly docker: Docker;

	constructor(registryHost: string, registryPort?: string) {
		this.registryUrl = registryPort
			? `${registryHost}:${registryPort}`
			: registryHost;
		this.docker = new Docker();
	}


	public async pullArtifact(artifactReference: string, destDir: string, opts: RegistryAuthOptions) {
		console.log(`[WORKER] Pulling artifact ${artifactReference}`);
		try {
			const output = await this.runOrasCommand([
				`pull`,
				artifactReference,
			], opts, { cwd: destDir });

			const m = output.match(/Downloaded .* (.*)/);
			if (m[1]) {
				return m[1];
			} else {
				throw new Error(
					'[ERROR] Could not determine what was pulled from the registry',
				);
			}
		} catch (e) {
			this.logErrorAndThrow(e);
		}
	}

	public async pushArtifact(artifactReference: string, artifactPath: string, opts: RegistryAuthOptions) {
		console.log(`[WORKER] Pushing artifact ${artifactReference}`);
		try {
			const artifacts = await fs.promises.readdir(artifactPath);
			const orasCmd = [
				`push`,
				artifactReference,
				...artifacts
			];
			await this.runOrasCommand(orasCmd, opts, { cwd: artifactPath });
		} catch (e) {
			this.logErrorAndThrow(e);
		}
	}

	public async pushManifestList(artifactReference: string, manifestList: string[], authOptions: RegistryAuthOptions) {
		const localRegistry = isLocalRegistry(this.registryUrl);
		const insecureOpts = localRegistry ? ['--insecure'] : [];
		const fqManifestList = manifestList.map(img => `${this.registryUrl}/${img}`);

		let fqArtifactReference = artifactReference;
		if (localRegistry) {
			const [host, path] = artifactReference.split('/', 2);
			fqArtifactReference = `${host}:80/${path}`;
		}

		console.log(`[WORKER] creating manifest list for ${fqArtifactReference}`);
		await this.runDockerCliCommand(['manifest', 'create', ...insecureOpts, fqArtifactReference, ...fqManifestList], authOptions);

		console.log(`[WORKER] pushing manifest list for ${fqArtifactReference}`);
		await this.runDockerCliCommand(['manifest', 'push', ...insecureOpts, fqArtifactReference], authOptions);
	}

	// login cache to prevent unnecessary logins for the same user
	dockerLogins = new Set<string>();

	private async runDockerCliCommand(args: string[], opts: RegistryAuthOptions, spawnOptions: any = {}) {
		console.log(`Docker-CLI command: \ndocker ${args.join(' ')}`);
		const run = async(args: string[], spawnOptions: any = {}) => {
			const streams = await spawn(`docker`, args, spawnOptions);
			const stdout = streams.stdout.toString('utf8');
			const stderr = streams.stderr.toString('utf8');
			return {stdout, stderr};
		}
		if (!this.dockerLogins.has(opts.username)) {
			const loginCmd = ['login', '--username', opts.username, '--password', opts.password, this.registryUrl];
			this.dockerLogins.add(opts.username);
			const {stdout, stderr} = await run(loginCmd, spawnOptions);
			console.log(`Docker login:`, {stdout, stderr});
		}
		return await run(args, spawnOptions);
	}

	private async runOrasCommand(args: string[], opts: RegistryAuthOptions, spawnOptions: any = {}) {
		if (isLocalRegistry(this.registryUrl)) {
			// this is a local name. therefore we allow http
			args.push('--plain-http');
		}
		console.log(`Oras command: \n${args.concat(' ')}`);
		if (opts.username) {
			args.push('--username');
			args.push(opts.username);
			args.push('--password');
			args.push(opts.password);
		}
		const streams = await spawn(`oras`, args, spawnOptions);
		const output = streams.stdout.toString('utf8');
		console.log(`Oras output: ${output}`);
		return output;
	}

	private logErrorAndThrow = (e: any) => {
		if (e.spawnargs) {
			console.error(e.spawnargs);
			console.error(e.stderr.toString('utf8'));
		} else {
			console.error(e);
		}
		throw e;
	};

	private async loadImage(imageFilePath: string) {
		const loadImageStream = await this.docker.loadImage(fs.createReadStream(imageFilePath));
		const loadResult = await streamToPromise(loadImageStream);

		// docker.load example output:
		// Loaded image: myApp/myImage
		// Loaded image ID: sha256:1247839245789327489102473
		const successfulLoadRegex = /Loaded image.*?: (\S+)\\n/i;
		const loadResultMatch = successfulLoadRegex.exec(loadResult);
		if (!loadResultMatch) {
			throw new Error(`Failed to load image : ${imageFilePath} .  ${loadResult}`);
		}
		const image = this.docker.getImage(loadResultMatch[1]);

		return image;
	}
}
