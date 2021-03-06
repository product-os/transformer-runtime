import debugnyan from 'debugnyan';
import { writeFile } from 'fs/promises';
import TransformerRuntime from '../../../lib';

const runtime = new TransformerRuntime();
const defaultLogger = debugnyan('transformer-runtime-tests', {});

describe('Validation', () => {
	test('Output manifest validation - success', async () => {
		const out = await runtime.validateOutputManifest(
			{
				results: [
					{
						artifactPath: '.',
						contract: {
							id: 'thisisanid',
							version: '1.0.0',
							active: true,
							slug: 'thisisanid-slug',
							type: 'something@1.0.0',
							capabilities: [
								{
									'all of them': 'hugruyighiueyhi',
								},
							] as Array<{ [k: string]: unknown }>,
							created_at: 'now',
							markers: ['crayola'],
							requires: [{ nothing: 'torequire' }] as Array<{
								[k: string]: unknown;
							}>,
							tags: ['hey', 'ho'],
							data: {
								$transformer: {
									artifactReady: false,
								},
							},
						},
					},
				] as any, // Thanks typescript
			},
			'.',
			defaultLogger,
		);
		expect(out).toBe(undefined);
	});

	test('Output contract validation - success', async () => {
		await writeFile(
			'./output-manifest.json',
			JSON.stringify({
				results: [
					{
						artifactPath: '.',
						contract: {
							id: 'thisisanid',
							version: '1.0.0',
							active: true,
							slug: 'thisisanid-slug',
							type: 'something@1.0.0',
							capabilities: [
								{
									'all of them': 'hugruyighiueyhi',
								},
							] as Array<{ [k: string]: unknown }>,
							created_at: 'now',
							markers: ['crayola'],
							requires: [{ nothing: 'torequire' }] as Array<{
								[k: string]: unknown;
							}>,
							tags: ['hey', 'ho'],
							data: {
								$transformer: {
									artifactReady: false,
								},
							},
						},
					},
				] as any, // Thanks typescript
			}),
		);
		const out = await runtime.createOutputManifest(0, '.', defaultLogger);
		expect(out.results['0'].artifactPath).toBe('.');
	});
});
