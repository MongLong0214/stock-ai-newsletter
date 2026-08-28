import { runBacktest, type BacktestReport } from '@/scripts/stock-picks/backtest'
import { getRawPrice, loadPriceBook, type PriceBook } from '@/scripts/stock-picks/data-handler'
import type { StockFeatureVector } from '@/scripts/stock-picks/features'
import { PRODUCTION_VOLUME_BREAKOUT_PARAMETERS } from '@/scripts/stock-picks/generate-picks'
import { labelPick, type StockPickLabel } from '@/scripts/stock-picks/label'
import { precomputeFeatureMap } from '@/scripts/stock-picks/optimize'
import {
  createCachedFeatureStrategy,
  createVolumeBreakoutAtrRankStrategy,
  loadStockMasterStates,
  type StockMasterState,
} from '@/scripts/stock-picks/strategies'
import { TradingDayIndex, loadTradingDayIndex } from '@/scripts/stock-picks/trading-days'

const DEFAULT_LOOKBACK_DAYS = 60
const RECENT_WEEK_COUNT = 4
const INFORMATIONAL_HOLDING_DAYS = 8
const SHADOW_FEATURE_WARMUP_DAYS = 320

export const SHADOW_FORWARD_START_DATE = '2026-08-31'

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

export interface ForwardAccuracySummary {
  readonly totalPicks: number
  readonly labeledPicks: number
  readonly nullPicks: number
  readonly touchedPicks: number
  readonly hitRate: number | null
  readonly nullRate: number
}

export interface ForwardWeeklySummary extends ForwardAccuracySummary {
  readonly startDate: string
  readonly endDate: string
}

export interface ShadowForwardStrategySummary {
  readonly pickCount: number
  readonly maturePickCount: number
  readonly hitCount: number
  readonly hitRate: number | null
}

export interface ShadowForwardComparison {
  readonly startDate: typeof SHADOW_FORWARD_START_DATE
  readonly endDate: string
  readonly production: ShadowForwardStrategySummary
  readonly volumeBreakoutAtrRank: ShadowForwardStrategySummary
  readonly hitRateDifferencePercentagePoints: number | null
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
  readonly nullBreakdown: Readonly<Record<ForwardNullReason, number>>
  readonly recent4Weeks: readonly ForwardWeeklySummary[]
  readonly shadowComparison: ShadowForwardComparison
}

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

const summarize = (picks: readonly EvaluatedPick[]): ForwardAccuracySummary => {
  const labels = picks.flatMap((pick) => pick.label ? [pick.label] : [])
  const touchedPicks = labels.filter((label) => label.touched).length
  const nullPicks = picks.length - labels.length
  return {
    totalPicks: picks.length,
    labeledPicks: labels.length,
    nullPicks,
    touchedPicks,
    hitRate: labels.length > 0 ? touchedPicks / labels.length : null,
    nullRate: picks.length > 0 ? nullPicks / picks.length : 0,
  }
}

const summarizeBacktest = (report: BacktestReport): ShadowForwardStrategySummary => ({
  pickCount: report.totalPicks,
  maturePickCount: report.labeledPicks,
  hitCount: report.touchedPicks,
  hitRate: report.precisionAt3,
})

const emptyShadowComparison = (asOfDate: string): ShadowForwardComparison => ({
  startDate: SHADOW_FORWARD_START_DATE,
  endDate: asOfDate,
  production: { pickCount: 0, maturePickCount: 0, hitCount: 0, hitRate: null },
  volumeBreakoutAtrRank: { pickCount: 0, maturePickCount: 0, hitCount: 0, hitRate: null },
  hitRateDifferencePercentagePoints: null,
})

const parsePublishedPicks = (row: PublishedNewsletterRow): {
  readonly kind: 'stock' | 'crash' | 'invalid'
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

  const picks = parsed.flatMap((candidate): PublishedPick[] => {
    if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) return []
    const symbol = (candidate as Record<string, unknown>).ticker
    if (typeof symbol !== 'string' || symbol.length === 0) return []
    return [{
      publicationDate: row.newsletter_date.slice(0, 10),
      symbol,
      picksSource: normalizeSource(row.picks_source),
    }]
  })
  return { kind: picks.length > 0 ? 'stock' : 'invalid', picks }
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
  readonly featuresByDate: ReadonlyMap<string, readonly StockFeatureVector[]>
  readonly masters: readonly StockMasterState[]
  readonly asOfDate: string
}): ShadowForwardComparison {
  const masters = new Map(input.masters.map((master) => [master.symbol, master]))
  const universe = input.masters.map((master) => master.symbol)
  const productionReport = runBacktest({
    strategyName: 'volumeBreakout:production',
    strategy: createCachedFeatureStrategy({
      name: 'volumeBreakout',
      featuresByDate: input.featuresByDate,
      masters,
      parameters: PRODUCTION_VOLUME_BREAKOUT_PARAMETERS,
      mode: 'force3',
    }),
    universe,
    prices: input.prices,
    tradingDays: input.tradingDays,
    startDate: SHADOW_FORWARD_START_DATE,
    endDate: input.asOfDate,
  })
  const shadowReport = runBacktest({
    strategyName: 'volumeBreakoutAtrRank:shadow',
    strategy: createVolumeBreakoutAtrRankStrategy({
      featuresByDate: input.featuresByDate,
      masters,
    }),
    universe,
    prices: input.prices,
    tradingDays: input.tradingDays,
    startDate: SHADOW_FORWARD_START_DATE,
    endDate: input.asOfDate,
  })
  const production = summarizeBacktest(productionReport)
  const volumeBreakoutAtrRank = summarizeBacktest(shadowReport)
  return {
    startDate: SHADOW_FORWARD_START_DATE,
    endDate: input.asOfDate,
    production,
    volumeBreakoutAtrRank,
    hitRateDifferencePercentagePoints: production.hitRate === null || volumeBreakoutAtrRank.hitRate === null
      ? null
      : (volumeBreakoutAtrRank.hitRate - production.hitRate) * 100,
  }
}

