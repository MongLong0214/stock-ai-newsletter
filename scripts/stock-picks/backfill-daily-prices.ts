import { readFile, rename, writeFile } from 'node:fs/promises'

import {
  getDailyRangeClosePrices,
  getIndexDailyRangeClosePrices,
  type KisDailyRangePricePoint,
} from '@/app/archive/_utils/api/kis/client'
import { getKSTDateString } from '@/lib/tli/date-utils'
import { getKoreanTradingDatesBetween } from '@/lib/tli/trading-calendar'
import { KIS_DAILY_PRICE_RATE_LIMIT_PER_SECOND } from '@/scripts/tli/prices/kis-daily-price-collector'
import {
  KOSPI_INDEX_SYMBOL,
  loadActiveStockMasterSymbols,
  upsertStockDailyPrices,
  type StockDailyPriceInput,
} from '@/scripts/tli/prices/stock-daily-prices'

const DEFAULT_BACKFILL_YEARS = 2
const DEFAULT_STATE_PATH = '.stock-picks-backfill.json'
const TRADING_DAYS_PER_CALL = 100
const STATE_VERSION = 1
const KOSPI_INDEX_CODE = '0001'

export interface BackfillDateRange {
  readonly startDate: string
  readonly endDate: string
}

interface SymbolProgress {
  readonly nextRangeIndex: number
  readonly fetchedRows: number
  readonly persistedRows: number
  readonly emptyRangeCount: number
}

interface BackfillState {
  readonly version: number
  readonly startDate: string
  readonly endDate: string
  readonly rangeCount: number
  readonly progress: Record<string, SymbolProgress>
  readonly completed: Record<string, {
    readonly fetchedRows: number
    readonly persistedRows: number
    readonly completedAt: string
  }>
  readonly failures: Record<string, {
    readonly reason: string
    readonly failedAt: string
  }>
  readonly updatedAt: string
}

export interface StockDailyPriceBackfillReport {
  readonly callBudget: number
  readonly attemptedCalls: number
  readonly targetSymbols: number
  readonly completedBeforeRun: number
  readonly successCount: number
  readonly failureCount: number
  readonly remainingCount: number
  readonly persistedRows: number
  readonly failedSymbols: readonly string[]
  readonly statePath: string
}

type FetchDailyRangePrices = (
  symbol: string,
  startDate: string,
  endDate: string,
) => Promise<KisDailyRangePricePoint[]>
type PersistDailyPrices = (rows: readonly StockDailyPriceInput[]) => Promise<number>
type LoadSymbols = () => Promise<string[]>

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
const toKisDate = (date: string): string => date.replace(/-/g, '')

const subtractYears = (date: string, years: number): string => {
  const parsed = new Date(`${date}T00:00:00.000Z`)
  parsed.setUTCFullYear(parsed.getUTCFullYear() - years)
  return parsed.toISOString().split('T')[0]
}

export function buildBackfillDateRanges(input: {
  readonly startDate: string
  readonly endDate: string
  readonly tradingDaysPerCall?: number
}): BackfillDateRange[] {
  const tradingDaysPerCall = input.tradingDaysPerCall ?? TRADING_DAYS_PER_CALL
  if (!Number.isInteger(tradingDaysPerCall) || tradingDaysPerCall <= 0) {
    throw new Error(`tradingDaysPerCall은 양의 정수여야 합니다: ${tradingDaysPerCall}`)
  }

  const tradingDates = getKoreanTradingDatesBetween({
    startDate: input.startDate,
    endDate: input.endDate,
  })
  const ranges: BackfillDateRange[] = []
  for (let endIndex = tradingDates.length; endIndex > 0; endIndex -= tradingDaysPerCall) {
    const startIndex = Math.max(0, endIndex - tradingDaysPerCall)
    const startDate = tradingDates[startIndex]
    const endDate = tradingDates[endIndex - 1]
    if (startDate && endDate) ranges.push({ startDate, endDate })
  }
  return ranges
}

const createState = (input: {
  readonly startDate: string
  readonly endDate: string
  readonly rangeCount: number
}): BackfillState => ({
  version: STATE_VERSION,
  startDate: input.startDate,
  endDate: input.endDate,
  rangeCount: input.rangeCount,
  progress: {},
  completed: {},
  failures: {},
  updatedAt: new Date().toISOString(),
})

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
)

