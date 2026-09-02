import {
  fetchDailyRangePriceRows,
  fetchIndexDailyRangePriceRows,
  getKisApiErrorKind,
  type KisApiErrorKind,
  type KisDailyRangePricePoint,
} from '@/app/archive/_utils/api/kis/client'
import { getKSTDateString } from '@/lib/tli/date-utils'
import { getLastFinalizedTradingDate, isKoreanTradingDate } from '@/lib/tli/trading-calendar'
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

const KOSPI_INDEX_CODE = '0001'
const INDEX_ATTEMPTS = 3
const INDEX_RETRY_DELAYS_MS = [1_000, 5_000] as const
const STOCK_RETRY_DELAYS_MS = [1_000, 5_000] as const
const HEARTBEAT_SYMBOL_INTERVAL = 250
const HEARTBEAT_TIME_INTERVAL_MS = 60_000

type CollectionFailureKind = KisApiErrorKind | 'empty' | 'unknown'

export interface StockDailyPriceCollectionReport {
  readonly callBudget: number
  readonly rateLimitPerSecond: number
  readonly requestedRows: number
  readonly attemptedCalls: number
  readonly physicalCalls: number
  readonly successCount: number
  readonly failureCount: number
  readonly failedSymbols: readonly string[]
  readonly skippedForBudget: number
  readonly persistedRows: number
  readonly successRate: number
  readonly dateCoverageRate: number
  readonly droppedNotFinalizedRows: number
  readonly droppedPhantomRows: number
  readonly indexFailed: boolean
  readonly retriedSymbols: readonly string[]
  readonly recoveredSymbols: readonly string[]
  readonly failureKinds: Readonly<Record<string, number>>
  readonly exactDateSuccessCount: number
  readonly exactDateCoverageRate: number
}

type FetchDailyRangePriceRows = (
  symbol: string,
  startKisDate: string,
  endKisDate: string,
) => Promise<KisDailyRangePricePoint[]>
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
    if (isKoreanTradingDate(tradeDate)) dates.push(tradeDate)
    cursor.setUTCDate(cursor.getUTCDate() - 1)
  }

  return dates
}

const getFailureKind = (error: unknown): CollectionFailureKind => (
  getKisApiErrorKind(error) ?? 'unknown'
)

const isPhantomPoint = (point: KisDailyRangePricePoint, runDateKst: string): boolean => (
  point.date >= runDateKst
  && point.volume === 0
  && point.open !== null
  && point.high !== null
  && point.low !== null
  && point.open === point.high
  && point.high === point.low
  && point.low === point.close
)

/**
 * 심볼당 한 번의 기간조회로 수집하되 KOSPI를 먼저 확인하고, 실패 심볼은 재시도 큐로
 * 복구하며, 아직 확정되지 않은 세션은 적재하지 않는다.
 */
