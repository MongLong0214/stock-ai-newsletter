import { getLastFinalizedTradingDate } from '@/lib/tli/trading-calendar'
import type { LabelStatusCounts } from '@/scripts/stock-picks/backtest'
import { validateResearchDataset } from '@/scripts/stock-picks/data-contract'
import { getRawPrice, loadPriceBook, type PriceBook } from '@/scripts/stock-picks/data-handler'
import { labelEntryDay, labelPick, type StockPickEntryDayLabel, type StockPickLabel } from '@/scripts/stock-picks/label'
import type { StockPickSnapshot } from '@/scripts/stock-picks/pick-snapshots'
import { loadStockPickSnapshots } from '@/scripts/stock-picks/pick-snapshots'
import { LEGACY_VOLUME_BREAKOUT_STRATEGY, PRODUCTION_STRATEGY } from '@/scripts/stock-picks/production-strategy'
import { TradingDayIndex, loadTradingDayIndex } from '@/scripts/stock-picks/trading-days'

const DEFAULT_LOOKBACK_DAYS = 60
const RECENT_WEEK_COUNT = 4
const INFORMATIONAL_HOLDING_DAYS = 8
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

export interface EntryDaySummary {
  /** 5일 성숙 여부와 무관하게 진입일이 마감된 추천 수. */
  readonly totalPicks: number
  readonly evaluablePicks: number
  readonly bullishPicks: number
  readonly bullishRate: number | null
  readonly allPickBullishRate: number | null
  readonly meanReturn: number | null
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
  readonly medianNetReturn: number | null
  readonly worstNetReturn: number | null
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
    readonly medianNetReturn: number | null
    readonly worstNetReturn: number | null
    readonly meanMaxAdverseExcursion: number | null
    readonly touchedButNotProfitablePicks: number
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
}

export interface StrategyForwardSummary {
  readonly strategy: string
  readonly pickCount: number
  readonly labeledPickCount: number
  readonly touchRate5d: number | null
  readonly meanCloseReturn5d: number | null
  readonly meanNetCloseReturn5d: number | null
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

const summarizeEntryDay = (labels: readonly (StockPickEntryDayLabel | null)[]): EntryDaySummary => {
  const valid = labels.filter((label): label is StockPickEntryDayLabel => label !== null)
  const bullishPicks = valid.filter((label) => label.entryBullish).length
  return {
    totalPicks: labels.length,
    evaluablePicks: valid.length,
    bullishPicks,
    bullishRate: rate(bullishPicks, valid.length),
    allPickBullishRate: rate(bullishPicks, labels.length),
    meanReturn: mean(valid.map((label) => label.entryReturn)),
  }
}

const summarizeObjectives = (
  labels: readonly (StockPickLabel | null)[],
  roundTripCostBps: number,
): { jointOutcome5d: JointOutcomeSummary; targetExitProxy5d: TargetExitProxySummary } => {
  const jointLabels = labels.filter((label) => label?.bullishAndTouched10In5d != null)
  const hitPicks = jointLabels.filter((label) => label?.bullishAndTouched10In5d === true).length
  const grossReturns = labels.flatMap((label) => (
    label?.targetExitReturn5d != null && Number.isFinite(label.targetExitReturn5d)
      ? [label.targetExitReturn5d] : []
  ))
  const netReturns = grossReturns.map((value) => value - roundTripCostBps / 10_000).sort((a, b) => a - b)
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
      medianNetReturn: medianSorted(netReturns),
      worstNetReturn: netReturns[0] ?? null,
    },
  }
}

