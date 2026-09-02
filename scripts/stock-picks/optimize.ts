/**
 * Walk-forward 연구 러너: random/policy-random/volume-only 기준선, 3슬롯 제품 metric,
 * frozen artifact와 실행 전 데이터 계약 gate를 한 결과에 묶는다.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import {
  createPolicyRandomStrategy,
  createRandom3Strategy,
  createVolumeOnlyStrategy,
  movingBlockBootstrapCi,
  pairedDailyDelta,
  runBacktest,
  type BacktestReport,
  type BootstrapConfidenceInterval,
  type LabelStatusCounts,
  type PairedDailyDeltaRow,
  type StockPickStrategy,
} from '@/scripts/stock-picks/backtest'
import { validateResearchDataset } from '@/scripts/stock-picks/data-contract'
import { StockDataHandler, loadPriceBook, type PriceBook } from '@/scripts/stock-picks/data-handler'
import { buildFeatureSeries, type StockFeatureVector } from '@/scripts/stock-picks/features'
import {
  PRODUCTION_STRATEGY,
  PRODUCTION_VOLUME_BREAKOUT_PARAMETERS,
} from '@/scripts/stock-picks/production-strategy'
import {
  COMPOSITE_ABLATION_EXCLUSIONS,
  COMPOSITE_ABLATION_FEATURES,
  DEFAULT_COMPOSITE_PARAMETERS,
  DEFAULT_EARLY_TREND_PARAMETERS,
  DEFAULT_PULLBACK_REBOUND_PARAMETERS,
  DEFAULT_VOLUME_BREAKOUT_PARAMETERS,
  DEFAULT_VOLUME_BREAKOUT_BULLISH_CANDLE_PARAMETERS,
  DEFAULT_VOLUME_BREAKOUT_NO_GAP_UP_PARAMETERS,
  createCachedFeatureStrategy,
  loadStockMasterStates,
  passesCommonGate,
  rankStrategyCandidates,
  type AblationFeature,
  type CompositeParameters,
  type EarlyTrendParameters,
  type PullbackReboundParameters,
  type SelectionMode,
  type StockMasterState,
  type StrategyName,
  type StrategyParameterMap,
  type VolumeBreakoutParameters,
} from '@/scripts/stock-picks/strategies'
import { TradingDayIndex, loadTradingDayIndex } from '@/scripts/stock-picks/trading-days'

const DEFAULT_EVALUATION_DAYS = 220
const FEATURE_WARMUP_DAYS = 320
const LABEL_LOOKAHEAD_DAYS = 5
const PURGE_DAYS = 5
const RANDOM_BASELINE_SEED = 42

export interface WalkForwardSplit {
  readonly index: number
  readonly trainMonths: readonly string[]
  readonly testMonths: readonly string[]
  readonly trainDates: readonly string[]
  readonly purgedDates: readonly string[]
  readonly testDates: readonly string[]
}

export interface OosMetricSummary {
  readonly evaluationScope: 'out_of_sample'
  readonly totalDates: number
  readonly totalPicks: number
  readonly labeledPicks: number
  readonly nullPicks: number
  readonly touchedPicks: number
  readonly precisionAt3: number | null
  readonly slotPrecisionAt3: number | null
  readonly slotPrecisionAt3Ci: BootstrapConfidenceInterval
  readonly slotCoverage: number | null
  readonly anyHitRate: number | null
  readonly twoPlusHitRate: number | null
  readonly dailyHits: readonly number[]
  readonly statusCounts: LabelStatusCounts
  readonly dataErrorRate: number
  readonly nullRate: number
  readonly averageDailyCandidateCount: number
  readonly pickDistribution: {
    readonly uniqueTickers: number
    readonly topTickerShare: number
    readonly herfindahlIndex: number
    readonly topTickers: ReadonlyArray<{ symbol: string; picks: number; share: number }>
  }
}

interface WalkForwardSegment<P> {
  readonly index: number
  readonly train: {
    readonly startDate: string
    readonly endDate: string
    readonly purgedDates: readonly string[]
    readonly selectedParameters: P
    readonly inSampleReference: {
      readonly precisionAt3: number | null
      readonly labeledPicks: number
      readonly nullRate: number
    }
  }
  readonly test: {
    readonly evaluationScope: 'out_of_sample'
    readonly startDate: string
    readonly endDate: string
    readonly precisionAt3: number | null
    readonly labeledPicks: number
    readonly nullRate: number
    readonly averageDailyCandidateCount: number
  }
}

export interface StrategyModeReport<P> {
  readonly mode: SelectionMode
  readonly aggregate: OosMetricSummary
  readonly segments: readonly WalkForwardSegment<P>[]
}

export interface OptimizationReport {
  readonly generatedAt: string
  readonly evaluationPolicy: {
    readonly headlineMetrics: 'out_of_sample_only'
    readonly trainMonths: 3
    readonly testMonths: 1
    readonly purgeTradingDays: 5
    readonly label: 'entry_open_to_5_holding_day_high_plus_10_percent_touch'
  }
  readonly dateRange: {
    readonly evaluationStart: string
    readonly evaluationEnd: string
    readonly evaluationDays: number
    readonly foldCount: number
  }
  readonly baselines: {
    readonly oosRandom3: OosMetricSummary
    readonly oosPolicyRandom3: OosMetricSummary
    readonly oosVolumeOnly3: OosMetricSummary
    readonly providedReferences: {
      readonly randomFullPeriod: 0.215
      readonly llmPipelineFullPeriod: 0.307
      readonly scope: 'user_provided_full_period_reference_not_used_for_optimization'
    }
  }
  readonly strategies: {
    readonly [K in StrategyName]: {
      readonly force3: StrategyModeReport<StrategyParameterMap[K]>
      readonly abstain: StrategyModeReport<StrategyParameterMap[K]>
    }
  }
  readonly abstainLift: Readonly<Record<StrategyName, number | null>>
  readonly compositeAblation: {
    readonly evaluationScope: 'out_of_sample'
    readonly mode: 'force3'
    readonly method: 'score_weight_zero_gate_preserved'
    readonly excludedFeatures: typeof COMPOSITE_ABLATION_EXCLUSIONS
    readonly baselinePrecisionAt3: number | null
    readonly rows: ReadonlyArray<{
      readonly omittedFeature: AblationFeature
      readonly precisionAt3: number | null
      readonly deltaVsBaseline: number | null
      readonly labeledPicks: number
      readonly nullRate: number
    }>
  }
  readonly caveats: {
    readonly survivorshipBias: string
    readonly referenceBaselineScope: string
  }
}

export interface FrozenProductionEvaluationReport {
  readonly generatedAt: string
  readonly evaluationPolicy: {
    readonly evaluationScope: 'walk_forward_test_dates'
    readonly parameterSelection: 'frozen_no_fold_reselection'
    readonly strategy: 'volumeBreakoutNoGapUp'
    readonly mode: 'force3'
  }
  readonly strategy: typeof PRODUCTION_STRATEGY
  readonly parameters: VolumeBreakoutParameters
  readonly datasetFingerprint: {
    readonly tradingDays: {
      readonly first: string | null
      readonly last: string | null
      readonly count: number
    }
    readonly priceRows: number
    readonly symbols: number
  }
  readonly dateRange: {
    readonly evaluationStart: string
    readonly evaluationEnd: string
    readonly evaluationDays: number
    readonly foldCount: number
  }
  readonly aggregate: OosMetricSummary
  readonly baselines: {
    readonly oosRandom3: OosMetricSummary
    readonly oosPolicyRandom3: OosMetricSummary
    readonly oosVolumeOnly3: OosMetricSummary
  }
  readonly pairedDailyDelta: {
    readonly productionMinusVolumeOnly: PairedComparisonSummary
    readonly productionMinusPolicyRandom: PairedComparisonSummary
  }
}

interface PairedComparisonSummary {
  readonly daily: readonly PairedDailyDeltaRow[]
  readonly excludedDates: {
    readonly onlyProduction: number
    readonly onlyBaseline: number
    readonly total: number
  }
  readonly slotPrecisionAt3DeltaCi: BootstrapConfidenceInterval
}

type ParameterGridMap = {
  readonly [K in StrategyName]: readonly StrategyParameterMap[K][]
}

const buildPullbackGrid = (): PullbackReboundParameters[] => {
  const output: PullbackReboundParameters[] = []
  for (const minTurnover of [1_000_000_000, 3_000_000_000]) {
    for (const [rsiMin, rsiMax] of [[30, 50], [35, 55]] as const) {
      for (const maxSma20DistancePercent of [2, 4]) {
        for (const minTrendR2 of [0.3, 0.5]) {
          for (const minScore of [40, 55]) {
            output.push({
              ...DEFAULT_PULLBACK_REBOUND_PARAMETERS,
              minTurnover,
              rsiMin,
              rsiMax,
              maxSma20DistancePercent,
              minTrendR2,
              minScore,
            })
          }
        }
      }
    }
  }
  return output
}

const buildBreakoutGrid = (
  defaults: VolumeBreakoutParameters,
): VolumeBreakoutParameters[] => {
  const output: VolumeBreakoutParameters[] = []
  for (const minTurnover of [500_000_000, 1_000_000_000, 3_000_000_000]) {
    for (const minVolumePercentile of [90, 95, 97, 99]) {
      for (const minDistanceFromHighPercent of [-5, -2, 0]) {
        for (const maxRsi of [65, 70, 75]) {
          output.push({
            ...defaults,
            minTurnover,
            minVolumePercentile,
            minDistanceFromHighPercent,
            maxRsi,
          })
        }
      }
    }
  }
  return output
}

const buildEarlyTrendGrid = (): EarlyTrendParameters[] => {
  const output: EarlyTrendParameters[] = []
  for (const minTurnover of [1_000_000_000, 3_000_000_000]) {
    for (const maxGoldenCrossAge of [5, 10]) {
      for (const minAdx of [15, 20]) {
        for (const minTrendR2 of [0.2, 0.4]) {
          for (const minScore of [35, 50]) {
            output.push({
              ...DEFAULT_EARLY_TREND_PARAMETERS,
              minTurnover,
              maxGoldenCrossAge,
              minAdx,
              minTrendR2,
              minScore,
            })
          }
        }
      }
    }
  }
  return output
}

const buildCompositeGrid = (): CompositeParameters[] => {
  const output: CompositeParameters[] = []
  const weights = [
    [1, 1, 1],
    [2, 1, 1],
    [1, 2, 1],
    [1, 1, 2],
  ] as const
  for (const minTurnover of [1_000_000_000, 3_000_000_000]) {
    for (const [weightPullback, weightBreakout, weightEarlyTrend] of weights) {
      for (const minScore of [30, 45]) {
        output.push({
          ...DEFAULT_COMPOSITE_PARAMETERS,
          minTurnover,
          minScore,
          weightPullback,
          weightBreakout,
          weightEarlyTrend,
        })
      }
    }
  }
  return output
}

export const PARAMETER_GRIDS: ParameterGridMap = {
  pullbackRebound: buildPullbackGrid(),
  volumeBreakout: buildBreakoutGrid(DEFAULT_VOLUME_BREAKOUT_PARAMETERS),
  volumeBreakoutBullishCandle: buildBreakoutGrid(DEFAULT_VOLUME_BREAKOUT_BULLISH_CANDLE_PARAMETERS),
  volumeBreakoutNoGapUp: buildBreakoutGrid(DEFAULT_VOLUME_BREAKOUT_NO_GAP_UP_PARAMETERS),
  earlyTrend: buildEarlyTrendGrid(),
  composite: buildCompositeGrid(),
}

const monthOf = (date: string): string => date.slice(0, 7)

export function createWalkForwardSplits(
  datesInput: readonly string[],
  trainMonthCount = 3,
  testMonthCount = 1,
  purgeDays = PURGE_DAYS,
): WalkForwardSplit[] {
  if (trainMonthCount <= 0 || testMonthCount <= 0 || purgeDays < 0) {
    throw new Error('walk-forward 기간과 purge는 음수가 아닌 유효한 값이어야 합니다')
  }
  const dates = [...new Set(datesInput.filter(Boolean))].sort()
  const datesByMonth = new Map<string, string[]>()
  for (const date of dates) {
    const month = monthOf(date)
    const monthDates = datesByMonth.get(month) ?? []
    monthDates.push(date)
    datesByMonth.set(month, monthDates)
  }
  const months = [...datesByMonth.keys()].sort()
  const splits: WalkForwardSplit[] = []
  const windowMonths = trainMonthCount + testMonthCount

  for (let start = 0; start + windowMonths <= months.length; start++) {
    const trainMonths = months.slice(start, start + trainMonthCount)
    const testMonths = months.slice(start + trainMonthCount, start + windowMonths)
    const rawTrainDates = trainMonths.flatMap((month) => datesByMonth.get(month) ?? [])
    const testDates = testMonths.flatMap((month) => datesByMonth.get(month) ?? [])
    if (rawTrainDates.length <= purgeDays || testDates.length === 0) continue
    splits.push({
      index: splits.length,
      trainMonths,
      testMonths,
      trainDates: purgeDays === 0 ? rawTrainDates : rawTrainDates.slice(0, -purgeDays),
      purgedDates: purgeDays === 0 ? [] : rawTrainDates.slice(-purgeDays),
      testDates,
    })
  }
  return splits
}

const parameterKey = <K extends StrategyName>(parameters: StrategyParameterMap[K], mode: SelectionMode): string => {
  if (mode === 'force3') return JSON.stringify({ ...parameters, minScore: 0 })
  return JSON.stringify(parameters)
}

const dedupeGrid = <K extends StrategyName>(
  grid: readonly StrategyParameterMap[K][],
  mode: SelectionMode,
): StrategyParameterMap[K][] => {
  const seen = new Set<string>()
  return grid.filter((parameters) => {
    const key = parameterKey(parameters, mode)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

interface EvaluationContext {
  readonly universe: readonly string[]
  readonly prices: PriceBook
  readonly tradingDays: TradingDayIndex
  readonly featuresByDate: ReadonlyMap<string, readonly StockFeatureVector[]>
  readonly masters: ReadonlyMap<string, StockMasterState>
}

const evaluateDates = <K extends StrategyName>(input: {
  readonly name: K
  readonly parameters: StrategyParameterMap[K]
  readonly mode: SelectionMode
  readonly dates: readonly string[]
  readonly context: EvaluationContext
  readonly omittedFeature?: AblationFeature
}): BacktestReport => {
  const startDate = input.dates[0]
  const endDate = input.dates.at(-1)
  if (!startDate || !endDate) throw new Error('평가할 거래일이 없습니다')
  return runBacktest({
    strategyName: `${input.name}:${input.mode}`,
    strategy: createCachedFeatureStrategy({
      name: input.name,
      featuresByDate: input.context.featuresByDate,
      masters: input.context.masters,
      parameters: input.parameters,
      mode: input.mode,
      omittedFeature: input.omittedFeature,
    }),
    universe: input.context.universe,
    prices: input.context.prices,
    tradingDays: input.context.tradingDays,
    startDate,
    endDate,
    calculateSlotPrecisionCi: false,
  })
}

/**
 * in-sample에서 매일 3픽을 채운 비율. 실측(optimize-v2): 타율만으로 선택하면
 * 9개 fold 중 5개가 후보 0인 세팅을 골라 OOS가 통째로 굶었다. 공급은 in-sample
 * 정보만 쓰므로 이 제약은 OOS 누출이 아니다.
 */
