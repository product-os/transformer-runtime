import * as fs from 'fs';
import { F_OK } from 'constants';
import { Formula, TaskContract } from '../types';
import NodeRSA = require('node-rsa')
import path from 'path'
import env from './env';
const jellyscript = require('@balena/jellyfish-jellyscript');


export const pathExists = async (path: string) => {
    try {
        await fs.promises.access(path, F_OK);
        return true;
    } catch {
        return false;
    }
}

export function streamToPromise(stream: NodeJS.ReadableStream): Promise<string> {
    return new Promise((resolve, reject) => {
        let buf = '';
        stream.on('data', (d) => (buf += d.toString()));
        stream.on('end', () => resolve(buf));
        stream.on('error', reject);
    });
}

export function evaluateFormulaOrValue(formulaOrValue: Formula | any, context: any) {
    if(formulaOrValue.$$formula) {
        try {
            const result = jellyscript.evaluate(formulaOrValue.$$formula, {
                context
            });
            return result?.value;
        }
        catch(e) {
            if(e.message) {
                e.message = `Formula eval error: ${e.message}`;
            }
            throw e;
        }
    } else {
        return formulaOrValue;
    }
}

export const secretsKey = env.secretKey ?
	new NodeRSA(Buffer.from(env.secretKey, 'base64').toString('utf-8'), 'pkcs1', { encryptionScheme: 'pkcs1' })
	: undefined

export const directory = {
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
