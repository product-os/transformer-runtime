import TransformerRuntime from '../src'
import * as yaml from 'js-yaml'
import * as fs from 'fs'
import * as path from 'path'

const runtime = new TransformerRuntime()

const img = 'registry.product-os.io/transformer-product-os-source-to-image'
const version = '1.4.5'

const content = fs.readFileSync('github-integration-test/balena.yml').toString()

const contract = yaml.load(content)

async function main () {
  const result = await runtime.runTransformer(path.join(__dirname, 'in'), contract as any, contract as any, `${img}:${version}`, path.join(__dirname, 'in'), path.join(__dirname, 'out'), false)
  console.log(result)
}

main()