const summarize = (picks: readonly EvaluatedPick[], roundTripCostBps = 0): ForwardAccuracySummary => {
  const labels = picks.flatMap((pick) => pick.label ? [pick.label] : [])
  const touchedPicks = labels.filter((label) => label.touched).length
  const conditionalLabelCount = labels.filter((label) => label.status !== 'data_error').length
  const nullPicks = picks.length - labels.length
  // +10% 장중 터치와 5일 종가 청산 수익은 별개다. 비용은 진입금액 대비 왕복 bps 가정이다.
  const tradeableLabels = labels.filter((label) => (
    (label.status === 'hit' || label.status === 'miss')
    && label.return5d !== null && Number.isFinite(label.return5d)
  ))
  const netReturns = tradeableLabels.map((label) => label.return5d! - roundTripCostBps / 10_000)
    .sort((a, b) => a - b)
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
    ...summarizeObjectives(picks.map((pick) => pick.label), roundTripCostBps),
    returns5d: {
      roundTripCostBps,
      evaluablePicks: netReturns.length,
      positivePicks,
      positiveRate: netReturns.length > 0 ? positivePicks / netReturns.length : null,
      meanGrossReturn: mean(tradeableLabels.map((label) => label.return5d!)),
      meanNetReturn: mean(netReturns),
      medianNetReturn: medianSorted(netReturns),
      worstNetReturn: netReturns[0] ?? null,
      meanMaxAdverseExcursion: mean(adverseExcursions),
      touchedButNotProfitablePicks: tradeableLabels.filter((label) => (
        label.touched && label.return5d! - roundTripCostBps / 10_000 <= 0
      )).length,
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

export function measureStrategyForwardComparison(input: {
  readonly prices: PriceBook
  readonly tradingDays: TradingDayIndex
  readonly snapshots: readonly StockPickSnapshot[]
  readonly startDate: string
  readonly asOfDate: string
  readonly roundTripCostBps?: number
}): StrategyForwardSummary[] {
  const roundTripCostBps = input.roundTripCostBps ?? 0
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
    )))
    return {
      strategy,
      pickCount: picks.length,
      labeledPickCount: labeled.filter((pick) => pick.label !== null).length,
      touchRate5d: rate(evaluable.filter((pick) => pick.label?.touched).length, evaluable.length),
      meanCloseReturn5d: mean(returns),
      meanNetCloseReturn5d: mean(returns.map((value) => value - roundTripCostBps / 10_000)),
      roundTripCostBps,
      entryBullishRate: entryCandles.bullishRate,
      entryDay: summarizeEntryDay(allPicks.map((pick) => labelEntryDay(pick.symbol, pick.entryDate, input.prices))),
      ...summarizeObjectives(labeled.map((pick) => pick.label), roundTripCostBps),
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
    roundTripCostBps: input.roundTripCostBps ?? 0,
    entryBullishRate: null,
    entryDay: summarizeEntryDay([]),
    ...summarizeObjectives([], input.roundTripCostBps ?? 0),
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
  readonly roundTripCostBps?: number
}): ForwardMeasurementReport {
  const roundTripCostBps = input.roundTripCostBps ?? 0
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
    summarize(evaluated.filter((pick) => sourceKey(pick.picksSource) === key), roundTripCostBps),
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
      )), roundTripCostBps),
    }
  })

  return {
    asOfDate: input.asOfDate,
    lookbackDays,
    startDate,
    publishedNewsletterCount: newsletters.length,
    invalidNewsletterCount: parsed.filter((result) => result.kind === 'invalid').length,
    crashNewsletterCount: parsed.filter((result) => result.kind === 'crash').length,
    loadedPickCount: publishedPicks.length,
    immaturePickCount: publishedPicks.length - maturePicks.length,
    overall: summarize(evaluated, roundTripCostBps),
    informational8HoldingDays: summarize(informational8Evaluated, roundTripCostBps),
    byPicksSource,
    entryDay: summarizeEntryDay(entryDayPicks.map((pick) => pick.label)),
    entryDayByPicksSource: Object.fromEntries(SOURCE_KEYS.map((key) => [
      key,
      summarizeEntryDay(entryDayPicks.filter((pick) => sourceKey(pick.picksSource) === key).map((pick) => pick.label)),
    ])) as Record<SourceKey, EntryDaySummary>,
    nullBreakdown,
    recent4Weeks,
    shadowComparison: input.shadowComparison ?? emptyShadowComparison(startDate, input.asOfDate),
    strategyComparison: input.strategyComparison ?? [],
    pairedStrategyComparison: input.pairedStrategyComparison ?? [],
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

export function printForwardMeasurementReport(report: ForwardMeasurementReport): void {
  console.log(JSON.stringify(report, null, 2))
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
    targetExitProxyNet5d: percent(row.targetExitProxy5d.meanNetReturn),
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
  })))
  console.log(`제품 기준: 5보유일 타율 ${percent(report.overall.hitRate)} (${report.overall.touchedPicks}/${report.overall.evaluablePicks}, 데이터 오류 제외)`)
  console.log(`전체 성숙 추천 기준: ${percent(report.overall.allPickHitRate)} (${report.overall.touchedPicks}/${report.overall.totalPicks}, 오류 포함)`)
  console.log(`추천 당일 양봉률 (5일 성숙 전 포함): ${percent(report.entryDay.bullishRate)} (${report.entryDay.bullishPicks}/${report.entryDay.evaluablePicks}, 진입일 마감 ${report.entryDay.totalPicks}건)`)
  console.log(`추천 당일 양봉 + 5일 내 +10% 동시 달성: ${percent(report.overall.jointOutcome5d.hitRate)} (${report.overall.jointOutcome5d.hitPicks}/${report.overall.jointOutcome5d.evaluablePicks})`)
  const returns = report.overall.returns5d
  console.log(`5일 종가 청산 가정 (왕복 비용 ${returns.roundTripCostBps}bps): 수익 양수 비율 ${percent(returns.positiveRate)} (${returns.positivePicks}/${returns.evaluablePicks}), 평균 수익 ${percent(returns.meanNetReturn)}, 중앙값 ${percent(returns.medianNetReturn)}, 최악 ${percent(returns.worstNetReturn)}, +10% 터치 후 비수익 ${returns.touchedButNotProfitablePicks}건`)
  const targetExit = report.overall.targetExitProxy5d
  console.log(`목표가 청산 모형 (+10% 장중 도달 시 +10%, 미도달 시 D5 종가, 왕복 비용 ${targetExit.roundTripCostBps}bps): 평균 순수익 ${percent(targetExit.meanNetReturn)}, OHLC 기반 가정이며 실제 체결을 보장하지 않음`)
  console.log(`참고: 8보유일 확장 시 타율 ${percent(report.informational8HoldingDays.hitRate)} (${report.informational8HoldingDays.touchedPicks}/${report.informational8HoldingDays.evaluablePicks})`)
  // 워크플로우가 이 로그를 GITHUB_STEP_SUMMARY에 그대로 적재하므로 같은 섹션이 양쪽에 노출된다.
  console.log(renderShadowForwardComparisonSection(report.shadowComparison))
  console.table(report.strategyComparison.map((row) => ({
    strategy: row.strategy,
    picks: row.pickCount,
    labeled: row.labeledPickCount,
    touchRate5d: percent(row.touchRate5d),
    meanCloseReturn5d: percent(row.meanCloseReturn5d),
    meanNetCloseReturn5d: percent(row.meanNetCloseReturn5d),
    entryBullishRate: percent(row.entryBullishRate),
    finalizedEntryPicks: row.entryDay.evaluablePicks,
    allFinalizedEntryBullishRate: percent(row.entryDay.bullishRate),
    jointHitRate5d: percent(row.jointOutcome5d.hitRate),
    targetExitProxyNet5d: percent(row.targetExitProxy5d.meanNetReturn),
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
    entryBullishRate: percent(row.entryBullishRate),
    jointHitRate5d: percent(row.jointOutcome5d.hitRate),
    targetExitProxyNet5d: percent(row.targetExitProxy5d.meanNetReturn),
  })))
}

const readDays = (args: readonly string[]): number => {
  const raw = args.find((arg) => arg.startsWith('--days='))?.slice('--days='.length)
  if (!raw) return DEFAULT_LOOKBACK_DAYS
  const days = Number(raw)
  if (!Number.isInteger(days) || days <= 0) throw new Error(`--days는 양의 정수여야 합니다: ${raw}`)
  return days
}

const isDirectRun = /measure-forward\.(?:ts|js)$/.test(process.argv[1] ?? '')
if (isDirectRun) {
  const lookbackDays = readDays(process.argv.slice(2))
  const asOfDate = getLastFinalizedTradingDate()
  const roundTripCostBps = Number(process.argv.slice(2).find((arg) => arg.startsWith('--cost-bps='))?.slice('--cost-bps='.length) ?? 0)
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
