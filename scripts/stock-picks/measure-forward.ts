import { getLastFinalizedTradingDate } from '@/lib/tli/trading-calendar'
import type { LabelStatusCounts } from '@/scripts/stock-picks/backtest'
import { validateResearchDataset } from '@/scripts/stock-picks/data-contract'
import { getRawPrice, loadPriceBook, type PriceBook } from '@/scripts/stock-picks/data-handler'
import { labelEntryDay, labelPick, type StockPickEntryDayLabel, type StockPickLabel } from '@/scripts/stock-picks/label'
import type { StockPickSnapshot } from '@/scripts/stock-picks/pick-snapshots'
import { loadStockPickSnapshots } from '@/scripts/stock-picks/pick-snapshots'
import { LEGACY_VOLUME_BREAKOUT_STRATEGY, PRODUCTION_STRATEGY } from '@/scripts/stock-picks/production-strategy'
import { TradingDayIndex, loadTradingDayIndex } from '@/scripts/stock-picks/trading-days'
import { estimateRoundTripCost, reconstructExitPrice } from '@/scripts/stock-picks/trading-cost'

const DEFAULT_LOOKBACK_DAYS = 60
const RECENT_WEEK_COUNT = 4
const INFORMATIONAL_HOLDING_DAYS = 8
// WHY: 전방 측정 비교 지표는 연속성을 위해 30bps로 고정하고, 현실 비용은 별도로 계산한다.
const DEFAULT_ROUND_TRIP_COST_BPS = 30
export type ForwardPicksSource = 'code' | 'llm_fallback' | 'crash' | null
export type ForwardNullReason = 'missingEntryOpen' | 'missingWindowData'
type SourceKey = Exclude<ForwardPicksSource, null> | 'null'

export interface PublishedNewsletterRow {
  readonly newsletter_date: string
  readonly gemini_analysis: string
  readonly picks_source: string | null
}

interface PublishedPick {
  readonly publicationDate: string
  readonly symbol: string
  readonly picksSource: ForwardPicksSource
}

interface MaturePick extends PublishedPick {
  readonly signalDate: string
  readonly entryDate: string
  readonly maturityDate: string
}

interface EvaluatedPick extends MaturePick {
  readonly label: StockPickLabel | null
  readonly nullReason: ForwardNullReason | null
}

export interface RealisticCostSummary {
  readonly evaluablePicks: number
  readonly meanNetReturn: number | null
  readonly medianNetReturn: number | null
  readonly positiveRate: number | null
  readonly lossRate: number | null
  readonly meanAppliedCostBps: number | null
}

export interface EntryDaySummary {
  /** 5일 성숙 여부와 무관하게 진입일이 마감된 추천 수. */
  readonly totalPicks: number
  readonly evaluablePicks: number
  readonly bullishPicks: number
  readonly bullishRate: number | null
  readonly allPickBullishRate: number | null
  readonly meanReturn: number | null
  readonly roundTripCostBps: number
  readonly meanGrossReturn: number | null
  readonly meanNetReturn: number | null
  readonly realisticCost: RealisticCostSummary
}

export interface JointOutcomeSummary {
  readonly evaluablePicks: number
  readonly hitPicks: number
  readonly hitRate: number | null
  readonly allPickHitRate: number | null
}

export interface TargetExitProxySummary {
  /** OHLC 도달 시 +10%, 아니면 D5 종가 청산 가정. 실제 체결 수익이 아니다. */
  readonly roundTripCostBps: number
  readonly evaluablePicks: number
  readonly positiveRate: number | null
  readonly meanGrossReturn: number | null
  readonly meanNetReturn: number | null
  readonly medianGrossReturn: number | null
  readonly medianNetReturn: number | null
  readonly worstGrossReturn: number | null
  readonly worstNetReturn: number | null
  /** 목표 도달일을 저장하지 않으므로 D5 세율을 적용하는 민감도 가정이다. */
  readonly realisticCost: RealisticCostSummary
}

export interface ForwardAccuracySummary {
  readonly totalPicks: number
  readonly labeledPicks: number
  readonly nullPicks: number
  readonly touchedPicks: number
  readonly statusCounts: LabelStatusCounts
  readonly hitRate: number | null
  readonly nullRate: number
  readonly evaluablePicks: number
  /** 성숙한 모든 추천을 분모에 포함한다. 오류를 제외한 hitRate와 구분한다. */
  readonly allPickHitRate: number | null
  readonly jointOutcome5d: JointOutcomeSummary
  readonly targetExitProxy5d: TargetExitProxySummary
  readonly returns5d: {
    readonly roundTripCostBps: number
    readonly evaluablePicks: number
    readonly positivePicks: number
    readonly positiveRate: number | null
    readonly meanGrossReturn: number | null
    readonly meanNetReturn: number | null
    readonly medianGrossReturn: number | null
    readonly medianNetReturn: number | null
    readonly worstGrossReturn: number | null
    readonly worstNetReturn: number | null
    readonly meanMaxAdverseExcursion: number | null
    readonly touchedButNotProfitablePicks: number
    readonly realisticCost: RealisticCostSummary
  }
}

export interface ForwardWeeklySummary extends ForwardAccuracySummary {
  readonly startDate: string
  readonly endDate: string
}

export interface ShadowForwardStrategySummary {
  readonly dayCount: number
  readonly pickCount: number
  readonly labeledPickCount: number
  readonly hitCount: number
  readonly slotDenominator: number
  readonly slotPrecisionAt3: number | null
}

export interface ShadowForwardComparison {
  readonly startDate: string
  readonly endDate: string
  readonly snapshotCount: number
  readonly publishedV1: ShadowForwardStrategySummary
  readonly productionV0Only: ShadowForwardStrategySummary
  readonly slotPrecisionDifferencePercentagePoints: number | null
}

