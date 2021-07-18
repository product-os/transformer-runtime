import { Contract } from "@balena/jellyfish-types/build/core";
import env from "../utils/env";

export function createArtifactReference ({ slug, version }: Contract) {
	let registryPort = "";
	if (env.registryPort) {
		registryPort = `:${env.registryPort}`;
	}
	return `${env.registryHost}${registryPort}/${slug}:${version}`;
}
