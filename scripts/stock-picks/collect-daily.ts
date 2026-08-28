import { getKSTDateString } from '@/lib/tli/date-utils'
import {
  collectAndPersistStockDailyPriceRange,
  KIS_DAILY_PRICE_RATE_LIMIT_PER_SECOND,
  type StockDailyPriceCollectionReport,
} from '@/scripts/tli/prices/kis-daily-price-collector'

export const DEFAULT_DAILY_COLLECTION_CALL_BUDGET = 2600
export const DAILY_COLLECTION_TRADING_DAYS = 7

type CollectPriceRange = typeof collectAndPersistStockDailyPriceRange

export interface DailyStockPriceCollectionReport extends StockDailyPriceCollectionReport {
  readonly endDate: string
  readonly tradingDays: number
}

/**
 * stock_master 활성 전종목과 KOSPI 지수를 심볼당 한 번의 기간조회로 갱신한다.
 * stock_daily_prices의 (symbol, trade_date) upsert를 사용하므로 재실행은 멱등이다.
 */
export async function collectDailyStockPrices(input: {
  readonly callBudget?: number
  readonly endDate?: string
  readonly collectPriceRange?: CollectPriceRange
} = {}): Promise<DailyStockPriceCollectionReport> {
  const callBudget = input.callBudget ?? DEFAULT_DAILY_COLLECTION_CALL_BUDGET
  if (!Number.isInteger(callBudget) || callBudget <= 0) {
    throw new Error(`callBudget은 양의 정수여야 합니다: ${callBudget}`)
  }

  const endDate = input.endDate ?? getKSTDateString()
  const collectPriceRange = input.collectPriceRange ?? collectAndPersistStockDailyPriceRange
  const report = await collectPriceRange({
    endDate,
    days: DAILY_COLLECTION_TRADING_DAYS,
    universe: 'full',
    callBudget,
    rateLimitPerSecond: KIS_DAILY_PRICE_RATE_LIMIT_PER_SECOND,
  })
  const dailyReport: DailyStockPriceCollectionReport = {
    ...report,
    endDate,
    tradingDays: DAILY_COLLECTION_TRADING_DAYS,
  }

  console.log(JSON.stringify({ event: 'stock_daily_collection', ...dailyReport }))
  if (dailyReport.failedSymbols.length > 0) {
    console.error(`   ❌ 일봉 수집 실패 심볼 ${dailyReport.failedSymbols.length}개: ${dailyReport.failedSymbols.join(', ')}`)
  }
  if (dailyReport.skippedForBudget > 0) {
    console.error(`   ❌ 콜 예산으로 생략된 심볼: ${dailyReport.skippedForBudget}개`)
  }

  return dailyReport
}

const readOption = (args: readonly string[], name: string): string | undefined => {
  const inline = args.find((arg) => arg.startsWith(`${name}=`))
  if (inline) return inline.slice(name.length + 1)
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}

const readPositiveInteger = (value: string | undefined, fallback: number): number => {
  if (value === undefined) return fallback
  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`--call-budget은 양의 정수여야 합니다: ${value}`)
  return parsed
}

const printUsage = (): void => {
  console.log([
    'Usage: npx tsx scripts/stock-picks/collect-daily.ts [options]',
    '',
    'Options:',
    `  --call-budget=N  KIS 호출 예산 (기본 ${DEFAULT_DAILY_COLLECTION_CALL_BUDGET})`,
    '  --end-date=DATE  종료일 YYYY-MM-DD (기본 오늘 KST)',
  ].join('\n'))
}

const isDirectRun = /collect-daily\.(?:ts|js)$/.test(process.argv[1] ?? '')
if (isDirectRun) {
  const args = process.argv.slice(2)
  if (args.includes('--help') || args.includes('-h')) {
    printUsage()
  } else {
    collectDailyStockPrices({
      callBudget: readPositiveInteger(
        readOption(args, '--call-budget'),
        DEFAULT_DAILY_COLLECTION_CALL_BUDGET,
      ),
      endDate: readOption(args, '--end-date'),
    }).then((report) => {
      if (report.failureCount > 0 || report.skippedForBudget > 0) process.exitCode = 1
    }).catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exit(1)
    })
  }
}
