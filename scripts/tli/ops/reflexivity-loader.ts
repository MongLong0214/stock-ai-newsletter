import { z } from 'zod'
import {
  buildReflexivityReport,
  shiftDate,
  type ExposureEvent,
  type ExposureSource,
  type InterestMetricRow,
  type ReflexivityReport,
  type ThemeLabelRow,
} from './reflexivity-report'

export interface ReflexivityThemeRow {
  readonly id: string
  readonly name: string
  readonly nameEn: string | null
}

export interface NewsletterExposureRow {
  readonly id: string
  readonly newsletterDate: string
  readonly geminiAnalysis: string | null
  readonly subscriberCount: number | null
}

export interface ExposureExtractionSummary {
  readonly extractionMode: ExposureSource
  readonly newsletterCount: number
  readonly matchedNewsletterCount: number
  readonly unmatchedNewsletterCount: number
  readonly events: readonly ExposureEvent[]
}

export interface LoadedReflexivityReport extends ReflexivityReport {
  readonly extraction: ExposureExtractionSummary
}

export interface LoadReflexivityReportOptions {
  readonly asOfDate: string
  readonly quarterStart: string
  readonly quarterEnd: string
  readonly eventWindowDays?: number
  readonly minComparableEvents?: number
  readonly liftThreshold?: number
  readonly labelLiftThreshold?: number
}

interface QueryError {
  readonly message: string
}

interface RangeQuery<T> {
  range(from: number, to: number): Promise<{
    readonly data: readonly T[] | null
    readonly error: QueryError | null
  }>
}

const PAGE_SIZE = 1000

const ThemeDbRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  name_en: z.string().nullable(),
})

const NewsletterDbRowSchema = z.object({
  id: z.string(),
  newsletter_date: z.string(),
  gemini_analysis: z.string().nullable(),
  subscriber_count: z.number().nullable(),
})

const InterestMetricDbRowSchema = z.object({
  theme_id: z.string(),
  time: z.string(),
  raw_value: z.number().nullable(),
})

const ThemeLabelDbRowSchema = z.object({
  theme_id: z.string(),
  base_date: z.string(),
  label_status: z.string(),
  y_binary: z.boolean().nullable(),
  g_log_ratio: z.number().nullable(),
})

async function fetchAllRows<T>(createQuery: () => RangeQuery<T>): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await createQuery().range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE_SIZE) return rows
  }
}

function normalizeText(value: string): string {
  return value.toLocaleLowerCase('ko-KR')
}

function uniqueTerms(values: readonly (string | null)[]): string[] {
  return [...new Set(values
    .map((value) => value?.trim() ?? '')
    .filter((value) => value.length >= 3 || /[가-힣]/.test(value)))]
}

function findMatchedName(haystack: string, theme: ReflexivityThemeRow): string | null {
  return uniqueTerms([theme.name, theme.nameEn])
    .find((term) => haystack.includes(normalizeText(term))) ?? null
}

function sortEvents(events: readonly ExposureEvent[]): ExposureEvent[] {
  return [...events].sort((left, right) => (
    left.exposureDate === right.exposureDate
      ? left.themeId.localeCompare(right.themeId)
      : left.exposureDate.localeCompare(right.exposureDate)
  ))
}

export function extractNewsletterExposureEvents(input: {
  readonly themes: readonly ReflexivityThemeRow[]
  readonly newsletters: readonly NewsletterExposureRow[]
}): ExposureExtractionSummary {
  const events: ExposureEvent[] = []
  const matchedNewsletterIds = new Set<string>()
  const seenThemeDate = new Set<string>()

  for (const newsletter of input.newsletters) {
    const haystack = normalizeText(newsletter.geminiAnalysis ?? '')
    if (haystack.length === 0) continue

    for (const theme of input.themes) {
      const matchedName = findMatchedName(haystack, theme)
      if (!matchedName) continue

      const key = `${theme.id}:${newsletter.newsletterDate}`
      if (seenThemeDate.has(key)) continue

      seenThemeDate.add(key)
      matchedNewsletterIds.add(newsletter.id)
      events.push({
        themeId: theme.id,
        exposureDate: newsletter.newsletterDate,
        source: 'newsletter_content_text_match',
        newsletterId: newsletter.id,
        matchedName,
        subscriberCount: newsletter.subscriberCount,
      })
    }
  }

  return {
    extractionMode: 'newsletter_content_text_match',
    newsletterCount: input.newsletters.length,
    matchedNewsletterCount: matchedNewsletterIds.size,
    unmatchedNewsletterCount: input.newsletters.length - matchedNewsletterIds.size,
    events: sortEvents(events),
  }
}