const supplyRatio = (report: BacktestReport): number =>
  report.totalDates > 0 ? report.totalPicks / (report.totalDates * 3) : 0

const FULL_SUPPLY_RATIO = 0.9

const betterTrainingReport = <K extends StrategyName>(
  candidate: { report: BacktestReport; parameters: StrategyParameterMap[K] },
  current: { report: BacktestReport; parameters: StrategyParameterMap[K] } | null,
  mode: SelectionMode,
): boolean => {
  if (!current) return true
  // 공급 계층 우선: in-sample에서 90% 이상 날짜에 3픽을 채운 세팅이 못 채운 세팅을 항상 이긴다
  const candidateSupplied = supplyRatio(candidate.report) >= FULL_SUPPLY_RATIO
  const currentSupplied = supplyRatio(current.report) >= FULL_SUPPLY_RATIO
  if (candidateSupplied !== currentSupplied) return candidateSupplied
  const candidatePrecision = candidate.report.precisionAt3 ?? -1
  const currentPrecision = current.report.precisionAt3 ?? -1
  if (candidatePrecision !== currentPrecision) return candidatePrecision > currentPrecision
  if (candidate.report.labeledPicks !== current.report.labeledPicks) {
    return candidate.report.labeledPicks > current.report.labeledPicks
  }
  if (candidate.report.nullRate !== current.report.nullRate) return candidate.report.nullRate < current.report.nullRate
  return parameterKey(candidate.parameters, mode) < parameterKey(current.parameters, mode)
}

