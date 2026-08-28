import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import {
  StockDataHandler,
  loadPriceBook,
  type GuardedStockDataHandler,
  type PriceBook,
} from '@/scripts/stock-picks/data-handler'
import { labelPick, type StockPickLabel } from '@/scripts/stock-picks/label'
import { TradingDayIndex, loadTradingDayIndex } from '@/scripts/stock-picks/trading-days'
import { loadActiveStockMasterSymbols } from '@/scripts/tli/prices/stock-daily-prices'

const PICKS_PER_DATE = 3
const DEFAULT_RANDOM_SEED = 42
const VOLUME_AVERAGE_DAYS = 20

export type StockPickStrategy = (
  handler: GuardedStockDataHandler,
  universe: readonly string[],
  simDate: string,
) => string[]

export interface BacktestPickResult {
  readonly symbol: string
  readonly label: StockPickLabel | null
}

export interface DailyBacktestResult {
  readonly simDate: string
  readonly picks: readonly BacktestPickResult[]
  readonly pickCount: number
  readonly labeledCount: number
  readonly nullCount: number
  readonly touchedCount: number
  readonly precisionAt3: number | null
  readonly nullRate: number
}

export interface BacktestReport {
  readonly strategy: string
  readonly startDate: string | null
  readonly endDate: string | null
  readonly totalDates: number
  readonly totalPicks: number
  readonly labeledPicks: number
  readonly nullPicks: number
  readonly touchedPicks: number
  readonly precisionAt3: number | null
  readonly nullRate: number
  readonly dateBlockSummary: {
    readonly blockUnit: 'signal_date'
    readonly blockCount: number
    readonly evaluableBlockCount: number
    readonly meanBlockPrecision: number | null
    readonly meanBlockNullRate: number | null
  }
  readonly daily: readonly DailyBacktestResult[]
}

const hashDate = (date: string): number => {
  let hash = 2166136261
  for (const character of date) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

const createRandom = (seedInput: number): (() => number) => {
  let seed = seedInput | 0
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0
    return (seed >>> 0) / 0x100000000
  }
}

export const createRandom3Strategy = (seed = DEFAULT_RANDOM_SEED): StockPickStrategy => (
  _handler,
  universe,
  simDate,
) => {
  const symbols = [...new Set(universe.filter(Boolean))].sort()
  const nextRandom = createRandom(seed ^ hashDate(simDate))
  for (let index = symbols.length - 1; index > 0; index--) {
    const pickedIndex = Math.floor(nextRandom() * (index + 1))
    ;[symbols[index], symbols[pickedIndex]] = [symbols[pickedIndex], symbols[index]]
  }
  return symbols.slice(0, PICKS_PER_DATE)
}

export const random3 = createRandom3Strategy()

export const topVolumeRatio3: StockPickStrategy = (handler, universe, simDate) => {
  const ranked: Array<{ symbol: string; ratio: number }> = []
  for (const symbol of new Set(universe)) {
    const currentVolume = handler.get(symbol, simDate)?.volume
    if (currentVolume === null || currentVolume === undefined) continue

    const previousVolumes: number[] = []
    for (let offset = 1; offset <= VOLUME_AVERAGE_DAYS; offset++) {
      const date = handler.previousTradingDay(simDate, offset)
      if (!date) break
      const volume = handler.get(symbol, date)?.volume
      if (volume === null || volume === undefined) break
      previousVolumes.push(volume)
    }
    if (previousVolumes.length !== VOLUME_AVERAGE_DAYS) continue

    const averageVolume = previousVolumes.reduce((sum, volume) => sum + volume, 0) / VOLUME_AVERAGE_DAYS
    if (averageVolume <= 0) continue
    ranked.push({ symbol, ratio: currentVolume / averageVolume })
  }

  return ranked
    .sort((left, right) => right.ratio - left.ratio || left.symbol.localeCompare(right.symbol))
    .slice(0, PICKS_PER_DATE)
    .map((row) => row.symbol)
}

const mean = (values: readonly number[]): number | null => (
  values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null
)

