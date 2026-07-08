import { buildFeatureVector } from '../../../lib/tli/features/build-features'
import type { BaselineFeatureRow, BaselineGtLabelRow, BaselineSnapshotRow } from '../../../lib/tli/model/baselines'
import { addKoreanTradingDays } from '../../../lib/tli/trading-calendar'
import {
  assembleFeatureInputsFromRows,
  type CompletedEpisodeFeatureRow,
  type InterestMetricFeatureRow,
  type NewsMetricFeatureRow,
  type StockDailyFeatureRow,
  type ThemeStateFeatureRow,
  type ThemeStockFeatureRow,
} from '../features/load-feature-inputs'
import { supabaseAdmin } from '../shared/supabase-admin'
import type { LabelStatusCounts, OfflineEvalInput } from './offline-eval'
import type { EvalDataDateBounds } from './offline-eval-window'

interface QueryError {
  readonly message: string
}

interface RangeQuery<T> {
  range(from: number, to: number): PromiseLike<{
    readonly data: readonly T[] | null
    readonly error: QueryError | null
  }>
}

interface ThemeLabelEvalRow {
  readonly theme_id: string
  readonly base_date: string
  readonly label_status: string
  readonly y_binary: boolean | null
}

interface PredictionSnapshotRow {
  readonly theme_id: string
  readonly snapshot_date: string
  readonly phase: string
}

const PAGE_SIZE = 1000

const emptyStatusCounts = (): LabelStatusCounts => ({
  final: 0,
  censored: 0,
  excluded: 0,
  pending: 0,
})

const uniqueSorted = (values: readonly string[]): string[] => [...new Set(values)].sort()

const countLabelStatuses = (rows: readonly ThemeLabelEvalRow[]): LabelStatusCounts => {
  const counts = emptyStatusCounts()
  return rows.reduce((current, row) => ({
    final: current.final + (row.label_status === 'final' ? 1 : 0),
    censored: current.censored + (row.label_status === 'censored' ? 1 : 0),
    excluded: current.excluded + (row.label_status === 'excluded' ? 1 : 0),
    pending: current.pending + (row.label_status === 'pending' ? 1 : 0),
  }), counts)
}

const fetchAllRows = async <T>(createQuery: () => RangeQuery<T>): Promise<T[]> => {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await createQuery().range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE_SIZE) return rows
  }
}

const loadLabelRows = async (startDate: string, endDate: string): Promise<ThemeLabelEvalRow[]> => {
  return fetchAllRows<ThemeLabelEvalRow>(() => supabaseAdmin
    .from('theme_labels')
    .select('theme_id, base_date, label_status, y_binary')
    .eq('label_type', 'gt_a')
    .gte('base_date', startDate)
    .lte('base_date', endDate))
}

const loadLabelBoundaryDate = async (ascending: boolean): Promise<string | null> => {
  const { data, error } = await supabaseAdmin
    .from('theme_labels')
    .select('base_date')
    .eq('label_type', 'gt_a')
    .eq('label_status', 'final')
    .not('y_binary', 'is', null)
    .order('base_date', { ascending })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(`GT-A label date boundary query failed: ${error.message}`)
  return typeof data?.base_date === 'string' ? data.base_date : null
}

export async function loadOfflineEvalDateBounds(): Promise<EvalDataDateBounds> {
  const [dataMinDate, dataMaxDate] = await Promise.all([
    loadLabelBoundaryDate(true),
    loadLabelBoundaryDate(false),
  ])
  return { dataMinDate, dataMaxDate }
}

const loadSnapshots = async (startDate: string, endDate: string): Promise<BaselineSnapshotRow[]> => {
  const data = await fetchAllRows<PredictionSnapshotRow>(() => supabaseAdmin
    .from('prediction_snapshots_v2')
    .select('theme_id, snapshot_date, phase')
    .eq('run_type', 'prod')
    .gte('snapshot_date', startDate)
    .lte('snapshot_date', endDate)
    .order('snapshot_date', { ascending: true })
    .order('theme_id', { ascending: true })
    .order('id', { ascending: true }))

  return data.map((row) => ({
    themeId: row.theme_id,
    snapshotDate: row.snapshot_date,
    phase: row.phase,
  }))
}

