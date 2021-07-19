import TransformerRunner from "../src/index";
import { OutputManifest } from "../src/types";

// get keys on constructor
const runner = new TransformerRunner();

const inputContract = {} as any;

const transformerContract = {} as any;

const inputDir = ''
const outputDir = ''

const artsRelativeToInput: OutputManifest = runner.runTransformer({} , '') // returned
