import { buildFeatureVector } from '@/lib/tli/features/build-features'
import {
  buildBaselineReport,
  type BaselineFeatureRow,
  type BaselineGtLabelRow,
  type BaselineSnapshotRow,
} from '@/lib/tli/model/baselines'
import { addKoreanTradingDays } from '@/lib/tli/trading-calendar'
import {
  assembleFeatureInputsFromRows,
  type CompletedEpisodeFeatureRow,
  type InterestMetricFeatureRow,
  type NewsMetricFeatureRow,
  type StockDailyFeatureRow,
  type ThemeStateFeatureRow,
  type ThemeStockFeatureRow,
} from '@/scripts/tli/features/load-feature-inputs'
import { supabaseAdmin } from '@/scripts/tli/shared/supabase-admin'

interface ThemeLabelRow {
  readonly theme_id: string
  readonly base_date: string
  readonly y_binary: boolean | null
}

interface PredictionSnapshotRow {
  readonly theme_id: string
  readonly snapshot_date: string
  readonly phase: string
}

const DEFAULT_START_DATE = '2026-01-07'

const readDateArg = (name: string, fallback: string): string => {
  const prefix = `--${name}=`
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback
}

const loadLabels = async (startDate: string, endDate: string): Promise<BaselineGtLabelRow[]> => {
  const { data, error } = await supabaseAdmin
    .from('theme_labels')
    .select('theme_id, base_date, y_binary')
    .eq('label_type', 'gt_a')
    .eq('label_status', 'final')
    .gte('base_date', startDate)
    .lte('base_date', endDate)

  if (error) throw new Error(`GT-A final 라벨 로딩 실패: ${error.message}`)

  return (data ?? []).flatMap((row: ThemeLabelRow) => (
    row.y_binary === null
      ? []
      : [{ themeId: row.theme_id, baseDate: row.base_date, y: row.y_binary }]
  ))
}

const loadSnapshots = async (startDate: string, endDate: string): Promise<BaselineSnapshotRow[]> => {
  const { data, error } = await supabaseAdmin
    .from('prediction_snapshots_v2')
    .select('theme_id, snapshot_date, phase')
    .eq('run_type', 'prod')
    .gte('snapshot_date', startDate)
    .lte('snapshot_date', endDate)

  if (error) throw new Error(`prediction_snapshots_v2 로딩 실패: ${error.message}`)

  return (data ?? []).map((row: PredictionSnapshotRow) => ({
    themeId: row.theme_id,
    snapshotDate: row.snapshot_date,
    phase: row.phase,
  }))
}

const uniqueSorted = (values: readonly string[]): string[] => [...new Set(values)].sort()

const loadFeatureSourceRows = async (
  labels: readonly BaselineGtLabelRow[],
): Promise<{
  readonly interestRows: readonly InterestMetricFeatureRow[]
  readonly newsRows: readonly NewsMetricFeatureRow[]
  readonly themeStockRows: readonly ThemeStockFeatureRow[]
  readonly priceRows: readonly StockDailyFeatureRow[]
  readonly themeStateRows: readonly ThemeStateFeatureRow[]
  readonly completedEpisodeRows: readonly CompletedEpisodeFeatureRow[]
}> => {
  if (labels.length === 0) {
    return {
      interestRows: [],
      newsRows: [],
      themeStockRows: [],
      priceRows: [],
      themeStateRows: [],
      completedEpisodeRows: [],
    }
  }

  const labelDates = labels.map((label) => label.baseDate).sort()
  const firstDate = labelDates[0]
  const lastDate = labelDates[labelDates.length - 1]
  const startDate = addKoreanTradingDays(firstDate, -20)
  const themeIds = uniqueSorted(labels.map((label) => label.themeId))
  const [interest, news, stocks, prices, states, episodes] = await Promise.all([
    supabaseAdmin
      .from('interest_metrics')
      .select('theme_id, time, raw_value, anchor_scaled_value')
      .gte('time', startDate)
      .lte('time', lastDate),
    supabaseAdmin
      .from('news_metrics')
      .select('theme_id, time, article_count')
      .in('theme_id', themeIds)
      .gte('time', startDate)
      .lte('time', lastDate),
    supabaseAdmin
      .from('theme_stocks')
      .select('theme_id, symbol, relevance, is_active')
      .in('theme_id', themeIds)
      .eq('is_active', true),
    supabaseAdmin
      .from('stock_daily_prices')
      .select('symbol, trade_date, close, volume')
      .gte('trade_date', startDate)
      .lte('trade_date', lastDate),
    supabaseAdmin
      .from('theme_state_history_v2')
      .select('theme_id, effective_from, is_active, first_spike_date')
      .in('theme_id', themeIds)
      .lte('effective_from', lastDate),
    // baseDate 제한 없이 로드 — 완결 여부 필터는 assembleFeatureInputsFromRows에서 라벨별 baseDate 기준으로 적용된다 (B1).
    supabaseAdmin
      .from('episode_registry_v1')
      .select('episode_start, episode_end, primary_peak_date, is_active')
      .eq('is_active', false),
  ])

  for (const response of [interest, news, stocks, prices, states, episodes]) {
    if (response.error) {
      throw new Error(`baseline 피처 소스 로딩 실패: ${response.error.message}`)
    }
  }

  return {
    interestRows: interest.data ?? [],
    newsRows: news.data ?? [],
    themeStockRows: stocks.data ?? [],
    priceRows: prices.data ?? [],
    themeStateRows: states.data ?? [],
    completedEpisodeRows: episodes.data ?? [],
  }
}

const buildFeatureRows = async (labels: readonly BaselineGtLabelRow[]): Promise<BaselineFeatureRow[]> => {
  const sourceRows = await loadFeatureSourceRows(labels)
  return labels.map((label) => {
    const input = assembleFeatureInputsFromRows({
      themeId: label.themeId,
      baseDate: label.baseDate,
      ...sourceRows,
    })
    const vector = buildFeatureVector(input)
    return {
      themeId: label.themeId,
      baseDate: label.baseDate,
      values: vector.values,
      missingFlags: vector.missingFlags,
      abstain: vector.abstain,
      y: label.y,
    }
  })
}

async function main(): Promise<void> {
  const endDate = readDateArg('end', new Date().toISOString().slice(0, 10))
  const startDate = readDateArg('start', DEFAULT_START_DATE)
  const [labels, snapshots] = await Promise.all([
    loadLabels(startDate, endDate),
    loadSnapshots(startDate, endDate),
  ])
  const featureRows = await buildFeatureRows(labels)
  const report = buildBaselineReport({ labels, snapshots, featureRows })

  console.log(JSON.stringify({
    reportVersion: 'tli-baseline-report-v1',
    startDate,
    endDate,
    ...report,
  }, null, 2))
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