export interface ForwardMeasurementReport {
  readonly asOfDate: string
  readonly lookbackDays: number
  readonly startDate: string
  readonly roundTripCostBps: number
  readonly publishedNewsletterCount: number
  readonly invalidNewsletterCount: number
  readonly crashNewsletterCount: number
  readonly loadedPickCount: number
  readonly immaturePickCount: number
  readonly overall: ForwardAccuracySummary
  readonly informational8HoldingDays: ForwardAccuracySummary
  readonly byPicksSource: Readonly<Record<SourceKey, ForwardAccuracySummary>>
  readonly entryDay: EntryDaySummary
  readonly entryDayByPicksSource: Readonly<Record<SourceKey, EntryDaySummary>>
  readonly nullBreakdown: Readonly<Record<ForwardNullReason, number>>
  readonly recent4Weeks: readonly ForwardWeeklySummary[]
  readonly shadowComparison: ShadowForwardComparison
  readonly strategyComparison: readonly StrategyForwardSummary[]
  readonly pairedStrategyComparison: readonly PairedStrategyForwardSummary[]
  readonly scoreTies: ForwardTieRateSummary
}

export interface ForwardTieRateSummary {
  readonly totalDates: number
  readonly evaluableDates: number
  readonly tiedDates: number
  readonly fewerThanFourCandidatesDates: number
  readonly tieRate: number | null
}

export interface StrategyForwardSummary {
  readonly strategy: string
  readonly pickCount: number
  readonly labeledPickCount: number
  readonly touchRate5d: number | null
  readonly meanCloseReturn5d: number | null
  readonly meanNetCloseReturn5d: number | null
  readonly realisticCost5d: RealisticCostSummary
  readonly roundTripCostBps: number
  /** 기존 API: 5일 성숙 추천의 D1 양봉률. 최근 추천까지 포함한 수치는 entryDay. */
  readonly entryBullishRate: number | null
  readonly entryDay: EntryDaySummary
  readonly jointOutcome5d: JointOutcomeSummary
  readonly targetExitProxy5d: TargetExitProxySummary
}

export interface PairedStrategyForwardSummary extends StrategyForwardSummary {
  readonly commonDayCount: number
}

const PAIRED_STRATEGIES = [
  PRODUCTION_STRATEGY.name,
  'shadow:bullishTarget-v3',
  'shadow:A-volumeBreakout-v1.1',
  'shadow:B-random',
  'shadow:J-randomConstrained',
] as const

const SOURCE_KEYS: readonly SourceKey[] = ['code', 'llm_fallback', 'crash', 'null']

