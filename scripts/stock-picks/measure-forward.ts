import { getRawPrice, loadPriceBook, type PriceBook } from '@/scripts/stock-picks/data-handler'
import { labelPick, type StockPickLabel } from '@/scripts/stock-picks/label'
import { TradingDayIndex, loadTradingDayIndex } from '@/scripts/stock-picks/trading-days'

const DEFAULT_LOOKBACK_DAYS = 60
const RECENT_WEEK_COUNT = 4

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
  readonly byPicksSource: Readonly<Record<SourceKey, ForwardAccuracySummary>>
  readonly nullBreakdown: Readonly<Record<ForwardNullReason, number>>
  readonly recent4Weeks: readonly ForwardWeeklySummary[]
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
): MaturePick | null => {
  const entryDate = tradingDays.firstTradingDayOnOrAfter(pick.publicationDate)
  if (!entryDate) return null
  const signalDate = tradingDays.nextTradingDay(entryDate, -1)
  const maturityDate = tradingDays.nextTradingDay(entryDate, 4)
  if (!signalDate || !maturityDate || maturityDate > asOfDate) return null
  return { ...pick, signalDate, entryDate, maturityDate }
}

const evaluatePick = (
  pick: MaturePick,
  prices: PriceBook,
  tradingDays: TradingDayIndex,
): EvaluatedPick => {
  const label = labelPick(pick.symbol, pick.signalDate, prices, tradingDays)
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

export function measureForwardPicks(input: {
  readonly newsletters: readonly PublishedNewsletterRow[]
  readonly prices: PriceBook
  readonly tradingDays: TradingDayIndex
  readonly asOfDate: string
  readonly lookbackDays?: number
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
    byPicksSource,
    nullBreakdown,
    recent4Weeks,
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
  ]).then(async ([newsletters, tradingDays]) => {
    const publishedPicks = newsletters.flatMap((row) => parsePublishedPicks(row).picks)
    const maturePicks = publishedPicks.flatMap((pick) => {
      const mature = maturePick(pick, tradingDays, asOfDate)
      return mature ? [mature] : []
    })
    const priceStartDate = maturePicks.map((pick) => pick.entryDate).sort()[0]
    const priceEndDate = maturePicks.map((pick) => pick.maturityDate).sort().at(-1)
    const prices = priceStartDate && priceEndDate
      ? await loadPriceBook({ startDate: priceStartDate, endDate: priceEndDate })
      : new Map()
    const report = measureForwardPicks({ newsletters, prices, tradingDays, asOfDate, lookbackDays })
    printForwardMeasurementReport(report)
  }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