export function runBacktest(input: {
  readonly strategyName: string
  readonly strategy: StockPickStrategy
  readonly universe: readonly string[]
  readonly prices: PriceBook
  readonly tradingDays: TradingDayIndex
  readonly startDate?: string
  readonly endDate?: string
}): BacktestReport {
  const simDates = input.tradingDays.tradingDays.filter((date) => (
    (!input.startDate || date >= input.startDate)
    && (!input.endDate || date <= input.endDate)
  ))
  const dataHandler = new StockDataHandler(input.prices, input.tradingDays)
  const daily: DailyBacktestResult[] = []

  for (const simDate of simDates) {
    const guardedHandler = dataHandler.at(simDate)
    const symbols = [...new Set(input.strategy(guardedHandler, input.universe, simDate).filter(Boolean))]
      .slice(0, PICKS_PER_DATE)
    const picks = symbols.map((symbol) => ({
      symbol,
      label: labelPick(symbol, simDate, input.prices, input.tradingDays),
    }))
    const labels = picks.flatMap((pick) => pick.label ? [pick.label] : [])
    const touchedCount = labels.filter((label) => label.touched).length
    const nullCount = picks.length - labels.length
    daily.push({
      simDate,
      picks,
      pickCount: picks.length,
      labeledCount: labels.length,
      nullCount,
      touchedCount,
      precisionAt3: labels.length > 0 ? touchedCount / labels.length : null,
      nullRate: picks.length > 0 ? nullCount / picks.length : 0,
    })
  }

  const totalPicks = daily.reduce((sum, row) => sum + row.pickCount, 0)
  const labeledPicks = daily.reduce((sum, row) => sum + row.labeledCount, 0)
  const nullPicks = daily.reduce((sum, row) => sum + row.nullCount, 0)
  const touchedPicks = daily.reduce((sum, row) => sum + row.touchedCount, 0)
  const blockPrecisions = daily.flatMap((row) => row.precisionAt3 === null ? [] : [row.precisionAt3])

  // 같은 픽의 5거래일 창이 이웃 신호일과 중첩되므로 개별 픽을 IID 표본으로 보지 않는다.
  // 별도 추론 통계를 만들지 않고 신호일을 한 블록으로 둔 분포를 함께 보존한다.
  return {
    strategy: input.strategyName,
    startDate: simDates[0] ?? null,
    endDate: simDates[simDates.length - 1] ?? null,
    totalDates: daily.length,
    totalPicks,
    labeledPicks,
    nullPicks,
    touchedPicks,
    precisionAt3: labeledPicks > 0 ? touchedPicks / labeledPicks : null,
    nullRate: totalPicks > 0 ? nullPicks / totalPicks : 0,
    dateBlockSummary: {
      blockUnit: 'signal_date',
      blockCount: daily.length,
      evaluableBlockCount: blockPrecisions.length,
      meanBlockPrecision: mean(blockPrecisions),
      meanBlockNullRate: mean(daily.map((row) => row.nullRate)),
    },
    daily,
  }
}

export function printBacktestReport(report: BacktestReport): void {
  console.log(JSON.stringify({
    strategy: report.strategy,
    startDate: report.startDate,
    endDate: report.endDate,
    totalDates: report.totalDates,
    totalPicks: report.totalPicks,
    labeledPicks: report.labeledPicks,
    nullPicks: report.nullPicks,
    touchedPicks: report.touchedPicks,
    precisionAt3: report.precisionAt3,
    nullRate: report.nullRate,
    dateBlockSummary: report.dateBlockSummary,
  }, null, 2))
  console.table(report.daily.map((row) => ({
    date: row.simDate,
    picks: row.pickCount,
    labeled: row.labeledCount,
    nulls: row.nullCount,
    touched: row.touchedCount,
    precisionAt3: row.precisionAt3,
    nullRate: row.nullRate,
  })))
}

const readOption = (args: readonly string[], name: string): string | undefined => (
  args.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1)
)

const printUsage = (): void => {
  console.log([
    'Usage: npx tsx scripts/stock-picks/backtest.ts --strategy=random3',
    '',
    'Options:',
    '  --strategy=NAME   random3 또는 topVolumeRatio3 (기본 random3)',
    '  --start-date=DATE 시작 거래일 YYYY-MM-DD',
    '  --end-date=DATE   종료 거래일 YYYY-MM-DD',
    '  --scratch=PATH    전체 JSON 결과를 저장할 scratch 파일 경로',
  ].join('\n'))
}

const isDirectRun = /backtest\.(?:ts|js)$/.test(process.argv[1] ?? '')
if (isDirectRun) {
  const args = process.argv.slice(2)
  if (args.includes('--help') || args.includes('-h')) {
    printUsage()
  } else {
    const strategyName = readOption(args, '--strategy') ?? 'random3'
    const strategies: Readonly<Record<string, StockPickStrategy>> = { random3, topVolumeRatio3 }
    const strategy = strategies[strategyName]
    if (!strategy) throw new Error(`지원하지 않는 전략입니다: ${strategyName}`)

    Promise.all([loadTradingDayIndex(), loadActiveStockMasterSymbols()])
      .then(async ([tradingDays, universe]) => {
        const prices = await loadPriceBook({
          startDate: tradingDays.firstDate ?? undefined,
          endDate: tradingDays.lastDate ?? undefined,
        })
        const report = runBacktest({
          strategyName,
          strategy,
          universe,
          prices,
          tradingDays,
          startDate: readOption(args, '--start-date'),
          endDate: readOption(args, '--end-date'),
        })
        printBacktestReport(report)

        const scratchPath = readOption(args, '--scratch')
        if (scratchPath) {
          await mkdir(dirname(scratchPath), { recursive: true })
          await writeFile(scratchPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
        }
      })
      .catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : String(error))
        process.exit(1)
      })
  }
}