const loadFeatureSourceRows = async (
  labels: readonly BaselineGtLabelRow[],
) => {
  if (labels.length === 0) {
    return {
      interestRows: [] as readonly InterestMetricFeatureRow[],
      newsRows: [] as readonly NewsMetricFeatureRow[],
      themeStockRows: [] as readonly ThemeStockFeatureRow[],
      priceRows: [] as readonly StockDailyFeatureRow[],
      themeStateRows: [] as readonly ThemeStateFeatureRow[],
      completedEpisodeRows: [] as readonly CompletedEpisodeFeatureRow[],
      snapshotRows: [] as readonly PredictionSnapshotRow[],
    }
  }

  const labelDates = labels.map((label) => label.baseDate).sort()
  const startDate = addKoreanTradingDays(labelDates[0], -20)
  const endDate = labelDates[labelDates.length - 1]
  const themeIds = uniqueSorted(labels.map((label) => label.themeId))
  const [interest, news, stocks, prices, states, episodes, snapshots] = await Promise.all([
    fetchAllRows<InterestMetricFeatureRow>(() => supabaseAdmin.from('interest_metrics').select('theme_id, time, raw_value, anchor_scaled_value').gte('time', startDate).lte('time', endDate)),
    fetchAllRows<NewsMetricFeatureRow>(() => supabaseAdmin.from('news_metrics').select('theme_id, time, article_count').in('theme_id', themeIds).gte('time', startDate).lte('time', endDate)),
    fetchAllRows<ThemeStockFeatureRow>(() => supabaseAdmin.from('theme_stocks').select('theme_id, symbol, relevance, is_active').in('theme_id', themeIds).eq('is_active', true)),
    fetchAllRows<StockDailyFeatureRow>(() => supabaseAdmin.from('stock_daily_prices').select('symbol, trade_date, close, volume').gte('trade_date', startDate).lte('trade_date', endDate)),
    fetchAllRows<ThemeStateFeatureRow>(() => supabaseAdmin.from('theme_state_history_v2').select('theme_id, effective_from, is_active, first_spike_date').in('theme_id', themeIds).lte('effective_from', endDate)),
    // baseDate 제한 없이 로드 — 완결 여부 필터는 assembleFeatureInputsFromRows에서 라벨별 baseDate 기준으로 적용된다 (B1).
    fetchAllRows<CompletedEpisodeFeatureRow>(() => supabaseAdmin.from('episode_registry_v1').select('episode_start, episode_end, primary_peak_date, is_active').eq('is_active', false)),
    fetchAllRows<PredictionSnapshotRow>(() => supabaseAdmin
      .from('prediction_snapshots_v2')
      .select('theme_id, snapshot_date, phase')
      .eq('run_type', 'prod')
      .gte('snapshot_date', startDate)
      .lte('snapshot_date', endDate)
      .order('snapshot_date', { ascending: true })
      .order('theme_id', { ascending: true })
      .order('id', { ascending: true })),
  ])

  return {
    interestRows: interest,
    newsRows: news,
    themeStockRows: stocks,
    priceRows: prices,
    themeStateRows: states,
    completedEpisodeRows: episodes,
    snapshotRows: snapshots,
  }
}

const buildFeatureRows = async (labels: readonly BaselineGtLabelRow[]): Promise<BaselineFeatureRow[]> => {
  const sourceRows = await loadFeatureSourceRows(labels)
  return labels.map((label) => {
    const vector = buildFeatureVector(assembleFeatureInputsFromRows({
      themeId: label.themeId,
      baseDate: label.baseDate,
      ...sourceRows,
    }))
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

export async function loadOfflineEvalInput(startDate: string, endDate: string): Promise<OfflineEvalInput> {
  const [labelRows, snapshots] = await Promise.all([
    loadLabelRows(startDate, endDate),
    loadSnapshots(startDate, endDate),
  ])
  const labels = labelRows.flatMap((row): BaselineGtLabelRow[] => (
    row.label_status === 'final' && row.y_binary !== null
      ? [{ themeId: row.theme_id, baseDate: row.base_date, y: row.y_binary }]
      : []
  ))
  const featureRows = await buildFeatureRows(labels)
  return {
    startDate,
    endDate,
    labels,
    snapshots,
    featureRows,
    labelStatusCounts: countLabelStatuses(labelRows),
  }
}
