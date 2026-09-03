import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import {
  StockDataHandler,
  loadPriceBook,
  type GuardedStockDataHandler,
  type PriceBook,
} from '@/scripts/stock-picks/data-handler'
import type { StockFeatureVector } from '@/scripts/stock-picks/features'
import { labelPick, type StockPickLabel } from '@/scripts/stock-picks/label'
import {
  rankVolumeOnlyCandidates,
  type StockMasterState,
  type VolumeBreakoutParameters,
} from '@/scripts/stock-picks/strategies'
import { TradingDayIndex, loadTradingDayIndex } from '@/scripts/stock-picks/trading-days'
import { loadActiveStockMasterSymbols } from '@/scripts/tli/prices/stock-daily-prices'

const PICKS_PER_DATE = 3
const DEFAULT_RANDOM_SEED = 42
const VOLUME_AVERAGE_DAYS = 20
const BOOTSTRAP_SEED = 42

export interface BootstrapConfidenceInterval {
  readonly mean: number | null
  readonly lower95: number | null
  readonly upper95: number | null
}

export interface LabelStatusCounts {
  readonly hit: number
  readonly miss: number
  readonly unexpected_untradeable: number
  readonly data_error: number
}

type MutableLabelStatusCounts = {
  -readonly [K in keyof LabelStatusCounts]: LabelStatusCounts[K]
}

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
  readonly slotCount: 3
  readonly hits: number
  readonly filledSlots: number
  readonly unfilledSlots: number
  readonly nullLabelSlots: number
  readonly statusCounts: LabelStatusCounts
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
  /** 제품은 하루 3픽을 약속하므로 미충족·null·오류 슬롯도 제품 metric에서는 miss다. */
  readonly slotPrecisionAt3: number | null
  readonly slotPrecisionAt3Ci: BootstrapConfidenceInterval
  readonly slotCoverage: number | null
  readonly anyHitRate: number | null
  readonly twoPlusHitRate: number | null
  readonly dailyHits: readonly number[]
  readonly statusCounts: LabelStatusCounts
  readonly dataErrorRate: number
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

export const createRandom = (seedInput: number): (() => number) => {
  let seed = seedInput | 0
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0
    return (seed >>> 0) / 0x100000000
  }
}

const sampleThree = (symbolsInput: readonly string[], seed: number, simDate: string): string[] => {
  const symbols = [...new Set(symbolsInput.filter(Boolean))].sort()
  const nextRandom = createRandom(seed ^ hashDate(simDate))
  for (let index = symbols.length - 1; index > 0; index--) {
    const pickedIndex = Math.floor(nextRandom() * (index + 1))
    ;[symbols[index], symbols[pickedIndex]] = [symbols[pickedIndex], symbols[index]]
  }
  return symbols.slice(0, PICKS_PER_DATE)
}

export const createRandom3Strategy = (seed = DEFAULT_RANDOM_SEED): StockPickStrategy => (
  _handler,
  universe,
  simDate,
) => {
  return sampleThree(universe, seed, simDate)
}

export const random3 = createRandom3Strategy()

export const createPolicyRandomStrategy = (
  eligiblePoolByDate: ReadonlyMap<string, readonly string[]>,
  seed = DEFAULT_RANDOM_SEED,
): StockPickStrategy => (_handler, universe, simDate) => {
  const universeSet = new Set(universe)
  const eligible = (eligiblePoolByDate.get(simDate) ?? []).filter((symbol) => universeSet.has(symbol))
  return sampleThree(eligible, seed, simDate)
}

export const createVolumeOnlyStrategy = (
  featuresByDate: ReadonlyMap<string, readonly StockFeatureVector[]>,
  masters: ReadonlyMap<string, StockMasterState>,
  parameters: VolumeBreakoutParameters,
): StockPickStrategy => {
  let cachedUniverse: readonly string[] | null = null
  let universeSet = new Set<string>()
  return (_handler, universe, simDate) => {
    if (cachedUniverse !== universe) {
      cachedUniverse = universe
      universeSet = new Set(universe)
    }
    return rankVolumeOnlyCandidates({
      features: featuresByDate.get(simDate) ?? [],
      masters,
      parameters,
      universe: universeSet,
    }).map((row) => row.symbol)
  }
}

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

