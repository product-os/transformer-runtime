import TransformerRuntime from '../../lib';
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';
import { Contract } from '@balena/jellyfish-types/build/core';
import testTransformer from './test-transformer';

const runtime = new TransformerRuntime(`-----BEGIN RSA PRIVATE KEY-----
MIIBOgIBAAJBAJxYRmueLGNBHjcrJk+8sIVdmkDrA3VWXrAQIMty3e9De+pFKPp/
p5ikvmhfPAiIOfTZ2vraMLJqicOmEAa/N4kCAwEAAQJAMng8o1j4M0I+IskHIQ5k
XWkN9o7nGuW6w1MxgvudsTKu+/+k9cvT3v+/GtpPpFjlPj2cZzHzU6ovkVXgxIX8
AQIhAP0ALhNqzLoD7rSWu8p68XyW1VABi5PlCaWWF3xhObthAiEAnjLCOSsDNRXa
aVVrwCy6rvQs+akHCxd20621d37pVSkCIGe4zyr+uff47L/0nACi7qXZYJJwT7zO
RWoxYmeHpJeBAiA7/B8tMiQLMvgYTK2Itu0qfae4GuFy0TjbVtiiMNsk0QIhAL2a
cA6N5gOEukVpnD/plpDmI5NmPSXZaxevCoZyIxoZ
-----END RSA PRIVATE KEY-----`);

const img = 'test-transformer';
const version = 'latest';

const artifactDir = path.join(__dirname, 'artifacts');
const workingDir = path.join(__dirname, 'in');
const transformerImage = `${img}:${version}`;
const outputDir = path.join(__dirname, 'out');
const runPrivileged = true;
const content = fs
	.readFileSync(path.join(artifactDir, '/balena.yml'))
	.toString();
const contract = yaml.load(content) as Contract;

test('Integration test', async () => {
	console.log('[TEST] Running integration test...');
	const outputManifest = await runtime.runTransformer(
		artifactDir,
		contract,
		testTransformer,
		transformerImage,
		workingDir,
		outputDir,
		runPrivileged,
	);
	const artifactContent = await fs.promises.readFile(
		path.join(artifactDir, 'thefile.txt'),
	);
	const outputContent = await fs.promises.readFile(
		path.join(outputDir, 'theoutfile.txt'),
	);
	if (artifactContent.toString() === outputContent.toString()) {
		console.log('[TEST] Passed test with test transformer!');
	} else {
		console.error('[TEST] Failed test, input and output not matching');
		console.error('[TEST] Artifact content:', artifactContent);
		console.error('[TEST] Output content:', outputContent);
	}
	expect(outputManifest.results.length).toEqual(1);
	// Cleanup
	await fs.promises.rmdir(workingDir, { recursive: true });
	await fs.promises.rmdir(outputDir, { recursive: true });
});

test('Failing integration test', async () => {
	console.log('[TEST] Running integration test...');
	const outputManifest = await runtime.runTransformer(
		path.join(__dirname, 'artifactsglehriuhgeiure'),
		contract,
		testTransformer,
		'bah',
		workingDir,
		outputDir,
		runPrivileged,
	);
	console.log('[TEST] There should be an error log above this line');
	expect(outputManifest.results[0].contract.type).toEqual('error@1.0.0');
	// Cleanup
	await fs.promises.rmdir(workingDir, { recursive: true });
	await fs.promises.rmdir(outputDir, { recursive: true });
});
