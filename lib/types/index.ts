import { ContractData, Contract } from '@balena/jellyfish-types/build/core';
interface TaskData extends ContractData {
	actor: string;
	input: ArtifactContract;
	transformer: TransformerContract;
}

export interface TaskContract extends Contract<TaskData> {}

interface ArtifactData extends ContractData {
	$transformer?: {
		artifactReady: boolean;
		baseSlug?: string;
		slugSuffix?: string; // used to allow transformers customization of generated slugs. needed when creating multiple instances of same type
		encryptedSecrets?: any;
	};
}
export interface ArtifactContract extends Contract<ArtifactData> {}

interface TransformerData extends ContractData {
	inputFilter: any;
	inputType?: 'contract-only' | 'full';
	requirements?: {
		os?: string;
		architecture?: string;
	};
	backflowMapping: [BackflowMapping];
	encryptedSecrets?: any;
}

export interface TransformerContract extends Contract<TransformerData> {}

export interface BackflowMapping {
	downstreamValue?: Formula | any;
	upstreamPath: Formula | string;
}

export interface Formula {
	$$formula: string;
}

export type InputManifest = {
	input: {
		contract: ArtifactContract;
		transformerContract: TransformerContract;
		artifactPath: string;
		decryptedSecrets?: any;
		decryptedTransformerSecrets?: any;
	};
};

export type OutputManifest = {
	results: [
		{
			contract: ArtifactContract;
			artifactPath?: string;
			imagePath?: string;
			manifestList?: string[];
		},
	];
};

// Temporary
export interface ErrorContract extends ContractData {
	name: string;
	data: { message: string; code: string; [key: string]: string };
}