const selectParameters = <K extends StrategyName>(input: {
  readonly name: K
  readonly grid: readonly StrategyParameterMap[K][]
  readonly mode: SelectionMode
  readonly trainDates: readonly string[]
  readonly context: EvaluationContext
}): { parameters: StrategyParameterMap[K]; report: BacktestReport } => {
  let best: { parameters: StrategyParameterMap[K]; report: BacktestReport } | null = null
  for (const parameters of dedupeGrid(input.grid, input.mode)) {
    const candidate = {
      parameters,
      report: evaluateDates({
        name: input.name,
        parameters,
        mode: input.mode,
        dates: input.trainDates,
        context: input.context,
      }),
    }
    if (betterTrainingReport(candidate, best, input.mode)) best = candidate
  }
  if (!best) throw new Error(`${input.name} 파라미터 그리드가 비어 있습니다`)
  return best
}

const countCandidates = <K extends StrategyName>(input: {
  readonly name: K
  readonly parameters: StrategyParameterMap[K]
  readonly mode: SelectionMode
  readonly dates: readonly string[]
  readonly context: EvaluationContext
  readonly omittedFeature?: AblationFeature
}): number[] => {
  const universe = new Set(input.context.universe)
  return input.dates.map((date) => {
    const features = input.context.featuresByDate.get(date) ?? []
    return rankStrategyCandidates({
      name: input.name,
      features,
      masters: input.context.masters,
      parameters: input.parameters,
      mode: input.mode,
      universe,
      omittedFeature: input.omittedFeature,
      pickCount: features.length,
    }).length
  })
}

