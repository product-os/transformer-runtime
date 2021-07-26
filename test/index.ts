import TransformerRuntime from '../src';
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';
import { Contract } from '@balena/jellyfish-types/build/core';
import testTransformer from './test-transformer';

const runtime = new TransformerRuntime();

const img = 'registry.product-os.io/transformer-product-os-source-to-image';
const version = '1.4.9';

const artifactDir = path.join(__dirname, '..', 'github-integration-test');
const workingDir = path.join(__dirname, 'in');
const transformerImage = `${img}:${version}`;
const outputDir = path.join(__dirname, 'out');
const runPrivileged = true;
const content = fs
	.readFileSync(path.join(artifactDir, '/balena.yml'))
	.toString();
const contract = yaml.load(content) as Contract;

async function main() {
	const result = await runtime.runTransformer(
		artifactDir,
		contract,
		testTransformer,
		transformerImage,
		workingDir,
		outputDir,
		runPrivileged,
	);
	console.log(result);
}

main();
