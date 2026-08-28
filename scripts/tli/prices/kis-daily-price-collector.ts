import { getDailyRangeClosePrices, getIndexDailyRangeClosePrices, type KisDailyRangePricePoint } from '@/app/archive/_utils/api/kis/client'
import { isKoreanTradingDate } from '@/lib/tli/trading-calendar'
import {
  KOSPI_INDEX_SYMBOL,
  loadActiveStockMasterSymbols,
  loadActiveThemeStockSymbols,
  upsertStockDailyPrices,
  type StockDailyPriceInput,
} from '@/scripts/tli/prices/stock-daily-prices'

export const DEFAULT_KIS_DAILY_PRICE_CALL_BUDGET = 1000
export const KIS_DAILY_PRICE_RATE_LIMIT_PER_SECOND = 2
export type StockDailyPriceUniverse = 'theme' | 'full'

/** KOSPI 지수 조회용 KIS 업종 코드 (0001 = 코스피) */
const KOSPI_INDEX_CODE = '0001'

export interface StockDailyPriceCollectionReport {
  readonly callBudget: number
  readonly rateLimitPerSecond: number
  /** 요청 대상 심볼 수 (KOSPI 지수 포함) */
  readonly requestedRows: number
  /** budget 내에서 실제로 시도한 심볼(콜) 수 */
  readonly attemptedCalls: number
  /** 1건 이상의 거래일 데이터를 확보한 심볼 수 */
  readonly successCount: number
  /** 조회 실패 또는 매칭되는 거래일 데이터가 0건인 심볼 수 */
  readonly failureCount: number
  readonly skippedForBudget: number
  readonly persistedRows: number
  readonly successRate: number
  /** 요청한 거래일 수 대비 실제 1건 이상 적재된 고유 거래일 수 비율 */
  readonly dateCoverageRate: number
}

