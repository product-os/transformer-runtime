# ProductOS Transformer Runtime Package

This package serves to be an un-opinionated runner of transformers. This package allows you to obtain the minimal functionality to run a transformer by providing input, artifact, and output targets.

## Example Usage

Run a transformer of image `example-image:latest`:

```js
import TransformerRuntime from '../src';
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';
import { Contract } from '@balena/jellyfish-types/build/core';
import testTransformer from './test-transformer';

const runtime = new TransformerRuntime();

const img = 'example-image';
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
}

main().catch(err => {
	console.log("error executing your transformer:", err);
	process.exit(1);
});
```

## Create your own transformer

You can follow the tutorial [here](https://docs.google.com/document/d/1iPsyXBjnvzG25hNHztIFsUcLDM1gSAIhNTHJDY8pZJ0/) to create your own transformer.