const summarizeReports = (
  reports: readonly BacktestReport[],
  candidateCounts: readonly number[],
): OosMetricSummary => {
  const totalDates = reports.reduce((sum, report) => sum + report.totalDates, 0)
  const totalPicks = reports.reduce((sum, report) => sum + report.totalPicks, 0)
  const labeledPicks = reports.reduce((sum, report) => sum + report.labeledPicks, 0)
  const nullPicks = reports.reduce((sum, report) => sum + report.nullPicks, 0)
  const touchedPicks = reports.reduce((sum, report) => sum + report.touchedPicks, 0)
  const dailyHits = reports.flatMap((report) => report.dailyHits)
  const statusCounts: LabelStatusCounts = {
    hit: reports.reduce((sum, report) => sum + report.statusCounts.hit, 0),
    miss: reports.reduce((sum, report) => sum + report.statusCounts.miss, 0),
    unexpected_untradeable: reports.reduce((sum, report) => (
      sum + report.statusCounts.unexpected_untradeable
    ), 0),
    data_error: reports.reduce((sum, report) => sum + report.statusCounts.data_error, 0),
  }
  const slotDenominator = totalDates * 3
  const pickCounts = new Map<string, number>()
  for (const report of reports) {
    for (const day of report.daily) {
      for (const pick of day.picks) pickCounts.set(pick.symbol, (pickCounts.get(pick.symbol) ?? 0) + 1)
    }
  }
  const topTickers = [...pickCounts.entries()]
    .map(([symbol, picks]) => ({ symbol, picks, share: totalPicks > 0 ? picks / totalPicks : 0 }))
    .sort((left, right) => right.picks - left.picks || left.symbol.localeCompare(right.symbol))
  const herfindahlIndex = topTickers.reduce((sum, row) => sum + row.share * row.share, 0)

  return {
    evaluationScope: 'out_of_sample',
    totalDates,
    totalPicks,
    labeledPicks,
    nullPicks,
    touchedPicks,
    precisionAt3: labeledPicks - statusCounts.data_error > 0
      ? touchedPicks / (labeledPicks - statusCounts.data_error)
      : null,
    slotPrecisionAt3: slotDenominator > 0 ? touchedPicks / slotDenominator : null,
    slotPrecisionAt3Ci: movingBlockBootstrapCi(
      dailyHits.map((hits) => hits / 3),
      { seed: RANDOM_BASELINE_SEED },
    ),
    slotCoverage: slotDenominator > 0 ? totalPicks / slotDenominator : null,
    anyHitRate: totalDates > 0
      ? dailyHits.filter((hits) => hits >= 1).length / totalDates
      : null,
    twoPlusHitRate: totalDates > 0
      ? dailyHits.filter((hits) => hits >= 2).length / totalDates
      : null,
    dailyHits,
    statusCounts,
    dataErrorRate: totalPicks > 0 ? statusCounts.data_error / totalPicks : 0,
    nullRate: totalPicks > 0 ? nullPicks / totalPicks : 0,
    averageDailyCandidateCount: candidateCounts.length > 0
      ? candidateCounts.reduce((sum, count) => sum + count, 0) / candidateCounts.length
      : 0,
    pickDistribution: {
      uniqueTickers: pickCounts.size,
      topTickerShare: topTickers[0]?.share ?? 0,
      herfindahlIndex,
      topTickers: topTickers.slice(0, 20),
    },
  }
}

interface EvaluatedMode<K extends StrategyName> {
  readonly publicReport: StrategyModeReport<StrategyParameterMap[K]>
  readonly folds: ReadonlyArray<{
    readonly split: WalkForwardSplit
    readonly parameters: StrategyParameterMap[K]
    readonly testReport: BacktestReport
  }>
}

