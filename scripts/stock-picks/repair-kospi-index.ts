import {
  ensureKisAccessToken,
  fetchIndexDailyRangePriceRows,
  type KisDailyRangePricePoint,
} from '@/app/archive/_utils/api/kis/client'
import {
  getKoreanTradingDatesBetween,
  getLastFinalizedTradingDate,
} from '@/lib/tli/trading-calendar'
import {
  KOSPI_INDEX_SYMBOL,
  upsertStockDailyPrices,
  type StockDailyPriceInput,
} from '@/scripts/tli/prices/stock-daily-prices'

const KOSPI_INDEX_CODE = '0001'
const MAX_SESSIONS_PER_CALL = 100
const CALL_INTERVAL_MS = 1_000

export interface KospiRepairSpan {
  readonly from: string
  readonly to: string
  readonly count: number
}

export interface KospiRepairResult {
  readonly missingCount: number
  readonly spans: readonly KospiRepairSpan[]
  readonly callCount: number
  readonly fetchedRows: number
  readonly matchedMissing: number
  readonly persistedRows: number
  readonly remainingMissing: readonly string[]
}

interface RepairLogger {
  log(...values: unknown[]): void
}

export interface RepairKospiDependencies {
  readonly loadExistingDates?: () => Promise<string[]>
  readonly fetchRange?: (
    indexCode: string,
    startKisDate: string,
    endKisDate: string,
  ) => Promise<KisDailyRangePricePoint[]>
  readonly persist?: (rows: readonly StockDailyPriceInput[]) => Promise<number>
  readonly ensureToken?: () => Promise<unknown>
  readonly sleep?: (milliseconds: number) => Promise<void>
  readonly logger?: RepairLogger
}

export interface RepairKospiOptions {
  readonly from?: string
  readonly to?: string
  readonly apply?: boolean
}

const toKisDate = (date: string): string => date.replace(/-/g, '')

const assertIsoDate = (date: string, option: string): void => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`${option} 형식은 YYYY-MM-DD여야 합니다`)
}

export function groupMissingKospiSpans(
  expectedDates: readonly string[],
  missingDates: ReadonlySet<string>,
  maxSessions = MAX_SESSIONS_PER_CALL,
): KospiRepairSpan[] {
  if (!Number.isInteger(maxSessions) || maxSessions <= 0) {
    throw new Error(`maxSessions는 양의 정수여야 합니다: ${maxSessions}`)
  }
  const spans: KospiRepairSpan[] = []
  let contiguous: string[] = []
  const flush = (): void => {
    for (let index = 0; index < contiguous.length; index += maxSessions) {
      const chunk = contiguous.slice(index, index + maxSessions)
      if (chunk.length > 0) {
        spans.push({ from: chunk[0] as string, to: chunk.at(-1) as string, count: chunk.length })
      }
    }
    contiguous = []
  }

  for (const date of expectedDates) {
    if (missingDates.has(date)) contiguous.push(date)
    else flush()
  }
  flush()
  return spans
}

async function loadKospiDates(): Promise<string[]> {
  const { fetchAllRows } = await import('@/lib/supabase/paginate')
  const { supabaseAdmin } = await import('@/scripts/tli/shared/supabase-admin')
  const rows = await fetchAllRows<{ trade_date: string }>((from, to) => supabaseAdmin
    .from('stock_daily_prices')
    .select('trade_date')
    .eq('symbol', KOSPI_INDEX_SYMBOL)
    .order('trade_date', { ascending: true })
    .range(from, to))
  return rows.map((row) => row.trade_date).filter(Boolean)
}

const toValidatedInput = (point: KisDailyRangePricePoint): StockDailyPriceInput => {
  const { open, high, low, close } = point
  if (
    open === null || high === null || low === null
    || !Number.isFinite(open) || !Number.isFinite(high)
    || !Number.isFinite(low) || !Number.isFinite(close)
    || low <= 0 || high < low || open < low || open > high || close < low || close > high
  ) {
    throw new Error(`KOSPI repair OHLC invariant 실패: ${point.date}`)
  }
  return {
    symbol: KOSPI_INDEX_SYMBOL,
    tradeDate: point.date,
    open,
    high,
    low,
    close,
    volume: point.volume,
    source: 'kis',
  }
}