const addCalendarDays = (date: string, days: number): string => {
  const parsed = new Date(`${date}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime())) throw new Error(`올바르지 않은 날짜입니다: ${date}`)
  parsed.setUTCDate(parsed.getUTCDate() + days)
  return parsed.toISOString().slice(0, 10)
}

const sourceKey = (source: ForwardPicksSource): SourceKey => source ?? 'null'

const normalizeSource = (source: string | null): ForwardPicksSource => (
  source === 'code' || source === 'llm_fallback' || source === 'crash' ? source : null
)

const rate = (numerator: number, denominator: number): number | null => denominator > 0 ? numerator / denominator : null
const mean = (values: readonly number[]): number | null => values.length > 0
  ? values.reduce((sum, value) => sum + value, 0) / values.length : null
const medianSorted = (values: readonly number[]): number | null => values.length > 0
  ? (values[Math.floor((values.length - 1) / 2)]! + values[Math.floor(values.length / 2)]!) / 2 : null

const validateCostBps = (value: number): void => {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`roundTripCostBps는 0 이상의 유한수여야 합니다: ${value}`)
  }
}

const summarizeRealisticCost = (outcomes: readonly {
  readonly entryPrice: number
  readonly exitPrice: number
  readonly sellDate: string
  readonly grossReturn: number
}[]): RealisticCostSummary => {
  const costs = outcomes.map(estimateRoundTripCost)
  const netReturns = outcomes.map((outcome, index) => (
    outcome.grossReturn - costs[index]!.costBps / 10_000
  )).sort((a, b) => a - b)
  return {
    evaluablePicks: outcomes.length,
    meanNetReturn: mean(netReturns),
    medianNetReturn: medianSorted(netReturns),
    positiveRate: rate(netReturns.filter((value) => value > 0).length, netReturns.length),
    lossRate: rate(netReturns.filter((value) => value < 0).length, netReturns.length),
    meanAppliedCostBps: mean(costs.map((cost) => cost.costBps)),
  }
}

const summarizeLabelRealisticCost = (
  labels: readonly (StockPickLabel | null)[],
  tradingDays: TradingDayIndex,
  returnKey: 'return5d' | 'targetExitReturn5d' = 'return5d',
): RealisticCostSummary => summarizeRealisticCost(labels.flatMap((label) => {
  if (!label || (label.status !== 'hit' && label.status !== 'miss')) return []
  const grossReturn = label[returnKey]
  // WHY: 8보유일 참고 집계에서도 return5d의 청산일은 D5다. 목표가 모형도
  // 도달일을 저장하지 않으므로 D5 세율을 가정하되, 모형의 청산가격을 사용한다.
  const sellDate = tradingDays.nextTradingDay(label.entryDate, 4)
  return label.entry !== null && grossReturn !== null && Number.isFinite(grossReturn) && sellDate
    ? [{ entryPrice: label.entry, exitPrice: reconstructExitPrice(label.entry, grossReturn), sellDate, grossReturn }]
    : []
}))

const summarizeEntryDay = (
  labels: readonly (StockPickEntryDayLabel | null)[],
  roundTripCostBps: number,
): EntryDaySummary => {
  const valid = labels.filter((label): label is StockPickEntryDayLabel => label !== null)
  const bullishPicks = valid.filter((label) => label.entryBullish).length
  const grossReturns = valid.map((label) => label.entryReturn)
  return {
    totalPicks: labels.length,
    evaluablePicks: valid.length,
    bullishPicks,
    bullishRate: rate(bullishPicks, valid.length),
    allPickBullishRate: rate(bullishPicks, labels.length),
    meanReturn: mean(grossReturns),
    roundTripCostBps,
    meanGrossReturn: mean(grossReturns),
    meanNetReturn: mean(grossReturns.map((value) => value - roundTripCostBps / 10_000)),
    realisticCost: summarizeRealisticCost(valid.map((label) => ({
      entryPrice: label.entry, exitPrice: label.close, sellDate: label.entryDate, grossReturn: label.entryReturn,
    }))),
  }
}

const summarizeObjectives = (
  labels: readonly (StockPickLabel | null)[],
  roundTripCostBps: number,
  tradingDays: TradingDayIndex,
): { jointOutcome5d: JointOutcomeSummary; targetExitProxy5d: TargetExitProxySummary } => {
  const jointLabels = labels.filter((label) => label?.bullishAndTouched10In5d != null)
  const hitPicks = jointLabels.filter((label) => label?.bullishAndTouched10In5d === true).length
  const grossReturns = labels.flatMap((label) => (
    label?.targetExitReturn5d != null && Number.isFinite(label.targetExitReturn5d)
      ? [label.targetExitReturn5d] : []
  )).sort((a, b) => a - b)
  const netReturns = grossReturns.map((value) => value - roundTripCostBps / 10_000)
  return {
    jointOutcome5d: {
      evaluablePicks: jointLabels.length,
      hitPicks,
      hitRate: rate(hitPicks, jointLabels.length),
      allPickHitRate: rate(hitPicks, labels.length),
    },
    targetExitProxy5d: {
      roundTripCostBps,
      evaluablePicks: netReturns.length,
      positiveRate: rate(netReturns.filter((value) => value > 0).length, netReturns.length),
      meanGrossReturn: mean(grossReturns),
      meanNetReturn: mean(netReturns),
      medianGrossReturn: medianSorted(grossReturns),
      medianNetReturn: medianSorted(netReturns),
      worstGrossReturn: grossReturns[0] ?? null,
      worstNetReturn: netReturns[0] ?? null,
      realisticCost: summarizeLabelRealisticCost(labels, tradingDays, 'targetExitReturn5d'),
    },
  }
}

const summarize = (
  picks: readonly EvaluatedPick[], roundTripCostBps: number, tradingDays: TradingDayIndex,
): ForwardAccuracySummary => {
  const labels = picks.flatMap((pick) => pick.label ? [pick.label] : [])
  const touchedPicks = labels.filter((label) => label.touched).length
  const conditionalLabelCount = labels.filter((label) => label.status !== 'data_error').length
  const nullPicks = picks.length - labels.length
  // +10% 장중 터치와 5일 종가 청산 수익은 별개다. 비용은 진입금액 대비 왕복 bps 가정이다.
  const tradeableLabels = labels.filter((label) => (
    (label.status === 'hit' || label.status === 'miss')
    && label.return5d !== null && Number.isFinite(label.return5d)
  ))
  const grossReturns = tradeableLabels.map((label) => label.return5d!).sort((a, b) => a - b)
  const netReturns = grossReturns.map((value) => value - roundTripCostBps / 10_000)
  const positivePicks = netReturns.filter((value) => value > 0).length
  const adverseExcursions = tradeableLabels.flatMap((label) => (
    label.maxDrawdown !== null && Number.isFinite(label.maxDrawdown) ? [label.maxDrawdown] : []
  ))
  const statusCounts: LabelStatusCounts = {
    hit: labels.filter((label) => label.status === 'hit').length,
    miss: labels.filter((label) => label.status === 'miss').length,
    unexpected_untradeable: labels.filter((label) => (
      label.status === 'unexpected_untradeable'
    )).length,
    data_error: labels.filter((label) => label.status === 'data_error').length,
  }
  return {
    totalPicks: picks.length,
    labeledPicks: labels.length,
    nullPicks,
    touchedPicks,
    statusCounts,
    hitRate: conditionalLabelCount > 0 ? touchedPicks / conditionalLabelCount : null,
    nullRate: picks.length > 0 ? nullPicks / picks.length : 0,
    evaluablePicks: conditionalLabelCount,
    allPickHitRate: picks.length > 0 ? touchedPicks / picks.length : null,
    ...summarizeObjectives(picks.map((pick) => pick.label), roundTripCostBps, tradingDays),
    returns5d: {
      roundTripCostBps,
      evaluablePicks: netReturns.length,
      positivePicks,
      positiveRate: netReturns.length > 0 ? positivePicks / netReturns.length : null,
      meanGrossReturn: mean(grossReturns),
      meanNetReturn: mean(netReturns),
      medianGrossReturn: medianSorted(grossReturns),
      medianNetReturn: medianSorted(netReturns),
      worstGrossReturn: grossReturns[0] ?? null,
      worstNetReturn: netReturns[0] ?? null,
      meanMaxAdverseExcursion: mean(adverseExcursions),
      touchedButNotProfitablePicks: tradeableLabels.filter((label) => (
        label.touched && label.return5d! - roundTripCostBps / 10_000 <= 0
      )).length,
      realisticCost: summarizeLabelRealisticCost(tradeableLabels, tradingDays),
    },
  }
}

const emptyShadowComparison = (startDate: string, asOfDate: string): ShadowForwardComparison => ({
  startDate,
  endDate: asOfDate,
  snapshotCount: 0,
  publishedV1: {
    dayCount: 0,
    pickCount: 0,
    labeledPickCount: 0,
    hitCount: 0,
    slotDenominator: 0,
    slotPrecisionAt3: null,
  },
  productionV0Only: {
    dayCount: 0,
    pickCount: 0,
    labeledPickCount: 0,
    hitCount: 0,
    slotDenominator: 0,
    slotPrecisionAt3: null,
  },
  slotPrecisionDifferencePercentagePoints: null,
})

export const parsePublishedPicks = (row: PublishedNewsletterRow): {
  readonly kind: 'stock' | 'crash' | 'empty' | 'invalid'
  readonly picks: PublishedPick[]
} => {
  let parsed: unknown
  try {
    parsed = JSON.parse(row.gemini_analysis)
  } catch {
    return { kind: 'invalid', picks: [] }
  }

  if (
    typeof parsed === 'object'
    && parsed !== null
    && !Array.isArray(parsed)
    && (parsed as Record<string, unknown>).type === 'crash_alert'
  ) {
    return { kind: 'crash', picks: [] }
  }
  if (!Array.isArray(parsed)) return { kind: 'invalid', picks: [] }

  if (parsed.length === 0) return { kind: 'empty', picks: [] }

  const picks: PublishedPick[] = []
  for (const candidate of parsed) {
    if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
      return { kind: 'invalid', picks: [] }
    }
    const symbol = (candidate as Record<string, unknown>).ticker
    if (typeof symbol !== 'string' || symbol.length === 0) return { kind: 'invalid', picks: [] }
    picks.push({
      publicationDate: row.newsletter_date.slice(0, 10),
      symbol,
      picksSource: normalizeSource(row.picks_source),
    })
  }
  return { kind: 'stock', picks }
}

const maturePick = (
  pick: PublishedPick,
  tradingDays: TradingDayIndex,
  asOfDate: string,
  holdingDays = 5,
): MaturePick | null => {
  const entryDate = tradingDays.firstTradingDayOnOrAfter(pick.publicationDate)
  if (!entryDate) return null
  const signalDate = tradingDays.nextTradingDay(entryDate, -1)
  const maturityDate = tradingDays.nextTradingDay(entryDate, holdingDays - 1)
  if (!signalDate || !maturityDate || maturityDate > asOfDate) return null
  return { ...pick, signalDate, entryDate, maturityDate }
}

const evaluatePick = (
  pick: MaturePick,
  prices: PriceBook,
  tradingDays: TradingDayIndex,
  holdingDays = 5,
): EvaluatedPick => {
  const label = labelPick(pick.symbol, pick.signalDate, prices, tradingDays, holdingDays)
  if (label) return { ...pick, label, nullReason: null }

  const entryOpen = getRawPrice(prices, pick.symbol, pick.entryDate)?.open
  return {
    ...pick,
    label: null,
    nullReason: entryOpen === null || entryOpen === undefined
      ? 'missingEntryOpen'
      : 'missingWindowData',
  }
}

export function measureShadowForwardComparison(input: {
  readonly prices: PriceBook
  readonly tradingDays: TradingDayIndex
  readonly snapshots: readonly StockPickSnapshot[]
  readonly startDate: string
  readonly asOfDate: string
}): ShadowForwardComparison {
  const snapshots = input.snapshots.filter((snapshot) => (
    snapshot.strategy === LEGACY_VOLUME_BREAKOUT_STRATEGY.name
    && snapshot.signal_date >= input.startDate
    && snapshot.signal_date <= input.asOfDate
  ))
  const matureSnapshots = snapshots.filter((snapshot) => {
    const entryDate = input.tradingDays.nextTradingDay(snapshot.signal_date, 1)
    const maturityDate = entryDate ? input.tradingDays.nextTradingDay(entryDate, 4) : null
    return maturityDate !== null && maturityDate <= input.asOfDate
  })
  const summarizeSnapshots = (
    select: (snapshot: StockPickSnapshot) => ReadonlyArray<StockPickSnapshot['picks'][number]>,
  ): ShadowForwardStrategySummary => {
    const labels = matureSnapshots.flatMap((snapshot) => select(snapshot).map((candidate) => (
      labelPick(candidate.symbol, snapshot.signal_date, input.prices, input.tradingDays)
    )))
    const hitCount = labels.filter((label) => label?.touched).length
    const slotDenominator = matureSnapshots.length * 3
    return {
      dayCount: matureSnapshots.length,
      pickCount: labels.length,
      labeledPickCount: labels.filter((label) => label !== null).length,
      hitCount,
      slotDenominator,
      slotPrecisionAt3: slotDenominator > 0 ? hitCount / slotDenominator : null,
    }
  }
  const publishedV1 = summarizeSnapshots((snapshot) => snapshot.picks.slice(0, 3))
  const productionV0Only = summarizeSnapshots((snapshot) => (
    snapshot.top_candidates.filter((candidate) => candidate.tier === 'breakout').slice(0, 3)
  ))
  return {
    startDate: input.startDate,
    endDate: input.asOfDate,
    snapshotCount: snapshots.length,
    publishedV1,
    productionV0Only,
    slotPrecisionDifferencePercentagePoints: publishedV1.slotPrecisionAt3 === null
      || productionV0Only.slotPrecisionAt3 === null
      ? null
      : (publishedV1.slotPrecisionAt3 - productionV0Only.slotPrecisionAt3) * 100,
  }
}

export function measureForwardTieRate(input: {
  readonly snapshots: readonly StockPickSnapshot[]
  readonly startDate: string
  readonly asOfDate: string
}): ForwardTieRateSummary {
  const snapshots = input.snapshots.filter((snapshot) => (
    snapshot.strategy === PRODUCTION_STRATEGY.name
    && snapshot.signal_date >= input.startDate
    && snapshot.signal_date <= input.asOfDate
  ))
  const evaluable = snapshots.filter((snapshot) => snapshot.top_candidates.length >= 4)
  // 저장 순서는 공개 정수 점수 내림차순 → 20일 평균 거래대금 내림차순 → 심볼이다.
  const tiedDates = evaluable.filter((snapshot) => {
    const third = snapshot.top_candidates[2]!
    const fourth = snapshot.top_candidates[3]!
    return Number.isInteger(third.score) && third.score === fourth.score
  }).length
  return {
    totalDates: snapshots.length,
    evaluableDates: evaluable.length,
    tiedDates,
    fewerThanFourCandidatesDates: snapshots.length - evaluable.length,
    tieRate: rate(tiedDates, evaluable.length),
  }
}

export function measureStrategyForwardComparison(input: {
  readonly prices: PriceBook
  readonly tradingDays: TradingDayIndex
  readonly snapshots: readonly StockPickSnapshot[]
  readonly startDate: string
  readonly asOfDate: string
  readonly roundTripCostBps?: number
}): StrategyForwardSummary[] {
  const roundTripCostBps = input.roundTripCostBps ?? DEFAULT_ROUND_TRIP_COST_BPS
  validateCostBps(roundTripCostBps)
  const grouped = new Map<string, Array<{ symbol: string; signalDate: string; entryDate: string; mature: boolean }>>()
  for (const snapshot of input.snapshots) {
    if (snapshot.signal_date < input.startDate || snapshot.signal_date > input.asOfDate) continue
    const entryDate = input.tradingDays.nextTradingDay(snapshot.signal_date, 1)
    if (!entryDate || entryDate > input.asOfDate) continue
    const maturityDate = entryDate ? input.tradingDays.nextTradingDay(entryDate, 4) : null
    const rows = grouped.get(snapshot.strategy) ?? []
    rows.push(...snapshot.picks.map((pick) => ({
      symbol: pick.symbol,
      signalDate: snapshot.signal_date,
      entryDate,
      mature: maturityDate !== null && maturityDate <= input.asOfDate,
    })))
    grouped.set(snapshot.strategy, rows)
  }
  return [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([strategy, allPicks]) => {
    const picks = allPicks.filter((pick) => pick.mature)
    const labeled = picks.map((pick) => ({
      ...pick, label: labelPick(pick.symbol, pick.signalDate, input.prices, input.tradingDays),
    }))
    const evaluable = labeled.filter((pick) => pick.label?.status === 'hit' || pick.label?.status === 'miss')
    const returns = evaluable.flatMap((pick) => pick.label?.return5d === null || pick.label?.return5d === undefined
      ? [] : [pick.label.return5d])
    const entryCandles = summarizeEntryDay(picks.map((pick) => (
      labelEntryDay(pick.symbol, pick.entryDate, input.prices)
    )), roundTripCostBps)
    return {
      strategy,
      pickCount: picks.length,
      labeledPickCount: labeled.filter((pick) => pick.label !== null).length,
      touchRate5d: rate(evaluable.filter((pick) => pick.label?.touched).length, evaluable.length),
      meanCloseReturn5d: mean(returns),
      meanNetCloseReturn5d: mean(returns.map((value) => value - roundTripCostBps / 10_000)),
      realisticCost5d: summarizeLabelRealisticCost(evaluable.map((pick) => pick.label), input.tradingDays),
      roundTripCostBps,
      entryBullishRate: entryCandles.bullishRate,
      entryDay: summarizeEntryDay(allPicks.map((pick) => labelEntryDay(pick.symbol, pick.entryDate, input.prices)), roundTripCostBps),
      ...summarizeObjectives(labeled.map((pick) => pick.label), roundTripCostBps, input.tradingDays),
    }
  })
}

export function measurePairedStrategyForwardComparison(input: {
  readonly prices: PriceBook
  readonly tradingDays: TradingDayIndex
  readonly snapshots: readonly StockPickSnapshot[]
  readonly startDate: string
  readonly asOfDate: string
  readonly roundTripCostBps?: number
}): PairedStrategyForwardSummary[] {
  const roundTripCostBps = input.roundTripCostBps ?? DEFAULT_ROUND_TRIP_COST_BPS
  validateCostBps(roundTripCostBps)
  const datesByStrategy = new Map(PAIRED_STRATEGIES.map((strategy) => [strategy, new Set<string>()]))
  for (const snapshot of input.snapshots) {
    const dates = datesByStrategy.get(snapshot.strategy as typeof PAIRED_STRATEGIES[number])
    if (!dates || snapshot.signal_date < input.startDate || snapshot.signal_date > input.asOfDate) continue
    const entryDate = input.tradingDays.nextTradingDay(snapshot.signal_date, 1)
    const maturityDate = entryDate ? input.tradingDays.nextTradingDay(entryDate, 4) : null
    if (maturityDate && maturityDate <= input.asOfDate) dates.add(snapshot.signal_date)
  }
  const commonDates = new Set([...datesByStrategy.get(PAIRED_STRATEGIES[0])!].filter((date) => (
    PAIRED_STRATEGIES.every((strategy) => datesByStrategy.get(strategy)?.has(date))
  )))
  const summaries = new Map(measureStrategyForwardComparison({
    ...input,
    snapshots: input.snapshots.filter((snapshot) => (
      commonDates.has(snapshot.signal_date) && datesByStrategy.has(snapshot.strategy as typeof PAIRED_STRATEGIES[number])
    )),
  }).map((summary) => [summary.strategy, summary]))
  return PAIRED_STRATEGIES.map((strategy) => ({
    strategy,
    pickCount: 0,
    labeledPickCount: 0,
    touchRate5d: null,
    meanCloseReturn5d: null,
    meanNetCloseReturn5d: null,
    realisticCost5d: summarizeRealisticCost([]),
    roundTripCostBps,
    entryBullishRate: null,
    entryDay: summarizeEntryDay([], roundTripCostBps),
    ...summarizeObjectives([], roundTripCostBps, input.tradingDays),
    ...summaries.get(strategy),
    commonDayCount: commonDates.size,
  }))
}

export function measureForwardPicks(input: {
  readonly newsletters: readonly PublishedNewsletterRow[]
  readonly prices: PriceBook
  readonly tradingDays: TradingDayIndex
  readonly asOfDate: string
  readonly lookbackDays?: number
  readonly shadowComparison?: ShadowForwardComparison
  readonly strategyComparison?: readonly StrategyForwardSummary[]
  readonly pairedStrategyComparison?: readonly PairedStrategyForwardSummary[]
  readonly snapshots?: readonly StockPickSnapshot[]
  readonly roundTripCostBps?: number
}): ForwardMeasurementReport {
  const roundTripCostBps = input.roundTripCostBps ?? DEFAULT_ROUND_TRIP_COST_BPS
  validateCostBps(roundTripCostBps)
  const lookbackDays = input.lookbackDays ?? DEFAULT_LOOKBACK_DAYS
  if (!Number.isInteger(lookbackDays) || lookbackDays <= 0) {
    throw new Error(`lookbackDays는 양의 정수여야 합니다: ${lookbackDays}`)
  }
  const startDate = addCalendarDays(input.asOfDate, -(lookbackDays - 1))
  const newsletters = input.newsletters.filter((row) => {
    const date = row.newsletter_date.slice(0, 10)
    return date >= startDate && date <= input.asOfDate
  })

  const parsed = newsletters.map(parsePublishedPicks)
  const publishedPicks = parsed.flatMap((result) => result.picks)
  const entryDayPicks = publishedPicks.flatMap((pick) => {
    const entryDate = input.tradingDays.firstTradingDayOnOrAfter(pick.publicationDate)
    return entryDate && entryDate <= input.asOfDate
      ? [{ ...pick, label: labelEntryDay(pick.symbol, entryDate, input.prices) }] : []
  })
  const maturePicks = publishedPicks.flatMap((pick) => {
    const mature = maturePick(pick, input.tradingDays, input.asOfDate)
    return mature ? [mature] : []
  })
  const evaluated = maturePicks.map((pick) => evaluatePick(pick, input.prices, input.tradingDays))
  const informational8MaturePicks = publishedPicks.flatMap((pick) => {
    const mature = maturePick(pick, input.tradingDays, input.asOfDate, INFORMATIONAL_HOLDING_DAYS)
    return mature ? [mature] : []
  })
  const informational8Evaluated = informational8MaturePicks.map((pick) => (
    evaluatePick(pick, input.prices, input.tradingDays, INFORMATIONAL_HOLDING_DAYS)
  ))

  const byPicksSource = Object.fromEntries(SOURCE_KEYS.map((key) => [
    key,
    summarize(evaluated.filter((pick) => sourceKey(pick.picksSource) === key), roundTripCostBps, input.tradingDays),
  ])) as Record<SourceKey, ForwardAccuracySummary>

  const nullBreakdown: Record<ForwardNullReason, number> = {
    missingEntryOpen: 0,
    missingWindowData: 0,
  }
  for (const pick of evaluated) {
    if (pick.nullReason) nullBreakdown[pick.nullReason]++
  }

  const recent4Weeks = Array.from({ length: RECENT_WEEK_COUNT }, (_, index) => {
    const weeksAgo = RECENT_WEEK_COUNT - index - 1
    const endDate = addCalendarDays(input.asOfDate, -weeksAgo * 7)
    const weekStartDate = addCalendarDays(endDate, -6)
    return {
      startDate: weekStartDate,
      endDate,
      ...summarize(evaluated.filter((pick) => (
        pick.publicationDate >= weekStartDate && pick.publicationDate <= endDate
      )), roundTripCostBps, input.tradingDays),
    }
  })

  return {
    asOfDate: input.asOfDate,
    lookbackDays,
    startDate,
    roundTripCostBps,
    publishedNewsletterCount: newsletters.length,
    invalidNewsletterCount: parsed.filter((result) => result.kind === 'invalid').length,
    crashNewsletterCount: parsed.filter((result) => result.kind === 'crash').length,
    loadedPickCount: publishedPicks.length,
    immaturePickCount: publishedPicks.length - maturePicks.length,
    overall: summarize(evaluated, roundTripCostBps, input.tradingDays),
    informational8HoldingDays: summarize(informational8Evaluated, roundTripCostBps, input.tradingDays),
    byPicksSource,
    entryDay: summarizeEntryDay(entryDayPicks.map((pick) => pick.label), roundTripCostBps),
    entryDayByPicksSource: Object.fromEntries(SOURCE_KEYS.map((key) => [
      key,
      summarizeEntryDay(entryDayPicks.filter((pick) => sourceKey(pick.picksSource) === key).map((pick) => pick.label), roundTripCostBps),
    ])) as Record<SourceKey, EntryDaySummary>,
    nullBreakdown,
    recent4Weeks,
    shadowComparison: input.shadowComparison ?? emptyShadowComparison(startDate, input.asOfDate),
    strategyComparison: input.strategyComparison ?? [],
    pairedStrategyComparison: input.pairedStrategyComparison ?? [],
    scoreTies: measureForwardTieRate({ snapshots: input.snapshots ?? [], startDate, asOfDate: input.asOfDate }),
  }
}

const loadPublishedNewsletters = async (
  startDate: string,
  endDate: string,
): Promise<PublishedNewsletterRow[]> => {
  const { fetchAllRows } = await import('@/lib/supabase/paginate')
  const { supabaseAdmin } = await import('@/scripts/tli/shared/supabase-admin')
  return fetchAllRows<PublishedNewsletterRow>((from, to) => supabaseAdmin
    .from('newsletter_content')
    .select('newsletter_date, gemini_analysis, picks_source')
    .eq('is_sent', true)
    .gte('newsletter_date', startDate)
    .lte('newsletter_date', endDate)
    .order('newsletter_date', { ascending: true })
    .range(from, to))
}

const percent = (value: number | null): string => value === null ? '-' : `${(value * 100).toFixed(1)}%`
const percentagePoints = (value: number | null): string => (
  value === null ? '-' : `${value >= 0 ? '+' : ''}${value.toFixed(1)}%p`
)

export function renderShadowForwardComparisonSection(comparison: ShadowForwardComparison): string {
  if (comparison.snapshotCount === 0) {
    return [
      `저장 스냅샷 v1-v0 포워드 비교 (신호일 ${comparison.startDate}~${comparison.endDate})`,
      '스냅샷 대기 중',
    ].join('\n')
  }
  return [
    `저장 스냅샷 v1-v0 포워드 비교 (신호일 ${comparison.startDate}~${comparison.endDate}, 제품 기준 5보유일)`,
    '| 전략 | 성숙 일수 | 픽 수 | 라벨 수 | 슬롯 적중 | slotPrecision@3 | 차이(%p) |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
    `| v1 (published) | ${comparison.publishedV1.dayCount} | ${comparison.publishedV1.pickCount} | ${comparison.publishedV1.labeledPickCount} | ${comparison.publishedV1.hitCount}/${comparison.publishedV1.slotDenominator} | ${percent(comparison.publishedV1.slotPrecisionAt3)} | ${percentagePoints(comparison.slotPrecisionDifferencePercentagePoints)} |`,
    `| v0-only | ${comparison.productionV0Only.dayCount} | ${comparison.productionV0Only.pickCount} | ${comparison.productionV0Only.labeledPickCount} | ${comparison.productionV0Only.hitCount}/${comparison.productionV0Only.slotDenominator} | ${percent(comparison.productionV0Only.slotPrecisionAt3)} | - |`,
  ].join('\n')
}

const realisticCostColumns = (summary: RealisticCostSummary) => ({
  '현실 비용 평가 수': summary.evaluablePicks,
  '현실 비용 평균 net': percent(summary.meanNetReturn),
  '현실 비용 중앙 net': percent(summary.medianNetReturn),
  '현실 비용 양수 비율': percent(summary.positiveRate),
  '현실 비용 손실률': percent(summary.lossRate),
  '현실 비용 평균 bps': summary.meanAppliedCostBps,
})

const renderRealisticCost = (scope: string, summary: RealisticCostSummary): string => (
  `${scope} 현실 비용: 평가 ${summary.evaluablePicks}건, 평균 net ${percent(summary.meanNetReturn)}, 중앙값 net ${percent(summary.medianNetReturn)}, 수익 양수 비율 ${percent(summary.positiveRate)}, 손실률(net<0) ${percent(summary.lossRate)}, 평균 적용 비용 ${summary.meanAppliedCostBps?.toFixed(3) ?? '-'}bps`
)

export function printForwardMeasurementReport(report: ForwardMeasurementReport): void {
  console.log(JSON.stringify(report, null, 2))
  console.log(`적용 왕복 비용: ${report.roundTripCostBps}bps (gross: 비용 전, net: 비용 후)`)
  console.log(`모델 비용 ${report.roundTripCostBps}bps: 기존 net 지표 / 현실 비용: 매수·매도 수수료 + 매도일 세금 + 양쪽 반 호가 슬리피지`)
  console.table([
    { scope: 'overall', ...report.overall },
    ...SOURCE_KEYS.map((key) => ({ scope: `source:${key}`, ...report.byPicksSource[key] })),
  ].map((row) => ({
    scope: row.scope,
    picks: row.totalPicks,
    labeled: row.labeledPicks,
    nulls: row.nullPicks,
    hits: row.touchedPicks,
    hitRate: percent(row.hitRate),
    jointHitRate5d: percent(row.jointOutcome5d.hitRate),
    roundTripCostBps: row.returns5d.roundTripCostBps,
    meanGrossReturn5d: percent(row.returns5d.meanGrossReturn),
    meanNetReturn5d: percent(row.returns5d.meanNetReturn),
    ...realisticCostColumns(row.returns5d.realisticCost),
    targetExitProxyGross5d: percent(row.targetExitProxy5d.meanGrossReturn),
    targetExitProxyNet5d: percent(row.targetExitProxy5d.meanNetReturn),
    targetExitProxyNetRealisticCost5d: percent(row.targetExitProxy5d.realisticCost.meanNetReturn),
    nullRate: percent(row.nullRate),
    statusHit: row.statusCounts.hit,
    statusMiss: row.statusCounts.miss,
    statusUnexpectedUntradeable: row.statusCounts.unexpected_untradeable,
    statusDataError: row.statusCounts.data_error,
  })))
  console.table(report.recent4Weeks.map((week) => ({
    period: `${week.startDate}~${week.endDate}`,
    picks: week.totalPicks,
    labeled: week.labeledPicks,
    nulls: week.nullPicks,
    hits: week.touchedPicks,
    hitRate: percent(week.hitRate),
    nullRate: percent(week.nullRate),
    roundTripCostBps: week.returns5d.roundTripCostBps,
    meanGrossReturn5d: percent(week.returns5d.meanGrossReturn),
    meanNetReturn5d: percent(week.returns5d.meanNetReturn),
    ...realisticCostColumns(week.returns5d.realisticCost),
    targetExitProxyGross5d: percent(week.targetExitProxy5d.meanGrossReturn),
    targetExitProxyNet5d: percent(week.targetExitProxy5d.meanNetReturn),
    targetExitProxyNetRealisticCost5d: percent(week.targetExitProxy5d.realisticCost.meanNetReturn),
  })))
  console.log(`제품 기준: 5보유일 타율 ${percent(report.overall.hitRate)} (${report.overall.touchedPicks}/${report.overall.evaluablePicks}, 데이터 오류 제외)`)
  console.log(`전체 성숙 추천 기준: ${percent(report.overall.allPickHitRate)} (${report.overall.touchedPicks}/${report.overall.totalPicks}, 오류 포함)`)
  console.log(`추천 당일 양봉률 (5일 성숙 전 포함): ${percent(report.entryDay.bullishRate)} (${report.entryDay.bullishPicks}/${report.entryDay.evaluablePicks}, 진입일 마감 ${report.entryDay.totalPicks}건), 평균 수익 gross ${percent(report.entryDay.meanGrossReturn)} / net ${percent(report.entryDay.meanNetReturn)}`)
  console.log(renderRealisticCost('추천 당일 종가 청산', report.entryDay.realisticCost))
  console.log(`추천 당일 양봉 + 5일 내 +10% 동시 달성: ${percent(report.overall.jointOutcome5d.hitRate)} (${report.overall.jointOutcome5d.hitPicks}/${report.overall.jointOutcome5d.evaluablePicks})`)
  const returns = report.overall.returns5d
  console.log(`5일 종가 청산 가정 (왕복 비용 ${returns.roundTripCostBps}bps): 수익 양수 비율 ${percent(returns.positiveRate)} (${returns.positivePicks}/${returns.evaluablePicks}), 평균 수익 gross ${percent(returns.meanGrossReturn)} / net ${percent(returns.meanNetReturn)}, 중앙값 gross ${percent(returns.medianGrossReturn)} / net ${percent(returns.medianNetReturn)}, 최악 gross ${percent(returns.worstGrossReturn)} / net ${percent(returns.worstNetReturn)}, +10% 터치 후 비수익 ${returns.touchedButNotProfitablePicks}건`)
  console.log(renderRealisticCost('5일 종가 청산', returns.realisticCost))
  const targetExit = report.overall.targetExitProxy5d
  console.log(`목표가 청산 모형 (+10% 장중 도달 시 +10%, 미도달 시 D5 종가, 왕복 비용 ${targetExit.roundTripCostBps}bps): 평균 수익 gross ${percent(targetExit.meanGrossReturn)} / net ${percent(targetExit.meanNetReturn)}, 중앙값 gross ${percent(targetExit.medianGrossReturn)} / net ${percent(targetExit.medianNetReturn)}, 최악 gross ${percent(targetExit.worstGrossReturn)} / net ${percent(targetExit.worstNetReturn)}, OHLC 기반 가정이며 실제 체결을 보장하지 않음`)
  console.log(renderRealisticCost('목표가 청산 모형 (도달일 미저장: D5 세율 가정)', targetExit.realisticCost))
  const informational = report.informational8HoldingDays
  console.log(`참고: 8보유일 확장 시 타율 ${percent(informational.hitRate)} (${informational.touchedPicks}/${informational.evaluablePicks}), 평균 수익 gross ${percent(informational.returns5d.meanGrossReturn)} / net ${percent(informational.returns5d.meanNetReturn)}`)
  console.log(renderRealisticCost('8보유일 참고 집계의 D5 종가 청산', informational.returns5d.realisticCost))
  const ties = report.scoreTies
  console.log(`프로덕션 3·4위 정수 점수 동률 (신호일 ${report.startDate}~${report.asOfDate}): ${percent(ties.tieRate)} (${ties.tiedDates}/${ties.evaluableDates}, 후보 4개 미만 ${ties.fewerThanFourCandidatesDates}일 제외, 저장 신호일 ${ties.totalDates}일)`)
  // 워크플로우가 이 로그를 GITHUB_STEP_SUMMARY에 그대로 적재하므로 같은 섹션이 양쪽에 노출된다.
  console.log(renderShadowForwardComparisonSection(report.shadowComparison))
  console.table(report.strategyComparison.map((row) => ({
    strategy: row.strategy,
    picks: row.pickCount,
    labeled: row.labeledPickCount,
    touchRate5d: percent(row.touchRate5d),
    meanCloseReturn5d: percent(row.meanCloseReturn5d),
    meanNetCloseReturn5d: percent(row.meanNetCloseReturn5d),
    ...realisticCostColumns(row.realisticCost5d),
    roundTripCostBps: row.roundTripCostBps,
    entryBullishRate: percent(row.entryBullishRate),
    meanGrossEntryReturn: percent(row.entryDay.meanGrossReturn),
    meanNetEntryReturn: percent(row.entryDay.meanNetReturn),
    meanNetEntryReturnRealisticCost: percent(row.entryDay.realisticCost.meanNetReturn),
    finalizedEntryPicks: row.entryDay.evaluablePicks,
    allFinalizedEntryBullishRate: percent(row.entryDay.bullishRate),
    jointHitRate5d: percent(row.jointOutcome5d.hitRate),
    targetExitProxyGross5d: percent(row.targetExitProxy5d.meanGrossReturn),
    targetExitProxyNet5d: percent(row.targetExitProxy5d.meanNetReturn),
    targetExitProxyNetRealisticCost5d: percent(row.targetExitProxy5d.realisticCost.meanNetReturn),
  })))
  console.log('프로덕션·섀도우 동일 신호일 짝 비교 (성숙한 공통 신호일만)')
  console.table(report.pairedStrategyComparison.map((row) => ({
    strategy: row.strategy,
    commonDays: row.commonDayCount,
    picks: row.pickCount,
    labeled: row.labeledPickCount,
    touchRate5d: percent(row.touchRate5d),
    meanCloseReturn5d: percent(row.meanCloseReturn5d),
    meanNetCloseReturn5d: percent(row.meanNetCloseReturn5d),
    ...realisticCostColumns(row.realisticCost5d),
    roundTripCostBps: row.roundTripCostBps,
    entryBullishRate: percent(row.entryBullishRate),
    meanGrossEntryReturn: percent(row.entryDay.meanGrossReturn),
    meanNetEntryReturn: percent(row.entryDay.meanNetReturn),
    meanNetEntryReturnRealisticCost: percent(row.entryDay.realisticCost.meanNetReturn),
    jointHitRate5d: percent(row.jointOutcome5d.hitRate),
    targetExitProxyGross5d: percent(row.targetExitProxy5d.meanGrossReturn),
    targetExitProxyNet5d: percent(row.targetExitProxy5d.meanNetReturn),
    targetExitProxyNetRealisticCost5d: percent(row.targetExitProxy5d.realisticCost.meanNetReturn),
  })))
}

const readDays = (args: readonly string[]): number => {
  const raw = args.find((arg) => arg.startsWith('--days='))?.slice('--days='.length)
  if (!raw) return DEFAULT_LOOKBACK_DAYS
  const days = Number(raw)
  if (!Number.isInteger(days) || days <= 0) throw new Error(`--days는 양의 정수여야 합니다: ${raw}`)
  return days
}

export function parseForwardMeasurementArgs(args: readonly string[]): {
  readonly lookbackDays: number
  readonly roundTripCostBps: number
} {
  const rawCostBps = args.find((arg) => arg.startsWith('--cost-bps='))?.slice('--cost-bps='.length)
  const roundTripCostBps = rawCostBps === undefined
    ? DEFAULT_ROUND_TRIP_COST_BPS : rawCostBps.trim() === '' ? NaN : Number(rawCostBps)
  validateCostBps(roundTripCostBps)
  return { lookbackDays: readDays(args), roundTripCostBps }
}

const isDirectRun = /measure-forward\.(?:ts|js)$/.test(process.argv[1] ?? '')
if (isDirectRun) {
  const { lookbackDays, roundTripCostBps } = parseForwardMeasurementArgs(process.argv.slice(2))
  const asOfDate = getLastFinalizedTradingDate()
  const startDate = addCalendarDays(asOfDate, -(lookbackDays - 1))

  Promise.all([
    loadPublishedNewsletters(startDate, asOfDate),
    loadTradingDayIndex(),
    loadStockPickSnapshots({ from: startDate, to: asOfDate }),
  ]).then(async ([newsletters, tradingDays, snapshots]) => {
    const publishedPicks = newsletters.flatMap((row) => parsePublishedPicks(row).picks)
    // D1 성과는 D5 성숙 전에 집계하므로 최근 추천의 진입일 가격도 읽는다.
    const priceStartDate = [
      ...publishedPicks.map((pick) => tradingDays.firstTradingDayOnOrAfter(pick.publicationDate)),
      ...snapshots.map((snapshot) => tradingDays.nextTradingDay(snapshot.signal_date, 1)),
    ].filter((date): date is string => date !== null && date <= asOfDate).sort()[0]
    const prices = priceStartDate
      ? await loadPriceBook({ startDate: priceStartDate, endDate: asOfDate })
      : new Map()
    const dataContract = validateResearchDataset({
      tradingDays,
      prices,
      fromDate: priceStartDate ?? startDate,
      toDate: asOfDate,
    })
    console.log(JSON.stringify({ event: 'research_data_contract', ...dataContract }))
    const shadowComparison = measureShadowForwardComparison({
      prices,
      tradingDays,
      snapshots,
      startDate,
      asOfDate,
    })
    const report = measureForwardPicks({
      newsletters,
      prices,
      tradingDays,
      asOfDate,
      lookbackDays,
      snapshots,
      shadowComparison,
      strategyComparison: measureStrategyForwardComparison({ prices, tradingDays, snapshots, startDate, asOfDate, roundTripCostBps }),
      pairedStrategyComparison: measurePairedStrategyForwardComparison({ prices, tradingDays, snapshots, startDate, asOfDate, roundTripCostBps }),
      roundTripCostBps,
    })
    printForwardMeasurementReport(report)
  }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