export function measureForwardPicks(input: {
  readonly newsletters: readonly PublishedNewsletterRow[]
  readonly prices: PriceBook
  readonly tradingDays: TradingDayIndex
  readonly asOfDate: string
  readonly lookbackDays?: number
  readonly shadowComparison?: ShadowForwardComparison
}): ForwardMeasurementReport {
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
    summarize(evaluated.filter((pick) => sourceKey(pick.picksSource) === key)),
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
      ))),
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
    overall: summarize(evaluated),
    informational8HoldingDays: summarize(informational8Evaluated),
    byPicksSource,
    nullBreakdown,
    recent4Weeks,
    shadowComparison: input.shadowComparison ?? emptyShadowComparison(input.asOfDate),
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
  if (comparison.production.pickCount === 0 && comparison.volumeBreakoutAtrRank.pickCount === 0) {
    return [
      `ATR14 사전등록 섀도우 (신호일 ${comparison.startDate} 이후, 제품 기준 5보유일)`,
      '포워드 데이터 대기 중',
    ].join('\n')
  }
  return [
    `ATR14 사전등록 섀도우 (신호일 ${comparison.startDate} 이후, 제품 기준 5보유일)`,
    '| 전략 | 픽 수 | 성숙 수 | 적중 수 | 타율 | 차이(%p) |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    `| production | ${comparison.production.pickCount} | ${comparison.production.maturePickCount} | ${comparison.production.hitCount} | ${percent(comparison.production.hitRate)} | - |`,
    `| volumeBreakoutAtrRank | ${comparison.volumeBreakoutAtrRank.pickCount} | ${comparison.volumeBreakoutAtrRank.maturePickCount} | ${comparison.volumeBreakoutAtrRank.hitCount} | ${percent(comparison.volumeBreakoutAtrRank.hitRate)} | ${percentagePoints(comparison.hitRateDifferencePercentagePoints)} |`,
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
    nullRate: percent(row.nullRate),
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
  console.log(`제품 기준: 5보유일 타율 ${percent(report.overall.hitRate)} (${report.overall.touchedPicks}/${report.overall.labeledPicks})`)
  console.log(`참고: 8보유일 확장 시 타율 ${percent(report.informational8HoldingDays.hitRate)} (${report.informational8HoldingDays.touchedPicks}/${report.informational8HoldingDays.labeledPicks})`)
  // 워크플로우가 이 로그를 GITHUB_STEP_SUMMARY에 그대로 적재하므로 같은 섹션이 양쪽에 노출된다.
  console.log(renderShadowForwardComparisonSection(report.shadowComparison))
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
  const asOfDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
  const startDate = addCalendarDays(asOfDate, -(lookbackDays - 1))

  Promise.all([
    loadPublishedNewsletters(startDate, asOfDate),
    loadTradingDayIndex(),
    loadStockMasterStates(),
  ]).then(async ([newsletters, tradingDays, masters]) => {
    const publishedPicks = newsletters.flatMap((row) => parsePublishedPicks(row).picks)
    const maturePicks = publishedPicks.flatMap((pick) => {
      const mature = maturePick(pick, tradingDays, asOfDate)
      return mature ? [mature] : []
    })

    const shadowEvaluationStart = tradingDays.firstTradingDayOnOrAfter(SHADOW_FORWARD_START_DATE)
    const shadowEndIndex = tradingDays.tradingDays.findLastIndex((date) => date <= asOfDate)
    const shadowStartIndex = shadowEvaluationStart
      ? tradingDays.indexByDate.get(shadowEvaluationStart)
      : undefined
    const shadowHistoryDates = (
      shadowStartIndex !== undefined
      && shadowEndIndex >= shadowStartIndex
    )
      ? tradingDays.tradingDays.slice(
          Math.max(0, shadowStartIndex - SHADOW_FEATURE_WARMUP_DAYS),
          shadowEndIndex + 1,
        )
      : []
    const priceStartDate = [
      maturePicks.map((pick) => pick.entryDate).sort()[0],
      shadowHistoryDates[0],
    ].filter((date): date is string => date !== undefined).sort()[0]
    const prices = priceStartDate
      ? await loadPriceBook({ startDate: priceStartDate, endDate: asOfDate })
      : new Map()
    const featuresByDate = shadowEvaluationStart && shadowHistoryDates.length > 0
      ? precomputeFeatureMap({
          prices,
          tradingDays,
          masters,
          historyDates: shadowHistoryDates,
          evaluationStart: shadowEvaluationStart,
        })
      : new Map<string, readonly StockFeatureVector[]>()
    const shadowComparison = measureShadowForwardComparison({
      prices,
      tradingDays,
      featuresByDate,
      masters,
      asOfDate,
    })
    const report = measureForwardPicks({
      newsletters,
      prices,
      tradingDays,
      asOfDate,
      lookbackDays,
      shadowComparison,
    })
    printForwardMeasurementReport(report)
  }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
