/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

const fs = require('fs/promises')
const path = require('path')
const logger = require('./logger')

const getEnvOrFail = (envVar) => {
	const env = process.env[envVar]
	if (!env) {
		logger.log(`required env var ${envVar} was not set`)
		process.exit(1)
	}
	return env
}

async function main () {
  logger.log('Starting test tranformer')

  const inputPath = getEnvOrFail('INPUT')
  const outputPath = getEnvOrFail('OUTPUT')

  const inDir = path.dirname(inputPath)
  const outDir = path.dirname(outputPath)

  const outArtifactPath = path.join(outDir, 'artifact.tar')

  const input = JSON.parse(await fs.readFile(inputPath)).input

  const outContract = input.contract.data.fragment

  logger.info('Input path', path.join(inDir, 'artifact', 'thefile.txt'))

  const inFile = await fs.readFile(path.join(inDir, 'artifact', 'thefile.txt'))

  await fs.writeFile(path.join(outDir, 'theoutfile.txt'), inFile.toString())

  const result = {
		results: [
			{
				contract: outContract,
				imagePath: path.relative(outDir, outArtifactPath),
			},
		],
	}

  logger.log('Result', result)
  await fs.writeFile(outputPath, JSON.stringify(result))
}

main()