type FetchDailyRangeClosePrices = (symbol: string, startKisDate: string, endKisDate: string) => Promise<KisDailyRangePricePoint[]>
type PersistDailyPrices = (rows: readonly StockDailyPriceInput[]) => Promise<number>
type LoadSymbols = () => Promise<string[]>

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function toKisDate(tradeDate: string): string {
  return tradeDate.replace(/-/g, '')
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

export function getRecentTradingDates(input: {
  readonly endDate: string
  readonly days: number
}): string[] {
  const dates: string[] = []
  const cursor = new Date(`${input.endDate}T00:00:00.000Z`)

  while (dates.length < input.days) {
    const tradeDate = formatDate(cursor)
    if (isKoreanTradingDate(tradeDate)) {
      dates.push(tradeDate)
    }
    cursor.setUTCDate(cursor.getUTCDate() - 1)
  }

  return dates
}

/**
 * 심볼 단위 기간조회로 일봉(OHLCV)을 수집·적재
 *
 * PRD 원 설계: 기간조회 1콜 = 최대 100영업일. 날짜×심볼 단건 호출 대신
 * 심볼당 1콜(days일 창)로 조회해 콜 예산이 며칠 만에 소진되는 문제를 해소한다.
 * 콜 수 = 대상 심볼 수 + 1(KOSPI 지수).
 */
export async function collectAndPersistStockDailyPriceRange(input: {
  readonly endDate: string
  readonly days: number
  readonly universe?: StockDailyPriceUniverse
  readonly callBudget?: number
  readonly rateLimitPerSecond?: number
  readonly delayMs?: number
  readonly fetchDailyRangeClosePrices?: FetchDailyRangeClosePrices
  readonly fetchIndexDailyRangeClosePrices?: FetchDailyRangeClosePrices
  readonly persistDailyPrices?: PersistDailyPrices
  readonly loadSymbols?: LoadSymbols
}): Promise<StockDailyPriceCollectionReport> {
  const callBudget = input.callBudget ?? DEFAULT_KIS_DAILY_PRICE_CALL_BUDGET
  const rateLimitPerSecond = input.rateLimitPerSecond ?? KIS_DAILY_PRICE_RATE_LIMIT_PER_SECOND
  const delayMs = input.delayMs ?? Math.ceil(1000 / rateLimitPerSecond)
  const fetchDailyRangeClosePrices = input.fetchDailyRangeClosePrices ?? getDailyRangeClosePrices
  const fetchIndexDailyRangeClosePrices = input.fetchIndexDailyRangeClosePrices ?? getIndexDailyRangeClosePrices
  const persistDailyPrices = input.persistDailyPrices ?? upsertStockDailyPrices
  const loadSymbols = input.loadSymbols
    ?? (input.universe === 'full' ? loadActiveStockMasterSymbols : loadActiveThemeStockSymbols)

  const tradeDates = getRecentTradingDates({ endDate: input.endDate, days: input.days })
  const tradeDateSet = new Set(tradeDates)
  const sortedDates = [...tradeDateSet].sort()
  const startKisDate = toKisDate(sortedDates[0] ?? input.endDate)
  const endKisDate = toKisDate(input.endDate)

  const symbols = await loadSymbols()
  const uniqueSymbols = [...new Set(symbols.filter((symbol) => Boolean(symbol) && symbol !== KOSPI_INDEX_SYMBOL))]
  // GT-B 분모(KOSPI 지수)는 budget 잘림 대상에서 제외 — 항상 선두에 두어 절대 누락되지 않도록 함
  const requestedSymbols = [KOSPI_INDEX_SYMBOL, ...uniqueSymbols]
  const symbolsToAttempt = requestedSymbols.slice(0, callBudget)

  const prices: StockDailyPriceInput[] = []
  const persistedDates = new Set<string>()
  let failureCount = 0

  for (let index = 0; index < symbolsToAttempt.length; index++) {
    const symbol = symbolsToAttempt[index]
    try {
      const points = symbol === KOSPI_INDEX_SYMBOL
        ? await fetchIndexDailyRangeClosePrices(KOSPI_INDEX_CODE, startKisDate, endKisDate)
        : await fetchDailyRangeClosePrices(symbol, startKisDate, endKisDate)

      const tradingPoints = points.filter((point) => tradeDateSet.has(point.date))
      if (tradingPoints.length === 0) {
        failureCount++
      } else {
        for (const point of tradingPoints) {
          prices.push({
            symbol,
            tradeDate: point.date,
            open: point.open,
            high: point.high,
            low: point.low,
            close: point.close,
            volume: point.volume,
            source: 'kis',
          })
          persistedDates.add(point.date)
        }
      }
    } catch (error: unknown) {
      failureCount++
      console.warn('   ⚠️ KIS 기간 일봉 조회 실패:', error instanceof Error ? error.message : String(error))
    }

    if (delayMs > 0 && index < symbolsToAttempt.length - 1) {
      await sleep(delayMs)
    }
  }

  const attemptedCalls = symbolsToAttempt.length
  const successCount = attemptedCalls - failureCount

  let persistedRows = 0
  if (prices.length > 0) {
    try {
      persistedRows = await persistDailyPrices(prices)
    } catch (error: unknown) {
      // 저장 실패로 리포트가 통째로 유실되지 않도록, throw 전에 수집 단계 리포트를 남겨 standalone 러너에서도 관측 가능하게 함
      console.error(
        `   ❌ 일봉 주가 저장 실패 (수집 단계 리포트: attempted=${attemptedCalls}, success=${successCount}, failure=${failureCount}, rows=${prices.length}):`,
        error instanceof Error ? error.message : String(error),
      )
      throw error
    }
  }

  return {
    callBudget,
    rateLimitPerSecond,
    requestedRows: requestedSymbols.length,
    attemptedCalls,
    successCount,
    failureCount,
    skippedForBudget: Math.max(0, requestedSymbols.length - attemptedCalls),
    persistedRows,
    successRate: attemptedCalls > 0 ? successCount / attemptedCalls : 0,
    dateCoverageRate: tradeDateSet.size > 0 ? persistedDates.size / tradeDateSet.size : 0,
  }
}

/** 당일 증분 수집 — 1일 창 기간조회(당일~당일)로 OHLCV 적재 */
export async function collectDailyStockPricesForDate(
  tradeDate: string,
  options: {
    readonly universe?: StockDailyPriceUniverse
    readonly callBudget?: number
  } = {},
): Promise<StockDailyPriceCollectionReport> {
  return collectAndPersistStockDailyPriceRange({
    endDate: tradeDate,
    days: 1,
    universe: options.universe,
    callBudget: options.callBudget,
  })
}

/** 최근 N영업일 백필 — 심볼당 1콜(days일 창) */
export async function backfillRecentStockDailyPrices(input: {
  readonly endDate: string
  readonly days?: number
  readonly callBudget?: number
  readonly universe?: StockDailyPriceUniverse
  readonly delayMs?: number
  readonly fetchDailyRangeClosePrices?: FetchDailyRangeClosePrices
  readonly fetchIndexDailyRangeClosePrices?: FetchDailyRangeClosePrices
  readonly persistDailyPrices?: PersistDailyPrices
}): Promise<StockDailyPriceCollectionReport> {
  return collectAndPersistStockDailyPriceRange({
    endDate: input.endDate,
    days: input.days ?? 30,
    callBudget: input.callBudget,
    universe: input.universe,
    delayMs: input.delayMs,
    fetchDailyRangeClosePrices: input.fetchDailyRangeClosePrices,
    fetchIndexDailyRangeClosePrices: input.fetchIndexDailyRangeClosePrices,
    persistDailyPrices: input.persistDailyPrices,
  })
}
