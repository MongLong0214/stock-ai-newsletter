import { config } from 'dotenv'
config({ path: '.env.local' })

import { getKSTDateString } from '@/lib/tli/date-utils'
import {
  backfillRecentStockDailyPrices,
  DEFAULT_KIS_DAILY_PRICE_CALL_BUDGET,
} from '@/scripts/tli/prices/kis-daily-price-collector'

function readPositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

async function main(): Promise<void> {
  const endDate = process.env.TLI_STOCK_BACKFILL_END_DATE ?? getKSTDateString()
  const days = readPositiveInteger(process.env.TLI_STOCK_BACKFILL_DAYS, 30)
  const callBudget = readPositiveInteger(
    process.env.TLI_STOCK_BACKFILL_CALL_BUDGET,
    DEFAULT_KIS_DAILY_PRICE_CALL_BUDGET,
  )
  const report = await backfillRecentStockDailyPrices({ endDate, days, callBudget })
  console.log(JSON.stringify(report))
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
