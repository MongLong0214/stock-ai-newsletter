process.env.DOTENV_CONFIG_QUIET = 'true'

import { config } from 'dotenv'
import { getKSTDateString } from '@/lib/tli/date-utils'
import { loadPredictionParityReport } from '@/scripts/tli/comparison/prediction-parity-loader'
import {
  SCIENTIFIC_GATE_EXIT,
  classifyPredictionParitySeverity,
  scientificGateExitCode,
} from './scientific-gate-exit'

config({ path: '.env.local' })

function readPositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

async function main(): Promise<void> {
  const asOfDate = process.env.TLI_PARITY_AS_OF_DATE ?? getKSTDateString()
  const windowDays = readPositiveInteger(process.env.TLI_PARITY_WINDOW_DAYS, 14)
  const report = await loadPredictionParityReport({ asOfDate, windowDays })
  console.log(JSON.stringify(report))
  // severity는 stdout JSON 형태를 바꾸지 않고 exit code로만 노출한다 (scientific-gate-exit 규약).
  process.exitCode = scientificGateExitCode(classifyPredictionParitySeverity(report))
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(SCIENTIFIC_GATE_EXIT.operationalFailure)
})
