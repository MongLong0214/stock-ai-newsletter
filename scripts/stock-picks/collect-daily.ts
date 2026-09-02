import { getLastFinalizedTradingDate } from '@/lib/tli/trading-calendar'
import {
  collectAndPersistStockDailyPriceRange,
  KIS_DAILY_PRICE_RATE_LIMIT_PER_SECOND,
  type StockDailyPriceCollectionReport,
} from '@/scripts/tli/prices/kis-daily-price-collector'

// WHY: 2026-08-28 실측 2,431종목, 683ms/콜 기준으로 상장 증가 헤드룸을 확보한다.
export const DEFAULT_DAILY_COLLECTION_CALL_BUDGET = 3000
// WHY: 2026-08-28 실측 2,431종목, 683ms/콜이 25분 deadline을 초과했다.
export const DEFAULT_DAILY_COLLECTION_DEADLINE_MS = 40 * 60 * 1000
export const DAILY_COLLECTION_TRADING_DAYS = 7

type CollectPriceRange = typeof collectAndPersistStockDailyPriceRange

export interface DailyStockPriceCollectionReport extends StockDailyPriceCollectionReport {
  readonly endDate: string
  readonly tradingDays: number
}

export const getStockPicksKisRateLimitPerSecond = (
  env: Readonly<Record<string, string | undefined>> = process.env,
): number => {
  const raw = env.STOCK_PICKS_KIS_RATE_LIMIT_PER_SECOND
  if (raw === undefined) return KIS_DAILY_PRICE_RATE_LIMIT_PER_SECOND
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 10) {
    throw new Error(`STOCK_PICKS_KIS_RATE_LIMIT_PER_SECOND는 1..10 정수여야 합니다: ${raw}`)
  }
  return parsed
}

/**
 * stock_master 활성 전종목과 KOSPI 지수를 심볼당 한 번의 기간조회로 갱신한다.
 * stock_daily_prices의 (symbol, trade_date) upsert를 사용하므로 재실행은 멱등이다.
 */
export async function collectDailyStockPrices(input: {
  readonly callBudget?: number
  readonly deadlineMs?: number
  readonly endDate?: string
  readonly collectPriceRange?: CollectPriceRange
} = {}): Promise<DailyStockPriceCollectionReport> {
  const callBudget = input.callBudget ?? DEFAULT_DAILY_COLLECTION_CALL_BUDGET
  if (!Number.isInteger(callBudget) || callBudget <= 0) {
    throw new Error(`callBudget은 양의 정수여야 합니다: ${callBudget}`)
  }
  const deadlineMs = input.deadlineMs ?? DEFAULT_DAILY_COLLECTION_DEADLINE_MS
  if (!Number.isFinite(deadlineMs) || deadlineMs <= 0) {
    throw new Error(`deadlineMs는 양수여야 합니다: ${deadlineMs}`)
  }

  const endDate = input.endDate ?? getLastFinalizedTradingDate()
  const rateLimitPerSecond = getStockPicksKisRateLimitPerSecond()
  const collectPriceRange = input.collectPriceRange ?? collectAndPersistStockDailyPriceRange
  const report = await collectPriceRange({
    endDate,
    days: DAILY_COLLECTION_TRADING_DAYS,
    universe: 'full',
    callBudget,
    rateLimitPerSecond,
    deadlineMs,
    finalizedThroughDate: endDate,
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
    console.error(`   ❌ 콜 예산/deadline으로 생략된 심볼: ${dailyReport.skippedForBudget}개`)
  }

  return dailyReport
}

const readOption = (args: readonly string[], name: string): string | undefined => {
  const inline = args.find((arg) => arg.startsWith(`${name}=`))
  if (inline) return inline.slice(name.length + 1)
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}

const readPositiveInteger = (value: string | undefined, fallback: number, name: string): number => {
  if (value === undefined) return fallback
  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name}은 양의 정수여야 합니다: ${value}`)
  return parsed
}

const printUsage = (): void => {
  console.log([
    'Usage: npx tsx scripts/stock-picks/collect-daily.ts [options]',
    '',
    'Options:',
    `  --call-budget=N  KIS 호출 예산 (기본 ${DEFAULT_DAILY_COLLECTION_CALL_BUDGET})`,
    `  --deadline-minutes=N  전체 수집 제한시간(분, 기본 ${DEFAULT_DAILY_COLLECTION_DEADLINE_MS / 60_000})`,
    '  --end-date=DATE  종료일 YYYY-MM-DD (기본 마지막 완결 거래일)',
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
        '--call-budget',
      ),
      deadlineMs: readPositiveInteger(
        readOption(args, '--deadline-minutes'),
        DEFAULT_DAILY_COLLECTION_DEADLINE_MS / 60_000,
        '--deadline-minutes',
      ) * 60_000,
      endDate: readOption(args, '--end-date'),
    }).then((report) => {
      if (report.failureCount > 0 || report.skippedForBudget > 0) process.exitCode = 1
    }).catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exit(1)
    })
  }
}
