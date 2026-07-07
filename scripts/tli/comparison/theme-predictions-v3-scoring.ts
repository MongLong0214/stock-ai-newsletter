import { GTA_HORIZON_DAYS } from '@/lib/tli/labels/gt-a'
import { addKoreanTradingDays } from '@/lib/tli/trading-calendar'
import { getKSTDateString } from '@/lib/tli/date-utils'
import { evaluatePredictionRows, type EvalPredictionRow } from '@/lib/tli/eval/harness'
import { supabaseAdmin } from '@/scripts/tli/shared/supabase-admin'
import { batchUpsert } from '@/scripts/tli/shared/supabase-batch'

export interface ThemePredictionV3PendingRow {
  readonly id: string
  readonly theme_id: string
  readonly prediction_date: string
  readonly model_version: string
  readonly p_rise: number | null
  readonly abstain: boolean
}

export interface GtALabelScoreRow {
  readonly theme_id: string
  readonly base_date: string
  readonly label_status: 'pending' | 'final' | 'censored' | 'excluded'
  readonly g_log_ratio: number | null
  readonly y_binary: boolean | null
}

export interface ThemePredictionV3ScoreUpdate {
  readonly id: string
  readonly actual_g: number | null
  readonly actual_y: boolean | null
  readonly scored_at: string
  readonly score_status: 'scored' | 'censored' | 'excluded'
}

export interface ModelMetricDailyRecord {
  readonly metric_date: string
  readonly model_version: string
  readonly brier: number | null
  readonly ece: number | null
  readonly ic: number | null
  readonly p_at_10: number | null
  readonly coverage: number
  readonly abstain_rate: number
  readonly n_scored: number
}

export interface ModelMetricDailyKey {
  readonly metricDate: string
  readonly modelVersion: string
}

export interface ThemePredictionV3ScoringPlan {
  readonly updates: readonly ThemePredictionV3ScoreUpdate[]
  readonly touchedMetricKeys: readonly ModelMetricDailyKey[]
  readonly skippedPending: number
}

export interface ThemePredictionV3ScoringResult {
  readonly cutoffDate: string
  readonly pendingRows: number
  readonly updates: number
  readonly metrics: number
  readonly skippedPending: number
}

const key = (themeId: string, date: string): string => `${themeId}|${date}`
const metricKey = (date: string, modelVersion: string): string => `${date}|${modelVersion}`

function buildMetricRecord(input: {
  readonly metricDate: string
  readonly modelVersion: string
  readonly rows: readonly EvalPredictionRow[]
  readonly abstainCount: number
}): ModelMetricDailyRecord {
  const metrics = evaluatePredictionRows(input.rows)
  return {
    metric_date: input.metricDate,
    model_version: input.modelVersion,
    brier: metrics.brier,
    ece: metrics.ece,
    ic: metrics.ic,
    p_at_10: metrics.risingPAt10,
    coverage: metrics.coverage,
    abstain_rate: input.rows.length === 0 ? 0 : input.abstainCount / input.rows.length,
    n_scored: metrics.nScored,
  }
}

/**
 * 채점(개별 update)과 model_metrics_daily 대상 키 산출만 계산한다.
 * metric_date별 집계 자체는 이 배치에 포함된 행만으로는 부분 집계가 되어버리므로(재실행 시 수렴 불가)
 * 여기서는 "어떤 (metric_date, model_version)이 이번에 바뀌었는지"만 반환하고,
 * 실제 지표는 evaluateThemePredictionsV3가 theme_predictions_v3 전체를 재조회해 재계산한다 (C2).
 */
export function buildThemePredictionV3ScoringPlan(input: {
  readonly predictions: readonly ThemePredictionV3PendingRow[]
  readonly labels: readonly GtALabelScoreRow[]
  readonly scoredAt: string
}): ThemePredictionV3ScoringPlan {
  const labelsByKey = new Map(input.labels.map((label) => [key(label.theme_id, label.base_date), label]))
  const touchedKeys = new Map<string, ModelMetricDailyKey>()
  const updates: ThemePredictionV3ScoreUpdate[] = []
  let skippedPending = 0

  for (const prediction of input.predictions) {
    const label = labelsByKey.get(key(prediction.theme_id, prediction.prediction_date))
    if (!label || label.label_status === 'pending') {
      skippedPending++
      continue
    }

    if (label.label_status === 'final' && label.y_binary !== null) {
      updates.push({
        id: prediction.id,
        actual_g: label.g_log_ratio,
        actual_y: label.y_binary,
        scored_at: input.scoredAt,
        score_status: 'scored',
      })
      const groupKey = metricKey(prediction.prediction_date, prediction.model_version)
      touchedKeys.set(groupKey, { metricDate: prediction.prediction_date, modelVersion: prediction.model_version })
      continue
    }

    updates.push({
      id: prediction.id,
      actual_g: label.g_log_ratio,
      actual_y: label.y_binary,
      scored_at: input.scoredAt,
      score_status: label.label_status,
    })
  }

  return { updates, touchedMetricKeys: [...touchedKeys.values()], skippedPending }
}

async function loadPendingPredictions(cutoffDate: string, limit: number): Promise<ThemePredictionV3PendingRow[]> {
  const { data, error } = await supabaseAdmin
    .from('theme_predictions_v3')
    .select('id, theme_id, prediction_date, model_version, p_rise, abstain')
    .eq('score_status', 'pending')
    .lte('prediction_date', cutoffDate)
    .order('prediction_date', { ascending: true })
    .limit(limit)

  if (error) throw new Error(`theme_predictions_v3 pending 로딩 실패: ${error.message}`)
  return data ?? []
}

