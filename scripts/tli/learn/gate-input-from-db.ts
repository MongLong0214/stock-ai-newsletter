import { supabaseAdmin } from '../shared/supabase-admin'
import type { PromotionGateInput } from './promotion-gate'
import {
  buildPromotionGateInputFromRows,
  type ModelRegistryHistoryRow,
  type ScoredPredictionRow,
} from './gate-input-metrics'

export {
  buildPromotionGateInputFromRows,
  countPromotionsThisYear,
  estimateCycleExtendedWeeks,
  type ModelRegistryHistoryRow,
  type ScoredPredictionRow,
} from './gate-input-metrics'
export {
  buildScientificPromotionGateInputFromRows,
  ScientificGateInputBlockedError,
  type ScientificCompletenessReport,
  type ScientificExcludedReasonCount,
  type ScientificExpectedTheme,
  type ScientificGateIssue,
  type ScientificGateIssueCode,
  type ScientificGatePredictionRow,
  type ScientificOriginCompleteness,
  type ScientificPromotionGateInputResult,
} from './gate-input-scientific'
export { buildScientificPromotionGateInputFromDb } from './gate-input-scientific-db'

type ServingRole = 'champion' | 'challenger'

async function loadScoredPredictions(servingRole: ServingRole, modelVersion: string): Promise<ScoredPredictionRow[]> {
  const { data, error } = await supabaseAdmin
    .from('theme_predictions_v3')
    .select('theme_id, prediction_date, p_rise, abstain, actual_y')
    .eq('serving_role', servingRole)
    .eq('model_version', modelVersion)
    .eq('score_status', 'scored')

  if (error) throw new Error(`theme_predictions_v3 ${servingRole} ${modelVersion} scored 로딩 실패: ${error.message}`)
  return data ?? []
}

async function loadModelRegistryHistory(): Promise<ModelRegistryHistoryRow[]> {
  const { data, error } = await supabaseAdmin
    .from('model_registry')
    .select('model_version, status, promoted_at')

  if (error) throw new Error(`model_registry 이력 조회 실패: ${error.message}`)
  return data ?? []
}

function resolveCurrentModelVersion(history: readonly ModelRegistryHistoryRow[], servingRole: ServingRole): string {
  const current = history.find((row) => row.status === servingRole)
  if (!current) throw new Error(`model_registry current ${servingRole} 조회 실패: ${servingRole} 행이 없습니다`)
  return current.model_version
}

/** DB(theme_predictions_v3 + model_registry)로부터 실제 promotion gate 입력을 계산한다 (A3 — 파일 입력 의존 제거) */
export async function buildPromotionGateInputFromDb(input: { readonly asOfDate: string }): Promise<PromotionGateInput> {
  const registryHistory = await loadModelRegistryHistory()
  const championModelVersion = resolveCurrentModelVersion(registryHistory, 'champion')
  const challengerModelVersion = resolveCurrentModelVersion(registryHistory, 'challenger')
  const [championScored, challengerScored] = await Promise.all([
    loadScoredPredictions('champion', championModelVersion),
    loadScoredPredictions('challenger', challengerModelVersion),
  ])

  return buildPromotionGateInputFromRows({
    asOfDate: input.asOfDate,
    championScored,
    challengerScored,
    registryHistory,
  })
}

/** model_registry champion의 gate_result.last_evaluated_at 기준 다음 체크포인트가 도래했는지 판단 (H.3) */
export function isCheckpointDueSince(lastEvaluatedAt: string | null, asOfDate: string): boolean {
  if (lastEvaluatedAt === null) return true
  const asOfMs = Date.parse(`${asOfDate}T00:00:00Z`)
  const lastMs = Date.parse(`${lastEvaluatedAt}T00:00:00Z`)
  if (!Number.isFinite(asOfMs) || !Number.isFinite(lastMs)) return true
  const elapsedDays = Math.floor((asOfMs - lastMs) / (24 * 60 * 60 * 1000))
  return elapsedDays >= 28
}

export async function loadChampionLastEvaluatedAt(): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('model_registry')
    .select('gate_result')
    .eq('status', 'champion')
    .maybeSingle()

  if (error) throw new Error(`model_registry champion gate_result 조회 실패: ${error.message}`)
  const gateResult = data?.gate_result
  if (gateResult && typeof gateResult === 'object' && !Array.isArray(gateResult) && 'last_evaluated_at' in gateResult) {
    const value = (gateResult as Record<string, unknown>).last_evaluated_at
    return typeof value === 'string' ? value : null
  }
  return null
}

/** champion의 gate_result에 이번 평가일을 병합 기록 (다음 체크포인트 판정의 기준일이 됨) */
export async function recordChampionCheckpointEvaluation(asOfDate: string): Promise<void> {
  const { data, error: selectError } = await supabaseAdmin
    .from('model_registry')
    .select('gate_result')
    .eq('status', 'champion')
    .maybeSingle()
  if (selectError) throw new Error(`model_registry champion 조회 실패: ${selectError.message}`)
  if (!data) return // 부트스트랩 이전(champion 미등록)에는 기록할 대상이 없음

  const existingGateResult = data.gate_result && typeof data.gate_result === 'object' && !Array.isArray(data.gate_result)
    ? data.gate_result as Record<string, unknown>
    : {}
  const { error: updateError } = await supabaseAdmin
    .from('model_registry')
    .update({ gate_result: { ...existingGateResult, last_evaluated_at: asOfDate } })
    .eq('status', 'champion')
  if (updateError) throw new Error(`model_registry champion gate_result 갱신 실패: ${updateError.message}`)
}
