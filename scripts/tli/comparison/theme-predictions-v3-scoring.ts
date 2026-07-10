import { GTA_HORIZON_DAYS } from '@/lib/tli/labels/gt-a'
import { addKoreanTradingDays } from '@/lib/tli/trading-calendar'
import { getKSTDateString } from '@/lib/tli/date-utils'
import { evaluatePredictionRows, type EvalPredictionRow } from '@/lib/tli/eval/harness'
import { supabaseAdmin } from '@/scripts/tli/shared/supabase-admin'
import { batchUpsert } from '@/scripts/tli/shared/supabase-batch'
import {
  buildThemePredictionV3ScoringPlan,
  type GtALabelScoreRow,
  type ModelMetricDailyKey,
  type ThemePredictionV3PendingRow,
  type ThemePredictionV3ScoreUpdate,
} from './theme-predictions-v3-legacy-scoring-plan'

export {
  buildThemePredictionV3ScoringPlan,
  type GtALabelScoreRow,
  type ModelMetricDailyKey,
  type ThemePredictionV3PendingRow,
  type ThemePredictionV3ScoreUpdate,
  type ThemePredictionV3ScoringPlan,
} from './theme-predictions-v3-legacy-scoring-plan'
export * from './theme-predictions-v3-scientific-scoring'

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

export interface ThemePredictionV3ScoringResult {
  readonly cutoffDate: string
  readonly pendingRows: number
  readonly updates: number
  readonly metrics: number
  readonly skippedPending: number
}

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

async function loadPendingPredictions(cutoffDate: string, limit: number): Promise<ThemePredictionV3PendingRow[]> {
  const { data, error } = await supabaseAdmin
    .from('theme_predictions_v3')
    .select('id, theme_id, prediction_date, model_version, labeler_version, p_rise, abstain')
    .is('experiment_cycle_id', null)
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
    .select('theme_id, base_date, labeler_version, label_status, g_log_ratio, y_binary')
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
    .is('experiment_cycle_id', null)
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
    const evalRows: EvalPredictionRow[] = rows.map((row) => {
      if (row.actual_y === null) {
        throw new Error(
          `scored metric row requires non-null actual_y (${row.theme_id}/${row.prediction_date})`,
        )
      }
      return {
        id: `${row.theme_id}|${row.prediction_date}`,
        themeId: row.theme_id,
        baseDate: row.prediction_date,
        probability: row.abstain ? null : row.p_rise,
        y: row.actual_y,
      }
    })
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
    .is('experiment_cycle_id', null)
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
