import { getServerSupabaseClient } from '@/lib/supabase/server-client'
import { getKSTDateString } from '@/lib/tli/date-utils'

export const METHODOLOGY_METRICS_WINDOW_DAYS = 90

type NumericInput = number | string | null

export interface ModelMetricsDailyRow {
  metric_date: string
  model_version: string
  brier: NumericInput
  ece: NumericInput
  p_at_10: NumericInput
  coverage: NumericInput
  abstain_rate: NumericInput
  n_scored: number
}

export interface MethodologyMetricsSummary {
  status: 'ready' | 'empty' | 'unavailable'
  windowDays: number
  sinceDate: string
  throughDate: string
  championModelVersion: string | null
  latestMetricDate: string | null
  metricDays: number
  nScored: number
  brier: number | null
  ece: number | null
  pAt10: number | null
  coverage: number | null
  abstainRate: number | null
}

interface BuildSummaryInput {
  rows: ModelMetricsDailyRow[]
  championModelVersion: string | null
  today: string
  windowDays?: number
}

interface LoadSummaryOptions {
  today?: string
  windowDays?: number
}

export function buildMethodologyMetricsSummary({
  rows,
  championModelVersion,
  today,
  windowDays = METHODOLOGY_METRICS_WINDOW_DAYS,
}: BuildSummaryInput): MethodologyMetricsSummary {
  const sinceDate = shiftDateString(today, -(windowDays - 1))
  const matchingRows = championModelVersion
    ? rows
        .filter((row) => row.model_version === championModelVersion)
        .filter((row) => row.metric_date >= sinceDate && row.metric_date <= today)
        .sort((a, b) => a.metric_date.localeCompare(b.metric_date))
    : []

  if (matchingRows.length === 0) {
    return buildEmptySummary({ championModelVersion, sinceDate, today, windowDays, status: 'empty' })
  }

  return {
    status: 'ready',
    windowDays,
    sinceDate,
    throughDate: today,
    championModelVersion,
    latestMetricDate: matchingRows.at(-1)?.metric_date ?? null,
    metricDays: matchingRows.length,
    nScored: sumScored(matchingRows),
    brier: weightedMean(matchingRows, (row) => toFiniteNumber(row.brier)),
    ece: weightedMean(matchingRows, (row) => toFiniteNumber(row.ece)),
    pAt10: arithmeticMean(matchingRows, (row) => toFiniteNumber(row.p_at_10)),
    coverage: arithmeticMean(matchingRows, (row) => toFiniteNumber(row.coverage)),
    abstainRate: arithmeticMean(matchingRows, (row) => toFiniteNumber(row.abstain_rate)),
  }
}

export async function loadMethodologyMetricsSummary(
  options: LoadSummaryOptions = {},
): Promise<MethodologyMetricsSummary> {
  const today = options.today ?? getKSTDateString()
  const windowDays = options.windowDays ?? METHODOLOGY_METRICS_WINDOW_DAYS
  const sinceDate = shiftDateString(today, -(windowDays - 1))

  try {
    const supabase = getServerSupabaseClient()
    const { data: championData, error: championError } = await supabase
      .from('model_registry')
      .select('model_version')
      .eq('status', 'champion')
      .limit(1)

    if (championError) {
      console.error('[TLI Methodology] champion model lookup failed:', championError)
      return buildEmptySummary({ championModelVersion: null, sinceDate, today, windowDays, status: 'unavailable' })
    }

    const championModelVersion = extractChampionModelVersion(championData)
    if (!championModelVersion) {
      return buildEmptySummary({ championModelVersion: null, sinceDate, today, windowDays, status: 'empty' })
    }

    const { data: metricData, error: metricError } = await supabase
      .from('model_metrics_daily')
      .select('metric_date, model_version, brier, ece, p_at_10, coverage, abstain_rate, n_scored')
      .eq('model_version', championModelVersion)
      .gte('metric_date', sinceDate)
      .lte('metric_date', today)
      .order('metric_date', { ascending: true })

    if (metricError) {
      console.error('[TLI Methodology] model metrics lookup failed:', metricError)
      return buildEmptySummary({ championModelVersion, sinceDate, today, windowDays, status: 'unavailable' })
    }

    return buildMethodologyMetricsSummary({
      rows: extractMetricRows(metricData),
      championModelVersion,
      today,
      windowDays,
    })
  } catch (error) {
    console.error('[TLI Methodology] metrics summary failed:', error)
    return buildEmptySummary({ championModelVersion: null, sinceDate, today, windowDays, status: 'unavailable' })
  }
}

