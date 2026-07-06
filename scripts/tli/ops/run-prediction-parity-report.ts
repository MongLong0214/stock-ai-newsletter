process.env.DOTENV_CONFIG_QUIET = 'true'

import { config } from 'dotenv'
import { getKSTDateString } from '@/lib/tli/date-utils'
import { loadPredictionParityReport } from '@/scripts/tli/comparison/prediction-parity-loader'

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
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