const readState = async (input: {
  readonly statePath: string
  readonly startDate: string
  readonly endDate: string
  readonly rangeCount: number
}): Promise<BackfillState> => {
  let raw: string
  try {
    raw = await readFile(input.statePath, 'utf8')
  } catch (error: unknown) {
    if (isRecord(error) && error.code === 'ENOENT') return createState(input)
    throw error
  }

  const parsed: unknown = JSON.parse(raw)
  if (!isRecord(parsed)
    || parsed.version !== STATE_VERSION
    || typeof parsed.startDate !== 'string'
    || typeof parsed.endDate !== 'string'
    || typeof parsed.rangeCount !== 'number'
    || !isRecord(parsed.progress)
    || !isRecord(parsed.completed)
    || !isRecord(parsed.failures)
    || typeof parsed.updatedAt !== 'string') {
    throw new Error(`백필 상태 파일 형식이 올바르지 않습니다: ${input.statePath}`)
  }
  if (parsed.startDate !== input.startDate
    || parsed.endDate !== input.endDate
    || parsed.rangeCount !== input.rangeCount) {
    throw new Error(
      `백필 상태 파일 기간 불일치: state=${parsed.startDate}~${parsed.endDate}, requested=${input.startDate}~${input.endDate}`,
    )
  }

  return parsed as unknown as BackfillState
}

const writeState = async (statePath: string, state: BackfillState): Promise<void> => {
  const temporaryPath = `${statePath}.tmp`
  await writeFile(
    temporaryPath,
    `${JSON.stringify({ ...state, updatedAt: new Date().toISOString() }, null, 2)}\n`,
    'utf8',
  )
  await rename(temporaryPath, statePath)
}

const buildInputs = (
  symbol: string,
  points: readonly KisDailyRangePricePoint[],
  range: BackfillDateRange,
): StockDailyPriceInput[] => {
  const inputsByDate = new Map<string, StockDailyPriceInput>()
  for (const point of points) {
    if (point.date < range.startDate || point.date > range.endDate) continue
    inputsByDate.set(point.date, {
      symbol,
      tradeDate: point.date,
      open: point.open,
      high: point.high,
      low: point.low,
      close: point.close,
      volume: point.volume,
      source: 'kis',
    })
  }
  return [...inputsByDate.values()]
}

