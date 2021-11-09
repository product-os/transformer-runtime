import {
	ContractData,
	Contract,
	ContractDefinition,
} from '@balena/jellyfish-types/build/core';
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
	secondaryInput?: Array<{
		contract: Contract<any>;
		artifactPath: string;
	}>;
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
export interface ErrorData extends ContractData {
	message: string;
	code: string;
}
export interface ErrorContract
	extends Omit<ContractDefinition<ErrorData>, 'slug'> {}