export async function repairKospiIndex(
  options: RepairKospiOptions = {},
  dependencies: RepairKospiDependencies = {},
): Promise<KospiRepairResult> {
  const loadExistingDates = dependencies.loadExistingDates ?? loadKospiDates
  const fetchRange = dependencies.fetchRange ?? fetchIndexDailyRangePriceRows
  const persist = dependencies.persist ?? upsertStockDailyPrices
  const ensureToken = dependencies.ensureToken ?? (() => ensureKisAccessToken({ minRemainingMs: 5 * 60_000 }))
  const sleep = dependencies.sleep ?? ((milliseconds: number) => (
    new Promise<void>((resolveSleep) => setTimeout(resolveSleep, milliseconds))
  ))
  const logger = dependencies.logger ?? console
  const initialExistingDates = [...new Set(await loadExistingDates())].sort()
  const from = options.from ?? initialExistingDates[0]
  const to = options.to ?? getLastFinalizedTradingDate()
  if (!from) throw new Error('KOSPI 기존 날짜가 없어 --from이 필요합니다')
  assertIsoDate(from, '--from')
  assertIsoDate(to, '--to')
  if (from > to) throw new Error('--from은 --to보다 늦을 수 없습니다')

  const expectedDates = getKoreanTradingDatesBetween({ startDate: from, endDate: to })
  const existingSet = new Set(initialExistingDates)
  const missingDates = expectedDates.filter((date) => !existingSet.has(date))
  const missingSet = new Set(missingDates)
  const spans = groupMissingKospiSpans(expectedDates, missingSet)
  logger.log(JSON.stringify({
    event: 'kospi_repair_plan',
    missingCount: missingDates.length,
    spans,
    callCount: spans.length,
  }))

  const fetchedPoints: KisDailyRangePricePoint[] = []
  if (spans.length > 0) await ensureToken()
  for (let index = 0; index < spans.length; index++) {
    const span = spans[index] as KospiRepairSpan
    if (index > 0) await sleep(CALL_INTERVAL_MS)
    fetchedPoints.push(...await fetchRange(
      KOSPI_INDEX_CODE,
      toKisDate(span.from),
      toKisDate(span.to),
    ))
  }

  const matchedByDate = new Map<string, StockDailyPriceInput>()
  for (const point of fetchedPoints) {
    if (!missingSet.has(point.date) || existingSet.has(point.date)) continue
    matchedByDate.set(point.date, toValidatedInput(point))
  }
  const matchedRows = [...matchedByDate.values()].sort((left, right) => (
    left.tradeDate.localeCompare(right.tradeDate)
  ))
  const stillMissing = missingDates.filter((date) => !matchedByDate.has(date))
  logger.log(JSON.stringify({
    event: 'kospi_repair_fetched',
    fetchedRows: fetchedPoints.length,
    matchedMissing: matchedRows.length,
    stillMissing,
  }))

  let persistedRows = 0
  if (options.apply && matchedRows.length > 0) {
    // 계획 이후 다른 수집기가 채운 날짜도 덮어쓰지 않도록 write 직전에 다시 확인한다.
    const currentExisting = new Set(await loadExistingDates())
    const rowsToPersist = matchedRows.filter((row) => !currentExisting.has(row.tradeDate))
    if (rowsToPersist.length > 0) persistedRows = await persist(rowsToPersist)
  }
  const verifiedExisting = new Set(await loadExistingDates())
  const remainingMissing = expectedDates.filter((date) => !verifiedExisting.has(date))
  logger.log(JSON.stringify({
    event: 'kospi_repair_verification',
    apply: options.apply === true,
    persistedRows,
    remainingMissing,
  }))

  return {
    missingCount: missingDates.length,
    spans,
    callCount: spans.length,
    fetchedRows: fetchedPoints.length,
    matchedMissing: matchedRows.length,
    persistedRows,
    remainingMissing,
  }
}

const readOption = (args: readonly string[], name: string): string | undefined => {
  const inline = args.find((arg) => arg.startsWith(`${name}=`))
  if (inline) return inline.slice(name.length + 1)
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}

const isDirectRun = /repair-kospi-index\.(?:ts|js)$/.test(process.argv[1] ?? '')
if (isDirectRun) {
  const args = process.argv.slice(2)
  repairKospiIndex({
    from: readOption(args, '--from'),
    to: readOption(args, '--to'),
    apply: args.includes('--apply'),
  }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
