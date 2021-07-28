import TransformerRuntime from '../../lib';
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';
import { Contract } from '@balena/jellyfish-types/build/core';
import testTransformer from './test-transformer';

const runtime = new TransformerRuntime();

const img = 'test-transformer';
const version = 'latest';

const artifactDir = path.join(__dirname, 'artifactDir');
const workingDir = path.join(__dirname, 'in');
const transformerImage = `${img}:${version}`;
const outputDir = path.join(__dirname, 'out');
const runPrivileged = true;
const content = fs
	.readFileSync(path.join(artifactDir, '/balena.yml'))
	.toString();
const contract = yaml.load(content) as Contract;

export async function integrationTest() {
  console.log('[TEST] Running integration test...')
	await runtime.runTransformer(
		artifactDir,
		contract,
		testTransformer,
		transformerImage,
		workingDir,
		outputDir,
		runPrivileged,
	);
  const artifactContent = await fs.promises.readFile(path.join(artifactDir, 'thefile.txt'))
  const outputContent = await fs.promises.readFile(path.join(outputDir, 'theoutfile.txt'))
  if (artifactContent.toString() === outputContent.toString()) {
    console.log('[TEST] Passed test with test transformer!')
  } else {
    console.error('[TEST] Failed test, input and output not matching')
    console.error('[TEST] Artifact content:', artifactContent)
    console.error('[TEST] Output content:', outputContent)
  }
}
