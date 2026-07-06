import { config } from 'dotenv'
config({ path: '.env.local' })

import { getKSTDateString } from '@/lib/tli/date-utils'
import { collectDailyStockPricesForDate } from '@/scripts/tli/prices/kis-daily-price-collector'

async function main(): Promise<void> {
  const tradeDate = process.env.TLI_STOCK_PRICE_DATE ?? getKSTDateString()
  const report = await collectDailyStockPricesForDate(tradeDate)
  console.log(JSON.stringify(report))
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
