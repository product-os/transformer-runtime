/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

import NodeRSA = require('node-rsa');
import { decryptSecrets } from '../../../lib/utils/secrets';

const key = new NodeRSA({ b: 512 });
const keyString = key.exportKey('pkcs1');

describe('decryptSecrets()', () => {
	test('should return undefined when no secrets are provided', () => {
		expect(decryptSecrets('foobar', undefined)).toBe(undefined);
	});

	test('should return secrets as is when key is not provided', () => {
		const secrets = {
			buz: 'baz',
		};
		expect(decryptSecrets(undefined, secrets)).toEqual(secrets);
	});

	test('should throw error on incorrect key', () => {
		expect.assertions(1);

		try {
			decryptSecrets(keyString, {
				buz: 'baz',
			});
		} catch (err) {
			expect(err.message).toEqual(
				'Error during decryption (probably incorrect key). Original error: Error: Incorrect data or key',
			);
		}
	});

	test('should decrypt secrets given the correct key', () => {
		const secret = 'baz';
		const rsaKey = new NodeRSA(keyString, 'pkcs1', {
			encryptionScheme: 'pkcs1',
		});
		expect(
			decryptSecrets(keyString, {
				buz: rsaKey.encrypt(Buffer.from(secret), 'base64'),
			}),
		).toEqual({
			buz: secret,
		});
	});
});
