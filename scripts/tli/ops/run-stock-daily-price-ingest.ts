import { config } from 'dotenv'
config({ path: '.env.local' })

import { getKSTDateString } from '@/lib/tli/date-utils'
import {
  collectDailyStockPricesForDate,
  DEFAULT_KIS_DAILY_PRICE_CALL_BUDGET,
  type StockDailyPriceUniverse,
} from '@/scripts/tli/prices/kis-daily-price-collector'

function readOption(args: readonly string[], name: string): string | undefined {
  return args.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1)
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`양의 정수가 필요합니다: ${value}`)
  }
  return parsed
}

function readUniverse(value: string | undefined): StockDailyPriceUniverse {
  if (value === undefined || value === 'theme') return 'theme'
  if (value === 'full') return 'full'
  throw new Error(`지원하지 않는 universe입니다: ${value}`)
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const tradeDate = process.env.TLI_STOCK_PRICE_DATE ?? getKSTDateString()
  const universe = readUniverse(readOption(args, '--universe') ?? process.env.TLI_STOCK_PRICE_UNIVERSE)
  const callBudget = readPositiveInteger(
    readOption(args, '--call-budget') ?? process.env.TLI_STOCK_PRICE_CALL_BUDGET,
    DEFAULT_KIS_DAILY_PRICE_CALL_BUDGET,
  )
  const report = await collectDailyStockPricesForDate(tradeDate, { universe, callBudget })
  console.log(JSON.stringify(report))
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
