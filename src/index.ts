import NodeRSA = require('node-rsa')
import env from './utils/env'
import path from 'path'
import { TaskContract } from './types';

const secretsKey = env.secretKey ?
	new NodeRSA(Buffer.from(env.secretKey, 'base64').toString('utf-8'), 'pkcs1', { encryptionScheme: 'pkcs1' })
	: undefined

const directory = {
    input: (task: TaskContract) => path.join(env.inputDir, `task-${task.id}`),
    output: (task: TaskContract) => path.join(env.outputDir, `task-${task.id}`),
  };


/**
 * This function takes an object tree with all string values expected to be
 * base64 encoded secrets and returns the same tree with the values decrypted
 * but again base64 encoded.
 * (The latter allows passing binary secrets as well)
 *
 * @param encryptedSecrets object that only contains string values or other encryptedSecrets objects
 */
 export function decryptSecrets(secretsKey: NodeRSA | undefined, sec: any): any {
	if (!sec) {
		return undefined;
	}
	if (!secretsKey) {
		console.log(`WARN: no secrets key provided! Will pass along secrets without decryption. Should not happen in production`)
		return sec;
	}
	let result: any = {};
	for (const key of Object.keys(sec)) {
		const val = sec[key];
		if (typeof val === 'string') {
			result[key] = secretsKey.decrypt(val, 'base64');
		} else if (typeof val === 'object') {
			result[key] = exports.decryptSecrets(secretsKey, val);
		} else {
			console.log(`WARN: unknown type in secrets for key ${key}`)
		}
	}
	return result
}
