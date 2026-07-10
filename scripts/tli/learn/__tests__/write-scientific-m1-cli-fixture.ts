import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { computeStudyOriginScheduleSha256 } from '../offline-eval-study-lock'
import {
  buildScientificM1Fixture,
  type FixtureDriver,
} from './offline-eval-scientific-m1-fixture'

const readArg = (name: string): string => {
  const prefix = `--${name}=`
  const value = process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length)
  if (value === undefined || value.length === 0) throw new Error(`missing --${name}=...`)
  return value
}

const driver = readArg('driver')
if (driver !== 'known_signal' && driver !== 'shuffled_no_signal') {
  throw new Error(`unknown driver: ${driver}`)
}
const inputPath = readArg('input')
const lockPath = readArg('study-lock')
const study = buildScientificM1Fixture(driver satisfies FixtureDriver)
const lock = {
  studyContractId: study.dataset.manifest.study_contract_id,
  studyContractSha256: study.dataset.manifest.study_contract_sha256,
  studyOriginScheduleSha256: computeStudyOriginScheduleSha256({
    studyContractId: study.dataset.manifest.study_contract_id,
    studyContractSha256: study.dataset.manifest.study_contract_sha256,
    studyOriginSchedule: study.origins,
  }),
}

mkdirSync(dirname(inputPath), { recursive: true })
mkdirSync(dirname(lockPath), { recursive: true })
writeFileSync(inputPath, `${JSON.stringify({ scientificM1: study }, null, 2)}\n`)
writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`)
