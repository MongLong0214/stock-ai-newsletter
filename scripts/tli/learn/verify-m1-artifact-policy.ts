import { readFileSync } from 'node:fs'

import { parseM1ModelArtifact } from '../../../lib/tli/model/predict'

const prefix = '--artifact='
const path = process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length)
if (path === undefined || path.length === 0) throw new Error('usage: --artifact=<path>')

try {
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
  const artifact = parseM1ModelArtifact(parsed)
  process.stdout.write(`${artifact.artifact_version}\n`)
} catch (error) {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : error instanceof Error ? error.message : String(error)
  process.stderr.write(`${code}\n`)
  process.exitCode = 1
}