const evaluateStrategyMode = <K extends StrategyName>(input: {
  readonly name: K
  readonly grid: readonly StrategyParameterMap[K][]
  readonly mode: SelectionMode
  readonly splits: readonly WalkForwardSplit[]
  readonly context: EvaluationContext
}): EvaluatedMode<K> => {
  const segments: Array<WalkForwardSegment<StrategyParameterMap[K]>> = []
  const folds: Array<{
    split: WalkForwardSplit
    parameters: StrategyParameterMap[K]
    testReport: BacktestReport
  }> = []
  const candidateCounts: number[] = []

  for (const split of input.splits) {
    const selected = selectParameters({
      name: input.name,
      grid: input.grid,
      mode: input.mode,
      trainDates: split.trainDates,
      context: input.context,
    })
    const testReport = evaluateDates({
      name: input.name,
      parameters: selected.parameters,
      mode: input.mode,
      dates: split.testDates,
      context: input.context,
    })
    const foldCandidateCounts = countCandidates({
      name: input.name,
      parameters: selected.parameters,
      mode: input.mode,
      dates: split.testDates,
      context: input.context,
    })
    candidateCounts.push(...foldCandidateCounts)
    folds.push({ split, parameters: selected.parameters, testReport })
    segments.push({
      index: split.index,
      train: {
        startDate: split.trainDates[0],
        endDate: split.trainDates.at(-1)!,
        purgedDates: split.purgedDates,
        selectedParameters: selected.parameters,
        inSampleReference: {
          precisionAt3: selected.report.precisionAt3,
          labeledPicks: selected.report.labeledPicks,
          nullRate: selected.report.nullRate,
        },
      },
      test: {
        evaluationScope: 'out_of_sample',
        startDate: split.testDates[0],
        endDate: split.testDates.at(-1)!,
        precisionAt3: testReport.precisionAt3,
        labeledPicks: testReport.labeledPicks,
        nullRate: testReport.nullRate,
        averageDailyCandidateCount: foldCandidateCounts.length > 0
          ? foldCandidateCounts.reduce((sum, count) => sum + count, 0) / foldCandidateCounts.length
          : 0,
      },
    })
  }

  return {
    publicReport: {
      mode: input.mode,
      aggregate: summarizeReports(folds.map((fold) => fold.testReport), candidateCounts),
      segments,
    },
    folds,
  }
}

interface EvaluatedBaseline {
  readonly summary: OosMetricSummary
  readonly reports: readonly BacktestReport[]
}

const evaluateBaseline = (
  splits: readonly WalkForwardSplit[],
  context: EvaluationContext,
  strategyName: string,
  strategy: StockPickStrategy,
  candidateCountByDate: ReadonlyMap<string, number>,
): EvaluatedBaseline => {
  const reports = splits.map((split) => runBacktest({
    strategyName,
    strategy,
    universe: context.universe,
    prices: context.prices,
    tradingDays: context.tradingDays,
    startDate: split.testDates[0],
    endDate: split.testDates.at(-1),
    calculateSlotPrecisionCi: false,
  }))
  const candidateCounts = splits.flatMap((split) => split.testDates.map((date) => (
    candidateCountByDate.get(date) ?? 0
  )))
  return { summary: summarizeReports(reports, candidateCounts), reports }
}

const buildEligiblePoolByDate = (
  context: EvaluationContext,
): ReadonlyMap<string, readonly string[]> => {
  const universe = new Set(context.universe)
  return new Map([...context.featuresByDate.entries()].map(([date, features]) => [
    date,
    features.filter((feature) => (
      universe.has(feature.symbol)
      && passesCommonGate(
        feature,
        context.masters.get(feature.symbol),
        PRODUCTION_VOLUME_BREAKOUT_PARAMETERS.minTurnover,
        PRODUCTION_VOLUME_BREAKOUT_PARAMETERS.maxRsi ?? 70,
      )
    )).map((feature) => feature.symbol).sort(),
  ]))
}

const evaluateBaselines = (
  splits: readonly WalkForwardSplit[],
  context: EvaluationContext,
): {
  readonly random3: EvaluatedBaseline
  readonly policyRandom3: EvaluatedBaseline
  readonly volumeOnly3: EvaluatedBaseline
} => {
  const eligiblePoolByDate = buildEligiblePoolByDate(context)
  const eligibleCounts = new Map([...eligiblePoolByDate.entries()].map(([date, symbols]) => (
    [date, symbols.length]
  )))
  const universeCounts = new Map(splits.flatMap((split) => split.testDates).map((date) => (
    [date, context.universe.length]
  )))
  return {
    random3: evaluateBaseline(
      splits,
      context,
      'random3:oos',
      createRandom3Strategy(RANDOM_BASELINE_SEED),
      universeCounts,
    ),
    policyRandom3: evaluateBaseline(
      splits,
      context,
      'policyRandom3:oos',
      createPolicyRandomStrategy(eligiblePoolByDate, RANDOM_BASELINE_SEED),
      eligibleCounts,
    ),
    volumeOnly3: evaluateBaseline(
      splits,
      context,
      'volumeOnly3:oos',
      createVolumeOnlyStrategy(
        context.featuresByDate,
        context.masters,
        PRODUCTION_VOLUME_BREAKOUT_PARAMETERS,
      ),
      eligibleCounts,
    ),
  }
}

const evaluateCompositeAblation = (
  baseline: EvaluatedMode<'composite'>,
  context: EvaluationContext,
): OptimizationReport['compositeAblation'] => {
  const baselinePrecision = baseline.publicReport.aggregate.precisionAt3
  const rows = COMPOSITE_ABLATION_FEATURES.map((omittedFeature) => {
    const reports: BacktestReport[] = []
    for (const fold of baseline.folds) {
      reports.push(evaluateDates({
        name: 'composite',
        parameters: fold.parameters,
        mode: 'force3',
        dates: fold.split.testDates,
        context,
        omittedFeature,
      }))
    }
    const metrics = summarizeReports(reports, [])
    return {
      omittedFeature,
      precisionAt3: metrics.precisionAt3,
      deltaVsBaseline: metrics.precisionAt3 === null || baselinePrecision === null
        ? null
        : metrics.precisionAt3 - baselinePrecision,
      labeledPicks: metrics.labeledPicks,
      nullRate: metrics.nullRate,
    }
  })
  return {
    evaluationScope: 'out_of_sample',
    mode: 'force3',
    method: 'score_weight_zero_gate_preserved',
    excludedFeatures: COMPOSITE_ABLATION_EXCLUSIONS,
    baselinePrecisionAt3: baselinePrecision,
    rows,
  }
}