export async function backfillStockDailyPrices(input: {
  readonly callBudget: number
  readonly endDate?: string
  readonly years?: number
  readonly statePath?: string
  readonly delayMs?: number
  readonly fetchDailyRangePrices?: FetchDailyRangePrices
  readonly fetchIndexDailyRangePrices?: FetchDailyRangePrices
  readonly persistDailyPrices?: PersistDailyPrices
  readonly loadSymbols?: LoadSymbols
}): Promise<StockDailyPriceBackfillReport> {
  if (!Number.isInteger(input.callBudget) || input.callBudget <= 0) {
    throw new Error(`callBudget은 양의 정수여야 합니다: ${input.callBudget}`)
  }
  const years = input.years ?? DEFAULT_BACKFILL_YEARS
  if (!Number.isInteger(years) || years <= 0) throw new Error(`years는 양의 정수여야 합니다: ${years}`)

  const endDate = input.endDate ?? getKSTDateString()
  const startDate = subtractYears(endDate, years)
  const statePath = input.statePath ?? DEFAULT_STATE_PATH
  const delayMs = input.delayMs ?? Math.ceil(1000 / KIS_DAILY_PRICE_RATE_LIMIT_PER_SECOND)
  const fetchDailyRangePrices = input.fetchDailyRangePrices ?? getDailyRangeClosePrices
  const fetchIndexDailyRangePrices = input.fetchIndexDailyRangePrices ?? getIndexDailyRangeClosePrices
  const persistDailyPrices = input.persistDailyPrices ?? upsertStockDailyPrices
  const loadSymbols = input.loadSymbols ?? loadActiveStockMasterSymbols
  const ranges = buildBackfillDateRanges({ startDate, endDate })
  const stockSymbols = [...new Set(
    (await loadSymbols()).filter((symbol) => Boolean(symbol) && symbol !== KOSPI_INDEX_SYMBOL),
  )].sort()
  const symbols = [KOSPI_INDEX_SYMBOL, ...stockSymbols]
  const state = await readState({ statePath, startDate, endDate, rangeCount: ranges.length })
  const completedBeforeRun = symbols.filter((symbol) => state.completed[symbol] !== undefined).length
  let attemptedCalls = 0
  let persistedRows = 0
  let successCount = 0

  symbolLoop:
  for (const symbol of symbols) {
    if (state.completed[symbol]) continue
    let progress = state.progress[symbol] ?? {
      nextRangeIndex: 0,
      fetchedRows: 0,
      persistedRows: 0,
      emptyRangeCount: 0,
    }

    while (progress.nextRangeIndex < ranges.length) {
      if (attemptedCalls >= input.callBudget) break symbolLoop
      const range = ranges[progress.nextRangeIndex]
      if (!range) break
      attemptedCalls++

      try {
        const startKisDate = toKisDate(range.startDate)
        const endKisDate = toKisDate(range.endDate)
        const points = symbol === KOSPI_INDEX_SYMBOL
          ? await fetchIndexDailyRangePrices(KOSPI_INDEX_CODE, startKisDate, endKisDate)
          : await fetchDailyRangePrices(symbol, startKisDate, endKisDate)
        const rows = buildInputs(symbol, points, range)
        let persisted = 0
        if (rows.length > 0) {
          persisted = await persistDailyPrices(rows)
          if (persisted !== rows.length) {
            throw new Error(`upsert 불완전: ${persisted}/${rows.length}행 저장`)
          }
        }

        progress = {
          nextRangeIndex: progress.nextRangeIndex + 1,
          fetchedRows: progress.fetchedRows + rows.length,
          persistedRows: progress.persistedRows + persisted,
          emptyRangeCount: progress.emptyRangeCount + (rows.length === 0 ? 1 : 0),
        }
        state.progress[symbol] = progress
        delete state.failures[symbol]
        persistedRows += persisted
        await writeState(statePath, state)
      } catch (error: unknown) {
        const reason = error instanceof Error ? error.message : String(error)
        state.progress[symbol] = progress
        state.failures[symbol] = { reason, failedAt: new Date().toISOString() }
        console.error(`   ❌ 백필 실패 symbol=${symbol} range=${range.startDate}~${range.endDate}: ${reason}`)
        await writeState(statePath, state)
        if (delayMs > 0 && attemptedCalls < input.callBudget) await sleep(delayMs)
        continue symbolLoop
      }

      if (delayMs > 0 && attemptedCalls < input.callBudget) await sleep(delayMs)
    }

    if (progress.nextRangeIndex < ranges.length) continue
    if (progress.persistedRows === 0) {
      const reason = `전체 ${ranges.length}개 구간에서 저장 가능한 일봉이 0건입니다`
      state.failures[symbol] = { reason, failedAt: new Date().toISOString() }
      state.progress[symbol] = {
        nextRangeIndex: 0,
        fetchedRows: 0,
        persistedRows: 0,
        emptyRangeCount: 0,
      }
      console.error(`   ❌ 백필 실패 symbol=${symbol}: ${reason}`)
    } else {
      state.completed[symbol] = {
        fetchedRows: progress.fetchedRows,
        persistedRows: progress.persistedRows,
        completedAt: new Date().toISOString(),
      }
      delete state.progress[symbol]
      delete state.failures[symbol]
      successCount++
    }
    await writeState(statePath, state)
  }

  const remainingCount = symbols.filter((symbol) => state.completed[symbol] === undefined).length
  const unresolvedFailedSymbols = symbols
    .filter((symbol) => state.failures[symbol] !== undefined)
    .sort()
  return {
    callBudget: input.callBudget,
    attemptedCalls,
    targetSymbols: symbols.length,
    completedBeforeRun,
    successCount,
    failureCount: unresolvedFailedSymbols.length,
    remainingCount,
    persistedRows,
    failedSymbols: unresolvedFailedSymbols,
    statePath,
  }
}

const readOption = (args: readonly string[], name: string): string | undefined => (
  args.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1)
)

const readPositiveInteger = (value: string | undefined, name: string): number => {
  if (value === undefined) throw new Error(`${name} 인자가 필요합니다`)
  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name}은 양의 정수여야 합니다: ${value}`)
  return parsed
}

const printUsage = (): void => {
  console.log([
    'Usage: npx tsx scripts/stock-picks/backfill-daily-prices.ts --call-budget=1000',
    '',
    'Options:',
    '  --call-budget=N   이번 실행에서 허용할 KIS 호출 수 (필수)',
    '  --years=N         백필 기간(년, 기본 2)',
    '  --end-date=DATE   종료일 YYYY-MM-DD (기본 오늘 KST)',
    `  --state-file=PATH 진행 상태 파일 (기본 ${DEFAULT_STATE_PATH})`,
  ].join('\n'))
}

const isDirectRun = /backfill-daily-prices\.(?:ts|js)$/.test(process.argv[1] ?? '')
if (isDirectRun) {
  const args = process.argv.slice(2)
  if (args.includes('--help') || args.includes('-h')) {
    printUsage()
  } else {
    const callBudget = readPositiveInteger(readOption(args, '--call-budget'), '--call-budget')
    const yearsValue = readOption(args, '--years')
    const years = yearsValue === undefined ? DEFAULT_BACKFILL_YEARS : readPositiveInteger(yearsValue, '--years')
    backfillStockDailyPrices({
      callBudget,
      years,
      endDate: readOption(args, '--end-date'),
      statePath: readOption(args, '--state-file'),
    }).then((report) => {
      console.log(JSON.stringify(report))
      if (report.failureCount > 0) process.exitCode = 1
    }).catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exit(1)
    })
  }
}