async function loadGtALabels(predictions: readonly ThemePredictionV3PendingRow[]): Promise<GtALabelScoreRow[]> {
  const dates = [...new Set(predictions.map((row) => row.prediction_date))]
  if (dates.length === 0) return []
  const { data, error } = await supabaseAdmin
    .from('theme_labels')
    .select('theme_id, base_date, label_status, g_log_ratio, y_binary')
    .eq('label_type', 'gt_a')
    .eq('horizon_days', GTA_HORIZON_DAYS)
    .in('base_date', dates)

  if (error) throw new Error(`GT-A 라벨 로딩 실패: ${error.message}`)
  return data ?? []
}

async function applyScoreUpdates(updates: readonly ThemePredictionV3ScoreUpdate[]): Promise<void> {
  for (const update of updates) {
    const { error } = await supabaseAdmin
      .from('theme_predictions_v3')
      .update({
        actual_g: update.actual_g,
        actual_y: update.actual_y,
        scored_at: update.scored_at,
        score_status: update.score_status,
      })
      .eq('id', update.id)
    if (error) throw new Error(`theme_predictions_v3 score update 실패 (${update.id}): ${error.message}`)
  }
}

interface ScoredMetricSourceRow {
  readonly theme_id: string
  readonly prediction_date: string
  readonly p_rise: number | null
  readonly abstain: boolean
  readonly actual_y: boolean | null
}

async function loadScoredPredictionsForMetric(key: ModelMetricDailyKey): Promise<ScoredMetricSourceRow[]> {
  const { data, error } = await supabaseAdmin
    .from('theme_predictions_v3')
    .select('theme_id, prediction_date, p_rise, abstain, actual_y')
    .eq('prediction_date', key.metricDate)
    .eq('model_version', key.modelVersion)
    .eq('score_status', 'scored')

  if (error) throw new Error(`model_metrics_daily 재계산용 조회 실패 (${key.metricDate}/${key.modelVersion}): ${error.message}`)
  return data ?? []
}

/**
 * touchedKeys가 가리키는 (metric_date, model_version)마다 theme_predictions_v3를 전량 재조회해
 * model_metrics_daily를 처음부터 다시 계산한다. 이번 배치의 증분이 아니라 항상 전체 집계이므로
 * 부분 실패 후 재실행돼도 값이 스스로 수렴한다 (C2).
 */
async function recomputeDailyMetrics(
  touchedKeys: readonly ModelMetricDailyKey[],
): Promise<ModelMetricDailyRecord[]> {
  const records: ModelMetricDailyRecord[] = []
  for (const key of touchedKeys) {
    const rows = await loadScoredPredictionsForMetric(key)
    const evalRows: EvalPredictionRow[] = rows.map((row) => ({
      id: `${row.theme_id}|${row.prediction_date}`,
      themeId: row.theme_id,
      baseDate: row.prediction_date,
      probability: row.abstain ? null : row.p_rise,
      y: row.actual_y ?? false,
    }))
    records.push(buildMetricRecord({
      metricDate: key.metricDate,
      modelVersion: key.modelVersion,
      rows: evalRows,
      abstainCount: rows.filter((row) => row.abstain).length,
    }))
  }
  return records
}

async function upsertDailyMetrics(metrics: readonly ModelMetricDailyRecord[]): Promise<void> {
  if (metrics.length === 0) return
  await batchUpsert(
    'model_metrics_daily',
    metrics.map((row) => ({ ...row })),
    'metric_date,model_version',
    'model_metrics_daily',
  )
}

/** prediction_date <= cutoffDate인 만기 경과 미채점 예측 총 개수 (조용한 적체 감지용, C3) */
export async function countExpiredPendingPredictions(cutoffDate: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from('theme_predictions_v3')
    .select('*', { count: 'exact', head: true })
    .eq('score_status', 'pending')
    .lte('prediction_date', cutoffDate)

  if (error) throw new Error(`theme_predictions_v3 만기 pending 카운트 실패: ${error.message}`)
  return count ?? 0
}

export async function evaluateThemePredictionsV3(input?: {
  readonly today?: string
  readonly limit?: number
}): Promise<ThemePredictionV3ScoringResult> {
  const today = input?.today ?? getKSTDateString()
  const cutoffDate = addKoreanTradingDays(today, -GTA_HORIZON_DAYS)
  const pending = await loadPendingPredictions(cutoffDate, input?.limit ?? 1000)
  if (pending.length === 0) {
    return { cutoffDate, pendingRows: 0, updates: 0, metrics: 0, skippedPending: 0 }
  }

  const labels = await loadGtALabels(pending)
  const plan = buildThemePredictionV3ScoringPlan({
    predictions: pending,
    labels,
    scoredAt: new Date().toISOString(),
  })
  await applyScoreUpdates(plan.updates)
  const metrics = await recomputeDailyMetrics(plan.touchedMetricKeys)
  await upsertDailyMetrics(metrics)
  return {
    cutoffDate,
    pendingRows: pending.length,
    updates: plan.updates.length,
    metrics: metrics.length,
    skippedPending: plan.skippedPending,
  }
}