export function precomputeFeatureMap(input: {
  readonly prices: PriceBook
  readonly tradingDays: TradingDayIndex
  readonly masters: readonly StockMasterState[]
  readonly historyDates: readonly string[]
  readonly evaluationStart: string
  readonly onProgress?: (completed: number, total: number) => void
}): ReadonlyMap<string, readonly StockFeatureVector[]> {
  const featuresByDate = new Map<string, StockFeatureVector[]>()
  const lastFeatureDate = input.historyDates.at(-1)
  if (!lastFeatureDate) return featuresByDate
  const handler = new StockDataHandler(input.prices, input.tradingDays).at(lastFeatureDate)

  input.masters.forEach((master, index) => {
    const features = buildFeatureSeries({
      handler,
      symbol: master.symbol,
      dates: input.historyDates,
      includeFromDate: input.evaluationStart,
    })
    for (const feature of features) {
      const dayFeatures = featuresByDate.get(feature.simDate) ?? []
      dayFeatures.push(feature)
      featuresByDate.set(feature.simDate, dayFeatures)
    }
    input.onProgress?.(index + 1, input.masters.length)
  })

  for (const dayFeatures of featuresByDate.values()) {
    dayFeatures.sort((left, right) => left.symbol.localeCompare(right.symbol))
  }
  return featuresByDate
}

export function runWalkForwardOptimization(input: {
  readonly prices: PriceBook
  readonly tradingDays: TradingDayIndex
  readonly masters: readonly StockMasterState[]
  readonly featuresByDate: ReadonlyMap<string, readonly StockFeatureVector[]>
  readonly splits: readonly WalkForwardSplit[]
  readonly parameterGrids?: ParameterGridMap
  readonly generatedAt?: string
}): OptimizationReport {
  if (input.splits.length === 0) throw new Error('유효한 walk-forward 분할이 없습니다')
  const grids = input.parameterGrids ?? PARAMETER_GRIDS
  for (const name of Object.keys(grids) as StrategyName[]) {
    if (grids[name].length > 200) throw new Error(`${name} 그리드가 200조합을 초과했습니다`)
  }
  const masters = new Map(input.masters.map((row) => [row.symbol, row]))
  const context: EvaluationContext = {
    universe: input.masters.filter((row) => row.is_active).map((row) => row.symbol).sort(),
    prices: input.prices,
    tradingDays: input.tradingDays,
    featuresByDate: input.featuresByDate,
    masters,
  }

  const pullbackForce = evaluateStrategyMode({
    name: 'pullbackRebound', grid: grids.pullbackRebound, mode: 'force3', splits: input.splits, context,
  })
  const pullbackAbstain = evaluateStrategyMode({
    name: 'pullbackRebound', grid: grids.pullbackRebound, mode: 'abstain', splits: input.splits, context,
  })
  const breakoutForce = evaluateStrategyMode({
    name: 'volumeBreakout', grid: grids.volumeBreakout, mode: 'force3', splits: input.splits, context,
  })
  const breakoutAbstain = evaluateStrategyMode({
    name: 'volumeBreakout', grid: grids.volumeBreakout, mode: 'abstain', splits: input.splits, context,
  })
  const breakoutBullishForce = evaluateStrategyMode({
    name: 'volumeBreakoutBullishCandle',
    grid: grids.volumeBreakoutBullishCandle,
    mode: 'force3',
    splits: input.splits,
    context,
  })
  const breakoutBullishAbstain = evaluateStrategyMode({
    name: 'volumeBreakoutBullishCandle',
    grid: grids.volumeBreakoutBullishCandle,
    mode: 'abstain',
    splits: input.splits,
    context,
  })
  const breakoutNoGapForce = evaluateStrategyMode({
    name: 'volumeBreakoutNoGapUp',
    grid: grids.volumeBreakoutNoGapUp,
    mode: 'force3',
    splits: input.splits,
    context,
  })
  const breakoutNoGapAbstain = evaluateStrategyMode({
    name: 'volumeBreakoutNoGapUp',
    grid: grids.volumeBreakoutNoGapUp,
    mode: 'abstain',
    splits: input.splits,
    context,
  })
  const earlyForce = evaluateStrategyMode({
    name: 'earlyTrend', grid: grids.earlyTrend, mode: 'force3', splits: input.splits, context,
  })
  const earlyAbstain = evaluateStrategyMode({
    name: 'earlyTrend', grid: grids.earlyTrend, mode: 'abstain', splits: input.splits, context,
  })
  const compositeForce = evaluateStrategyMode({
    name: 'composite', grid: grids.composite, mode: 'force3', splits: input.splits, context,
  })
  const compositeAbstain = evaluateStrategyMode({
    name: 'composite', grid: grids.composite, mode: 'abstain', splits: input.splits, context,
  })
  const strategies = {
    pullbackRebound: { force3: pullbackForce.publicReport, abstain: pullbackAbstain.publicReport },
    volumeBreakout: { force3: breakoutForce.publicReport, abstain: breakoutAbstain.publicReport },
    volumeBreakoutBullishCandle: {
      force3: breakoutBullishForce.publicReport,
      abstain: breakoutBullishAbstain.publicReport,
    },
    volumeBreakoutNoGapUp: {
      force3: breakoutNoGapForce.publicReport,
      abstain: breakoutNoGapAbstain.publicReport,
    },
    earlyTrend: { force3: earlyForce.publicReport, abstain: earlyAbstain.publicReport },
    composite: { force3: compositeForce.publicReport, abstain: compositeAbstain.publicReport },
  }
  const lift = (name: StrategyName): number | null => {
    const forcePrecision = strategies[name].force3.aggregate.precisionAt3
    const abstainPrecision = strategies[name].abstain.aggregate.precisionAt3
    return forcePrecision === null || abstainPrecision === null ? null : abstainPrecision - forcePrecision
  }
  const firstDate = input.splits[0].trainDates[0]
  const lastDate = input.splits.at(-1)!.testDates.at(-1)!
  const evaluationDates = [...new Set(input.splits.flatMap((split) => [
    ...split.trainDates,
    ...split.purgedDates,
    ...split.testDates,
  ]))]
  const baselines = evaluateBaselines(input.splits, context)

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    evaluationPolicy: {
      headlineMetrics: 'out_of_sample_only',
      trainMonths: 3,
      testMonths: 1,
      purgeTradingDays: 5,
      label: 'entry_open_to_5_holding_day_high_plus_10_percent_touch',
    },
    dateRange: {
      evaluationStart: firstDate,
      evaluationEnd: lastDate,
      evaluationDays: evaluationDates.length,
      foldCount: input.splits.length,
    },
    baselines: {
      oosRandom3: baselines.random3.summary,
      oosPolicyRandom3: baselines.policyRandom3.summary,
      oosVolumeOnly3: baselines.volumeOnly3.summary,
      providedReferences: {
        randomFullPeriod: 0.215,
        llmPipelineFullPeriod: 0.307,
        scope: 'user_provided_full_period_reference_not_used_for_optimization',
      },
    },
    strategies,
    abstainLift: {
      pullbackRebound: lift('pullbackRebound'),
      volumeBreakout: lift('volumeBreakout'),
      volumeBreakoutBullishCandle: lift('volumeBreakoutBullishCandle'),
      volumeBreakoutNoGapUp: lift('volumeBreakoutNoGapUp'),
      earlyTrend: lift('earlyTrend'),
      composite: lift('composite'),
    },
    compositeAblation: evaluateCompositeAblation(compositeForce, context),
    caveats: {
      survivorshipBias: 'Universe uses current stock_master rows. Delisted or historically inactive stocks are absent, so historical OOS results can be optimistically biased.',
      referenceBaselineScope: 'The supplied 21.5% random and 30.7% LLM figures are full-period references; strategy headline metrics above are OOS only.',
    },
  }
}