async function loadThemes(): Promise<ReflexivityThemeRow[]> {
  const { supabaseAdmin } = await import('@/scripts/tli/shared/supabase-admin')
  const rows = ThemeDbRowSchema.array().parse(await fetchAllRows<unknown>(() => supabaseAdmin
    .from('themes')
    .select('id, name, name_en')
    .eq('is_active', true)
    .order('name', { ascending: true })))

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    nameEn: row.name_en,
  }))
}

async function loadNewsletters(startDate: string, endDate: string): Promise<NewsletterExposureRow[]> {
  const { supabaseAdmin } = await import('@/scripts/tli/shared/supabase-admin')
  const rows = NewsletterDbRowSchema.array().parse(await fetchAllRows<unknown>(() => supabaseAdmin
    .from('newsletter_content')
    .select('id, newsletter_date, gemini_analysis, subscriber_count')
    .eq('is_sent', true)
    .gte('newsletter_date', startDate)
    .lte('newsletter_date', endDate)
    .order('newsletter_date', { ascending: true })))

  return rows.map((row) => ({
    id: row.id,
    newsletterDate: row.newsletter_date.slice(0, 10),
    geminiAnalysis: row.gemini_analysis,
    subscriberCount: row.subscriber_count,
  }))
}

async function loadInterestRows(themeIds: readonly string[], startDate: string, endDate: string): Promise<InterestMetricRow[]> {
  const { batchQuery } = await import('@/scripts/tli/shared/supabase-batch')
  const rows = InterestMetricDbRowSchema.array().parse(await batchQuery(
    'interest_metrics',
    'theme_id, time, raw_value',
    [...themeIds],
    (query) => query.gte('time', startDate).lte('time', endDate).order('time', { ascending: true }),
    'theme_id',
    { failOnError: true },
  ))

  return rows.map((row) => ({
    themeId: row.theme_id,
    date: row.time.slice(0, 10),
    rawValue: row.raw_value,
  }))
}

async function loadLabelRows(themeIds: readonly string[], startDate: string, endDate: string): Promise<ThemeLabelRow[]> {
  const { batchQuery } = await import('@/scripts/tli/shared/supabase-batch')
  const rows = ThemeLabelDbRowSchema.array().parse(await batchQuery(
    'theme_labels',
    'theme_id, base_date, label_status, y_binary, g_log_ratio',
    [...themeIds],
    (query) => query
      .eq('label_type', 'gt_a')
      .eq('horizon_days', 5)
      .gte('base_date', startDate)
      .lte('base_date', endDate),
    'theme_id',
    { failOnError: true },
  ))

  return rows.map((row) => ({
    themeId: row.theme_id,
    baseDate: row.base_date.slice(0, 10),
    labelStatus: row.label_status,
    yBinary: row.y_binary,
    gLogRatio: row.g_log_ratio,
  }))
}

export async function loadReflexivityReport(options: LoadReflexivityReportOptions): Promise<LoadedReflexivityReport> {
  const eventWindowDays = options.eventWindowDays ?? 3
  const [themes, newsletters] = await Promise.all([
    loadThemes(),
    loadNewsletters(options.quarterStart, options.asOfDate),
  ])
  const themeIds = themes.map((theme) => theme.id).sort()
  const extraction = extractNewsletterExposureEvents({ themes, newsletters })
  const [interestRows, labelRows] = await Promise.all([
    loadInterestRows(themeIds, options.quarterStart, shiftDate(options.asOfDate, eventWindowDays)),
    loadLabelRows(themeIds, options.quarterStart, options.quarterEnd),
  ])
  const report = buildReflexivityReport({
    asOfDate: options.asOfDate,
    quarterStart: options.quarterStart,
    quarterEnd: options.quarterEnd,
    allThemeIds: themeIds,
    exposureEvents: extraction.events,
    interestRows,
    labelRows,
    eventWindowDays,
    minComparableEvents: options.minComparableEvents,
    liftThreshold: options.liftThreshold,
    labelLiftThreshold: options.labelLiftThreshold,
    extractionMode: extraction.extractionMode,
  })

  return {
    ...report,
    extraction,
  }
}