const emptyStatusCounts = (): MutableLabelStatusCounts => ({
  hit: 0,
  miss: 0,
  unexpected_untradeable: 0,
  data_error: 0,
})

export function movingBlockBootstrapCi(
  values: readonly number[],
  options: {
    readonly blockLength?: number
    readonly resamples?: number
    readonly seed: number
  },
): BootstrapConfidenceInterval {
  const blockLength = options.blockLength ?? 10
  const resamples = options.resamples ?? 10_000
  if (!Number.isInteger(blockLength) || blockLength <= 0) {
    throw new Error(`blockLength는 양의 정수여야 합니다: ${blockLength}`)
  }
  if (!Number.isInteger(resamples) || resamples <= 0) {
    throw new Error(`resamples는 양의 정수여야 합니다: ${resamples}`)
  }
  if (values.length === 0) return { mean: null, lower95: null, upper95: null }
  if (values.some((value) => !Number.isFinite(value))) {
    throw new Error('bootstrap values는 모두 유한수여야 합니다')
  }

  const nextRandom = createRandom(options.seed)
  const bootstrapMeans: number[] = []
  for (let sample = 0; sample < resamples; sample++) {
    let sum = 0
    let count = 0
    while (count < values.length) {
      const start = Math.floor(nextRandom() * values.length)
      for (let offset = 0; offset < blockLength && count < values.length; offset++) {
        sum += values[(start + offset) % values.length] as number
        count++
      }
    }
    bootstrapMeans.push(sum / values.length)
  }
  bootstrapMeans.sort((left, right) => left - right)
  const percentile = (probability: number): number => (
    bootstrapMeans[Math.floor((bootstrapMeans.length - 1) * probability)] as number
  )
  return {
    mean: mean(values),
    lower95: percentile(0.025),
    upper95: percentile(0.975),
  }
}

export interface PairedDailyDeltaRow {
  readonly simDate: string
  readonly aHits: number
  readonly bHits: number
  readonly delta: number
}

export type PairedDailyDeltaResult = PairedDailyDeltaRow[] & {
  readonly excludedDates: {
    readonly onlyA: number
    readonly onlyB: number
    readonly total: number
  }
}

export function pairedDailyDelta(
  a: Pick<BacktestReport, 'daily'>,
  b: Pick<BacktestReport, 'daily'>,
): PairedDailyDeltaResult {
  const aByDate = new Map(a.daily.map((row) => [row.simDate, row]))
  const bByDate = new Map(b.daily.map((row) => [row.simDate, row]))
  const rows = [...aByDate.keys()]
    .filter((date) => bByDate.has(date))
    .sort()
    .map((simDate) => {
      const aHits = aByDate.get(simDate)?.hits ?? 0
      const bHits = bByDate.get(simDate)?.hits ?? 0
      return { simDate, aHits, bHits, delta: aHits - bHits }
    }) as PairedDailyDeltaResult
  Object.defineProperty(rows, 'excludedDates', {
    value: {
      onlyA: [...aByDate.keys()].filter((date) => !bByDate.has(date)).length,
      onlyB: [...bByDate.keys()].filter((date) => !aByDate.has(date)).length,
      total: new Set([
        ...[...aByDate.keys()].filter((date) => !bByDate.has(date)),
        ...[...bByDate.keys()].filter((date) => !aByDate.has(date)),
      ]).size,
    },
    enumerable: false,
  })
  return rows
}