export function buildDatasetFingerprint(input: {
  readonly tradingDays: TradingDayIndex
  readonly prices: PriceBook
}): FrozenProductionEvaluationReport['datasetFingerprint'] {
  return {
    tradingDays: {
      first: input.tradingDays.firstDate,
      last: input.tradingDays.lastDate,
      count: input.tradingDays.tradingDays.length,
    },
    priceRows: [...input.prices.values()].reduce((sum, rows) => sum + rows.size, 0),
    symbols: input.prices.size,
  }
}

const summarizePairedComparison = (
  productionReports: readonly BacktestReport[],
  baselineReports: readonly BacktestReport[],
): PairedComparisonSummary => {
  const paired = pairedDailyDelta(
    { daily: productionReports.flatMap((report) => report.daily) },
    { daily: baselineReports.flatMap((report) => report.daily) },
  )
  return {
    daily: [...paired],
    excludedDates: {
      onlyProduction: paired.excludedDates.onlyA,
      onlyBaseline: paired.excludedDates.onlyB,
      total: paired.excludedDates.total,
    },
    slotPrecisionAt3DeltaCi: movingBlockBootstrapCi(
      paired.map((row) => row.delta / 3),
      { seed: RANDOM_BASELINE_SEED },
    ),
  }
}

/** 프로덕션 파라미터를 재선택 없이 각 walk-forward test 구간에 그대로 적용한다. */
export function runFrozenProductionEvaluation(input: {
  readonly prices: PriceBook
  readonly tradingDays: TradingDayIndex
  readonly masters: readonly StockMasterState[]
  readonly featuresByDate: ReadonlyMap<string, readonly StockFeatureVector[]>
  readonly splits: readonly WalkForwardSplit[]
  readonly generatedAt?: string
}): FrozenProductionEvaluationReport {
  if (input.splits.length === 0) throw new Error('유효한 walk-forward 분할이 없습니다')
  const context: EvaluationContext = {
    universe: input.masters.filter((row) => row.is_active).map((row) => row.symbol).sort(),
    prices: input.prices,
    tradingDays: input.tradingDays,
    featuresByDate: input.featuresByDate,
    masters: new Map(input.masters.map((row) => [row.symbol, row])),
  }
  const reports = input.splits.map((split) => evaluateDates({
    name: 'volumeBreakoutNoGapUp',
    parameters: PRODUCTION_VOLUME_BREAKOUT_PARAMETERS,
    mode: 'force3',
    dates: split.testDates,
    context,
  }))
  const candidateCounts = input.splits.flatMap((split) => countCandidates({
    name: 'volumeBreakoutNoGapUp',
    parameters: PRODUCTION_VOLUME_BREAKOUT_PARAMETERS,
    mode: 'force3',
    dates: split.testDates,
    context,
  }))
  const evaluationDates = [...new Set(input.splits.flatMap((split) => split.testDates))]
  const baselines = evaluateBaselines(input.splits, context)

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    evaluationPolicy: {
      evaluationScope: 'walk_forward_test_dates',
      parameterSelection: 'frozen_no_fold_reselection',
      strategy: 'volumeBreakoutNoGapUp',
      mode: 'force3',
    },
    strategy: PRODUCTION_STRATEGY,
    parameters: PRODUCTION_VOLUME_BREAKOUT_PARAMETERS,
    datasetFingerprint: buildDatasetFingerprint(input),
    dateRange: {
      evaluationStart: evaluationDates[0],
      evaluationEnd: evaluationDates.at(-1)!,
      evaluationDays: evaluationDates.length,
      foldCount: input.splits.length,
    },
    aggregate: summarizeReports(reports, candidateCounts),
    baselines: {
      oosRandom3: baselines.random3.summary,
      oosPolicyRandom3: baselines.policyRandom3.summary,
      oosVolumeOnly3: baselines.volumeOnly3.summary,
    },
    pairedDailyDelta: {
      productionMinusVolumeOnly: summarizePairedComparison(
        reports,
        baselines.volumeOnly3.reports,
      ),
      productionMinusPolicyRandom: summarizePairedComparison(
        reports,
        baselines.policyRandom3.reports,
      ),
    },
  }
}