function buildEmptySummary({
  championModelVersion,
  sinceDate,
  today,
  windowDays,
  status,
}: {
  championModelVersion: string | null
  sinceDate: string
  today: string
  windowDays: number
  status: MethodologyMetricsSummary['status']
}): MethodologyMetricsSummary {
  return {
    status,
    windowDays,
    sinceDate,
    throughDate: today,
    championModelVersion,
    latestMetricDate: null,
    metricDays: 0,
    nScored: 0,
    brier: null,
    ece: null,
    pAt10: null,
    coverage: null,
    abstainRate: null,
  }
}

function extractChampionModelVersion(data: unknown): string | null {
  if (!Array.isArray(data)) return null
  const row = data.find(isRecord)
  const modelVersion = row?.model_version
  return typeof modelVersion === 'string' ? modelVersion : null
}

function extractMetricRows(data: unknown): ModelMetricsDailyRow[] {
  if (!Array.isArray(data)) return []
  const rows: ModelMetricsDailyRow[] = []

  for (const item of data) {
    if (!isRecord(item)) continue
    const metricDate = item.metric_date
    const modelVersion = item.model_version
    if (typeof metricDate !== 'string' || typeof modelVersion !== 'string') continue

    rows.push({
      metric_date: metricDate,
      model_version: modelVersion,
      brier: toNumericInput(item.brier),
      ece: toNumericInput(item.ece),
      p_at_10: toNumericInput(item.p_at_10),
      coverage: toNumericInput(item.coverage),
      abstain_rate: toNumericInput(item.abstain_rate),
      n_scored: toScoredCount(item.n_scored),
    })
  }

  return rows
}

function weightedMean(rows: ModelMetricsDailyRow[], select: (row: ModelMetricsDailyRow) => number | null) {
  let weightedSum = 0
  let totalWeight = 0

  for (const row of rows) {
    const value = select(row)
    if (value === null || row.n_scored <= 0) continue
    weightedSum += value * row.n_scored
    totalWeight += row.n_scored
  }

  return totalWeight > 0 ? roundMetric(weightedSum / totalWeight) : arithmeticMean(rows, select)
}

function arithmeticMean(rows: ModelMetricsDailyRow[], select: (row: ModelMetricsDailyRow) => number | null) {
  const values: number[] = []
  for (const row of rows) {
    const value = select(row)
    if (value !== null) values.push(value)
  }

  if (values.length === 0) return null
  const total = values.reduce((sum, value) => sum + value, 0)
  return roundMetric(total / values.length)
}

function sumScored(rows: ModelMetricsDailyRow[]) {
  return rows.reduce((sum, row) => sum + row.n_scored, 0)
}

function toNumericInput(value: unknown): NumericInput {
  return typeof value === 'number' || typeof value === 'string' ? value : null
}

function toFiniteNumber(value: NumericInput): number | null {
  const numeric = typeof value === 'string' ? Number(value) : value
  return typeof numeric === 'number' && Number.isFinite(numeric) ? numeric : null
}

function toScoredCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return Math.max(0, Math.trunc(value))
}

function shiftDateString(dateString: string, offsetDays: number): string {
  const date = new Date(`${dateString}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + offsetDays)
  return date.toISOString().slice(0, 10)
}

function roundMetric(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