export function runBacktest(input: {
  readonly strategyName: string
  readonly strategy: StockPickStrategy
  readonly universe: readonly string[]
  readonly prices: PriceBook
  readonly tradingDays: TradingDayIndex
  readonly startDate?: string
  readonly endDate?: string
  /** Optimizer 내부 후보 탐색은 최종 aggregate에서만 CI를 계산해 반복 비용을 피한다. */
  readonly calculateSlotPrecisionCi?: boolean
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
    const conditionalLabels = labels.filter((label) => label.status !== 'data_error')
    const touchedCount = labels.filter((label) => label.touched).length
    const nullCount = picks.length - labels.length
    const statusCounts = emptyStatusCounts()
    for (const label of labels) statusCounts[label.status]++
    const filledSlots = Math.min(PICKS_PER_DATE, picks.length)
    daily.push({
      simDate,
      picks,
      pickCount: picks.length,
      labeledCount: labels.length,
      nullCount,
      touchedCount,
      slotCount: PICKS_PER_DATE,
      hits: touchedCount,
      filledSlots,
      unfilledSlots: PICKS_PER_DATE - filledSlots,
      nullLabelSlots: nullCount,
      statusCounts,
      precisionAt3: conditionalLabels.length > 0 ? touchedCount / conditionalLabels.length : null,
      nullRate: picks.length > 0 ? nullCount / picks.length : 0,
    })
  }

  const totalPicks = daily.reduce((sum, row) => sum + row.pickCount, 0)
  const labeledPicks = daily.reduce((sum, row) => sum + row.labeledCount, 0)
  const nullPicks = daily.reduce((sum, row) => sum + row.nullCount, 0)
  const touchedPicks = daily.reduce((sum, row) => sum + row.touchedCount, 0)
  const blockPrecisions = daily.flatMap((row) => row.precisionAt3 === null ? [] : [row.precisionAt3])
  const dailyHits = daily.map((row) => row.hits)
  const statusCounts = emptyStatusCounts()
  for (const row of daily) {
    for (const status of Object.keys(statusCounts) as Array<keyof LabelStatusCounts>) {
      statusCounts[status] += row.statusCounts[status]
    }
  }
  const slotDenominator = PICKS_PER_DATE * daily.length

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
    precisionAt3: labeledPicks - statusCounts.data_error > 0
      ? touchedPicks / (labeledPicks - statusCounts.data_error)
      : null,
    slotPrecisionAt3: slotDenominator > 0 ? touchedPicks / slotDenominator : null,
    slotPrecisionAt3Ci: input.calculateSlotPrecisionCi === false
      ? {
          mean: slotDenominator > 0 ? touchedPicks / slotDenominator : null,
          lower95: null,
          upper95: null,
        }
      : movingBlockBootstrapCi(
          dailyHits.map((hits) => hits / PICKS_PER_DATE),
          { seed: BOOTSTRAP_SEED },
        ),
    slotCoverage: slotDenominator > 0 ? totalPicks / slotDenominator : null,
    anyHitRate: daily.length > 0
      ? daily.filter((row) => row.hits >= 1).length / daily.length
      : null,
    twoPlusHitRate: daily.length > 0
      ? daily.filter((row) => row.hits >= 2).length / daily.length
      : null,
    dailyHits,
    statusCounts,
    dataErrorRate: totalPicks > 0 ? statusCounts.data_error / totalPicks : 0,
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
    slotPrecisionAt3: report.slotPrecisionAt3,
    slotPrecisionAt3Ci: report.slotPrecisionAt3Ci,
    slotCoverage: report.slotCoverage,
    anyHitRate: report.anyHitRate,
    twoPlusHitRate: report.twoPlusHitRate,
    dailyHits: report.dailyHits,
    statusCounts: report.statusCounts,
    dataErrorRate: report.dataErrorRate,
    nullRate: report.nullRate,
    dateBlockSummary: report.dateBlockSummary,
  }, null, 2))
  console.table(report.daily.map((row) => ({
    date: row.simDate,
    picks: row.pickCount,
    labeled: row.labeledCount,
    nulls: row.nullCount,
    touched: row.touchedCount,
    hits: row.hits,
    slots: row.slotCount,
    filledSlots: row.filledSlots,
    unfilledSlots: row.unfilledSlots,
    nullLabelSlots: row.nullLabelSlots,
    statusCounts: row.statusCounts,
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