const readOption = (args: readonly string[], name: string): string | undefined => {
  const inline = args.find((arg) => arg.startsWith(`${name}=`))
  if (inline) return inline.slice(name.length + 1)
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}

const printUsage = (): void => {
  console.log([
    'Usage: npx tsx scripts/stock-picks/optimize.ts --out <path.json>',
    '',
    'Options:',
    '  --out PATH   OOS walk-forward JSON 결과 경로 (필수)',
    '  --days N     최근 평가 거래일 수 (기본 220)',
    '  --frozen     프로덕션 volumeBreakout 파라미터를 fold 재선택 없이 평가',
    '  --allow-dirty-data  누락 거래일/OHLC 오류가 있어도 연구 실행을 계속',
  ].join('\n'))
}

async function runCli(args: readonly string[]): Promise<void> {
  const out = readOption(args, '--out')
  if (!out) throw new Error('--out <path.json>이 필요합니다')
  const requestedDays = Number(readOption(args, '--days') ?? DEFAULT_EVALUATION_DAYS)
  if (!Number.isInteger(requestedDays) || requestedDays <= 0) throw new Error('--days는 양의 정수여야 합니다')

  const [tradingDays, masters] = await Promise.all([loadTradingDayIndex(), loadStockMasterStates()])
  const maturedDates = tradingDays.tradingDays.slice(0, -LABEL_LOOKAHEAD_DAYS)
  const evaluationDates = maturedDates.slice(-requestedDays)
  const evaluationStart = evaluationDates[0]
  const evaluationEnd = evaluationDates.at(-1)
  if (!evaluationStart || !evaluationEnd) throw new Error('라벨 성숙 거래일이 부족합니다')
  const evaluationStartIndex = tradingDays.indexByDate.get(evaluationStart)!
  const historyStartIndex = Math.max(0, evaluationStartIndex - FEATURE_WARMUP_DAYS)
  const historyDates = tradingDays.tradingDays.slice(historyStartIndex, evaluationStartIndex + evaluationDates.length)
  const prices = await loadPriceBook({
    startDate: historyDates[0],
    endDate: tradingDays.lastDate ?? evaluationEnd,
  })
  const dataContract = validateResearchDataset({
    tradingDays,
    prices,
    fromDate: historyDates[0] ?? evaluationStart,
    toDate: tradingDays.lastDate ?? evaluationEnd,
  })
  console.log(JSON.stringify({ event: 'research_data_contract', ...dataContract }))
  if (
    !args.includes('--allow-dirty-data')
    && (dataContract.missingTradingDays.length > 0 || dataContract.invalidOhlcRows > 0)
  ) {
    throw new Error('연구 데이터 계약 실패: --allow-dirty-data 없이는 optimize를 실행하지 않습니다')
  }
  console.log(`피처 사전계산: symbols=${masters.length} evaluationDays=${evaluationDates.length}`)
  const featuresByDate = precomputeFeatureMap({
    prices,
    tradingDays,
    masters,
    historyDates,
    evaluationStart,
    onProgress: (completed, total) => {
      if (completed % 100 === 0 || completed === total) console.log(`피처 ${completed}/${total}`)
    },
  })
  const splits = createWalkForwardSplits(evaluationDates)
  const frozen = args.includes('--frozen')
  const report = frozen
    ? runFrozenProductionEvaluation({ prices, tradingDays, masters, featuresByDate, splits })
    : runWalkForwardOptimization({ prices, tradingDays, masters, featuresByDate, splits })
  const outputPath = resolve(process.cwd(), out)
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  if (frozen) {
    const frozenReport = report as FrozenProductionEvaluationReport
    console.log(JSON.stringify({
      outputPath,
      folds: frozenReport.dateRange.foldCount,
      frozenPrecisionAt3: frozenReport.aggregate.precisionAt3,
      frozenSlotPrecisionAt3: frozenReport.aggregate.slotPrecisionAt3,
      labeledPicks: frozenReport.aggregate.labeledPicks,
    }, null, 2))
  } else {
    const optimizationReport = report as OptimizationReport
    console.log(JSON.stringify({
      outputPath,
      folds: optimizationReport.dateRange.foldCount,
      oos: Object.fromEntries((Object.keys(optimizationReport.strategies) as StrategyName[]).map((name) => [name, {
        force3: optimizationReport.strategies[name].force3.aggregate.precisionAt3,
        abstain: optimizationReport.strategies[name].abstain.aggregate.precisionAt3,
      }])),
    }, null, 2))
  }
}

const isDirectRun = /optimize\.(?:ts|js)$/.test(process.argv[1] ?? '')
if (isDirectRun) {
  const args = process.argv.slice(2)
  if (args.includes('--help') || args.includes('-h')) printUsage()
  else runCli(args).catch((error: unknown) => {
    // Supabase 오류 등 non-Error throw가 "[object Object]"로 뭉개지지 않도록 전체 직렬화
    console.error(
      error instanceof Error
        ? error.stack ?? error.message
        : JSON.stringify(error, Object.getOwnPropertyNames(error ?? {})),
    )
    process.exitCode = 1
  })
}