export async function collectAndPersistStockDailyPriceRange(input: {
  readonly endDate: string
  readonly days: number
  readonly universe?: StockDailyPriceUniverse
  readonly callBudget?: number
  readonly rateLimitPerSecond?: number
  readonly delayMs?: number
  readonly deadlineMs?: number
  readonly finalizedThroughDate?: string
  readonly fetchDailyRangeClosePrices?: FetchDailyRangePriceRows
  readonly fetchIndexDailyRangeClosePrices?: FetchDailyRangePriceRows
  readonly persistDailyPrices?: PersistDailyPrices
  readonly loadSymbols?: LoadSymbols
}): Promise<StockDailyPriceCollectionReport> {
  const callBudget = input.callBudget ?? DEFAULT_KIS_DAILY_PRICE_CALL_BUDGET
  const rateLimitPerSecond = input.rateLimitPerSecond ?? KIS_DAILY_PRICE_RATE_LIMIT_PER_SECOND
  if (!Number.isFinite(rateLimitPerSecond) || rateLimitPerSecond <= 0) {
    throw new Error(`rateLimitPerSecond는 양수여야 합니다: ${rateLimitPerSecond}`)
  }
  const paceIntervalMs = input.delayMs ?? 1000 / rateLimitPerSecond
  const deadlineMs = input.deadlineMs
  if (deadlineMs !== undefined && (!Number.isFinite(deadlineMs) || deadlineMs <= 0)) {
    throw new Error(`deadlineMs는 양수여야 합니다: ${deadlineMs}`)
  }
  const startedAt = Date.now()
  const finalizedThroughDate = input.finalizedThroughDate ?? getLastFinalizedTradingDate()
  const exactCoverageDate = input.finalizedThroughDate ?? input.endDate
  const runDateKst = getKSTDateString()
  const fetchDailyRange = input.fetchDailyRangeClosePrices ?? fetchDailyRangePriceRows
  const fetchIndexDailyRange = input.fetchIndexDailyRangeClosePrices ?? fetchIndexDailyRangePriceRows
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
  const requestedSymbols = [KOSPI_INDEX_SYMBOL, ...uniqueSymbols]
  const symbolsToAttempt = requestedSymbols.slice(0, callBudget)
  const stockSymbolsToAttempt = symbolsToAttempt.filter((symbol) => symbol !== KOSPI_INDEX_SYMBOL)

  const prices: StockDailyPriceInput[] = []
  const persistedDates = new Set<string>()
  const failures = new Map<string, CollectionFailureKind>()
  const successfulSymbols = new Set<string>()
  const exactDateSymbols = new Set<string>()
  const retriedSymbols = new Set<string>()
  const recoveredSymbols = new Set<string>()
  const attemptedSymbols = new Set<string>()
  let droppedNotFinalizedRows = 0
  let droppedPhantomRows = 0
  let physicalCalls = 0
  let previousCallStart: number | null = null
  let lastHeartbeatAt = startedAt
  let lastHeartbeatProcessed = 0

  const remainingDeadlineMs = (): number | null => (
    deadlineMs === undefined ? null : deadlineMs - (Date.now() - startedAt)
  )
  const deadlineExceeded = (): boolean => {
    const remaining = remainingDeadlineMs()
    return remaining !== null && remaining <= 0
  }
  const waitWhileAllowed = async (ms: number): Promise<boolean> => {
    if (ms <= 0) return !deadlineExceeded()
    const remaining = remainingDeadlineMs()
    if (remaining !== null && remaining < ms) return false
    await sleep(ms)
    return !deadlineExceeded()
  }
  const pace = async (): Promise<boolean> => {
    if (previousCallStart !== null && paceIntervalMs > 0) {
      const waitMs = Math.max(0, previousCallStart + paceIntervalMs - Date.now())
      if (!(await waitWhileAllowed(waitMs))) return false
    }
    if (deadlineExceeded()) return false
    previousCallStart = Date.now()
    return true
  }
  const normalizePoints = (
    symbol: string,
    points: readonly KisDailyRangePricePoint[],
  ): KisDailyRangePricePoint[] => {
    const accepted: KisDailyRangePricePoint[] = []
    for (const point of points) {
      if (!tradeDateSet.has(point.date)) continue
      if (point.date > finalizedThroughDate) {
        droppedNotFinalizedRows++
        continue
      }
      if (isPhantomPoint(point, runDateKst)) {
        droppedPhantomRows++
        continue
      }
      accepted.push(point)
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
    return accepted
  }
  const markSuccess = (symbol: string, points: readonly KisDailyRangePricePoint[]): void => {
    successfulSymbols.add(symbol)
    failures.delete(symbol)
    if (symbol !== KOSPI_INDEX_SYMBOL && points.some((point) => point.date === exactCoverageDate)) {
      exactDateSymbols.add(symbol)
    }
  }
  const emitHeartbeat = (processed: number, forceTimeCheck = false): void => {
    const now = Date.now()
    if (
      processed - lastHeartbeatProcessed < HEARTBEAT_SYMBOL_INTERVAL
      && (!forceTimeCheck || now - lastHeartbeatAt < HEARTBEAT_TIME_INTERVAL_MS)
    ) return
    const elapsedSec = Math.max(0, Math.round((now - startedAt) / 1000))
    const success = successfulSymbols.size - (successfulSymbols.has(KOSPI_INDEX_SYMBOL) ? 1 : 0)
    const etaSec = processed > 0
      ? Math.max(0, Math.round((elapsedSec / processed) * (uniqueSymbols.length - processed)))
      : 0
    console.log(JSON.stringify({
      event: 'stock_daily_collection_progress',
      processed,
      total: uniqueSymbols.length,
      success,
      failed: Math.max(0, processed - success),
      elapsedSec,
      etaSec,
    }))
    lastHeartbeatAt = now
    lastHeartbeatProcessed = processed
  }

  let indexFailed = false
  if (symbolsToAttempt[0] === KOSPI_INDEX_SYMBOL && !deadlineExceeded()) {
    attemptedSymbols.add(KOSPI_INDEX_SYMBOL)
    for (let attempt = 0; attempt < INDEX_ATTEMPTS; attempt++) {
      if (!(await pace())) break
      if (attempt > 0) retriedSymbols.add(KOSPI_INDEX_SYMBOL)
      let retryKind: CollectionFailureKind | null = null
      try {
        physicalCalls++
        const points = normalizePoints(
          KOSPI_INDEX_SYMBOL,
          await fetchIndexDailyRange(KOSPI_INDEX_CODE, startKisDate, endKisDate),
        )
        if (points.length === 0) {
          retryKind = 'empty'
          failures.set(KOSPI_INDEX_SYMBOL, retryKind)
        } else {
          markSuccess(KOSPI_INDEX_SYMBOL, points)
          if (attempt > 0) recoveredSymbols.add(KOSPI_INDEX_SYMBOL)
          break
        }
      } catch (error) {
        retryKind = getFailureKind(error)
        failures.set(KOSPI_INDEX_SYMBOL, retryKind)
        console.warn('   ⚠️ KOSPI 기간 일봉 조회 실패:', error instanceof Error ? error.message : String(error))
      }
      if (attempt >= INDEX_ATTEMPTS - 1) break
      const baseWaitMs = INDEX_RETRY_DELAYS_MS[attempt] ?? 0
      const retryWaitMs = retryKind === 'rate_limit' ? Math.max(1_000, baseWaitMs) : baseWaitMs
      if (!(await waitWhileAllowed(retryWaitMs))) break
    }
    indexFailed = !successfulSymbols.has(KOSPI_INDEX_SYMBOL)
  }

  let processedStocks = 0
  for (const symbol of stockSymbolsToAttempt) {
    if (deadlineExceeded()) {
      console.warn(`   ⚠️ 일봉 수집 deadline 초과: ${deadlineMs}ms, 남은 심볼 수집 중단`)
      break
    }
    if (!(await pace())) break
    attemptedSymbols.add(symbol)
    try {
      physicalCalls++
      const points = normalizePoints(symbol, await fetchDailyRange(symbol, startKisDate, endKisDate))
      if (points.length === 0) failures.set(symbol, 'empty')
      else markSuccess(symbol, points)
    } catch (error) {
      const kind = getFailureKind(error)
      failures.set(symbol, kind)
      console.warn('   ⚠️ KIS 기간 일봉 조회 실패:', error instanceof Error ? error.message : String(error))
      if (kind === 'rate_limit') await waitWhileAllowed(1_000)
    }
    processedStocks++
    emitHeartbeat(processedStocks, true)
  }

  for (let pass = 0; pass < STOCK_RETRY_DELAYS_MS.length; pass++) {
    const retryQueue = stockSymbolsToAttempt.filter((symbol) => {
      const kind = failures.get(symbol)
      return attemptedSymbols.has(symbol) && kind !== undefined && kind !== 'empty'
    })
    if (retryQueue.length === 0 || deadlineExceeded()) break
    if (!(await waitWhileAllowed(STOCK_RETRY_DELAYS_MS[pass]))) break

    for (const symbol of retryQueue) {
      if (deadlineExceeded() || !(await pace())) break
      retriedSymbols.add(symbol)
      try {
        physicalCalls++
        const points = normalizePoints(symbol, await fetchDailyRange(symbol, startKisDate, endKisDate))
        if (points.length === 0) failures.set(symbol, 'empty')
        else {
          markSuccess(symbol, points)
          recoveredSymbols.add(symbol)
        }
      } catch (error) {
        const kind = getFailureKind(error)
        failures.set(symbol, kind)
        console.warn('   ⚠️ KIS 기간 일봉 재조회 실패:', error instanceof Error ? error.message : String(error))
        if (kind === 'rate_limit') await waitWhileAllowed(1_000)
      }
      emitHeartbeat(processedStocks, true)
    }
  }

  const failedSymbols = [...attemptedSymbols].filter((symbol) => failures.has(symbol))
  const failureKinds: Record<string, number> = {}
  for (const symbol of failedSymbols) {
    const kind = failures.get(symbol) ?? 'unknown'
    failureKinds[kind] = (failureKinds[kind] ?? 0) + 1
  }
  const attemptedCalls = attemptedSymbols.size
  const failureCount = failedSymbols.length
  const successCount = attemptedCalls - failureCount

  let persistedRows = 0
  if (prices.length > 0) {
    try {
      persistedRows = await persistDailyPrices(prices)
    } catch (error) {
      console.error(
        `   ❌ 일봉 주가 저장 실패 (수집 단계 리포트: attempted=${attemptedCalls}, physical=${physicalCalls}, success=${successCount}, failure=${failureCount}, rows=${prices.length}):`,
        error instanceof Error ? error.message : String(error),
      )
      throw error
    }
  }

  const attemptedStockSymbols = [...attemptedSymbols]
    .filter((symbol) => symbol !== KOSPI_INDEX_SYMBOL).length
  return {
    callBudget,
    rateLimitPerSecond,
    requestedRows: requestedSymbols.length,
    attemptedCalls,
    physicalCalls,
    successCount,
    failureCount,
    failedSymbols,
    skippedForBudget: Math.max(0, requestedSymbols.length - attemptedCalls),
    persistedRows,
    successRate: attemptedCalls > 0 ? successCount / attemptedCalls : 0,
    dateCoverageRate: tradeDateSet.size > 0 ? persistedDates.size / tradeDateSet.size : 0,
    droppedNotFinalizedRows,
    droppedPhantomRows,
    indexFailed,
    retriedSymbols: [...retriedSymbols],
    recoveredSymbols: [...recoveredSymbols],
    failureKinds,
    exactDateSuccessCount: exactDateSymbols.size,
    exactDateCoverageRate: attemptedStockSymbols > 0
      ? exactDateSymbols.size / attemptedStockSymbols
      : 0,
  }
}

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

export async function backfillRecentStockDailyPrices(input: {
  readonly endDate: string
  readonly days?: number
  readonly callBudget?: number
  readonly universe?: StockDailyPriceUniverse
  readonly delayMs?: number
  readonly fetchDailyRangeClosePrices?: FetchDailyRangePriceRows
  readonly fetchIndexDailyRangeClosePrices?: FetchDailyRangePriceRows
  readonly persistDailyPrices?: PersistDailyPrices
}): Promise<StockDailyPriceCollectionReport> {
  return collectAndPersistStockDailyPriceRange({
    endDate: input.endDate,
    days: input.days ?? 30,
    callBudget: input.callBudget,
    universe: input.universe,
    delayMs: input.delayMs,
    finalizedThroughDate: input.endDate,
    fetchDailyRangeClosePrices: input.fetchDailyRangeClosePrices,
    fetchIndexDailyRangeClosePrices: input.fetchIndexDailyRangeClosePrices,
    persistDailyPrices: input.persistDailyPrices,
  })
}
