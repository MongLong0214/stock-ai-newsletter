import {
  computeBrierDeltaCi,
  computeEceClusterBootstrapUpper95,
  detectClusterImbalance,
  evaluateWithWeeklyMondaySubset,
  selectWeeklyMondaySubset,
} from '@/lib/tli/eval/harness'
import type { EvalPredictionRow } from '@/lib/tli/eval/harness'
import { supabaseAdmin } from '@/scripts/tli/shared/supabase-admin'
import type { PromotionGateInput } from './promotion-gate'

interface ScoredPredictionRow {
  readonly theme_id: string
  readonly prediction_date: string
  readonly p_rise: number | null
  readonly abstain: boolean
  readonly actual_y: boolean | null
}

interface ModelRegistryHistoryRow {
  readonly model_version: string
  readonly status: string
  readonly promoted_at: string | null
}

const toEvalRows = (rows: readonly ScoredPredictionRow[]): EvalPredictionRow[] => rows.map((row) => ({
  id: `${row.theme_id}|${row.prediction_date}`,
  themeId: row.theme_id,
  baseDate: row.prediction_date,
  probability: row.abstain ? null : row.p_rise,
  y: row.actual_y ?? false,
}))

async function loadScoredPredictions(servingRole: 'champion' | 'challenger'): Promise<ScoredPredictionRow[]> {
  const { data, error } = await supabaseAdmin
    .from('theme_predictions_v3')
    .select('theme_id, prediction_date, p_rise, abstain, actual_y')
    .eq('serving_role', servingRole)
    .eq('score_status', 'scored')

  if (error) throw new Error(`theme_predictions_v3 ${servingRole} scored 로딩 실패: ${error.message}`)
  return data ?? []
}

async function loadModelRegistryHistory(): Promise<ModelRegistryHistoryRow[]> {
  const { data, error } = await supabaseAdmin
    .from('model_registry')
    .select('model_version, status, promoted_at')

  if (error) throw new Error(`model_registry 이력 조회 실패: ${error.message}`)
  return data ?? []
}

const yearOf = (isoDate: string): number => Number(isoDate.slice(0, 4))

export function countPromotionsThisYear(history: readonly ModelRegistryHistoryRow[], asOfDate: string): number {
  const year = yearOf(asOfDate)
  return history.filter((row) => row.promoted_at !== null && yearOf(row.promoted_at) === year).length
}

/** 최초 4주 사이클 이후부터 체크포인트 연장이 발생한다는 기준선 (promotion-gate.ts의 8주 cap과 동일 단위). */
const INITIAL_SHADOW_CYCLE_WEEKS = 4

/**
 * champion이 초기 4주 shadow 사이클 이후 연장된 주수(연장 주수)를 반환한다.
 * model_registry에 별도의 "연장 횟수" 카운터가 없어, promoted_at 이후 경과 주수에서 초기 4주 사이클을
 * 뺀 값을 프록시로 사용한다 — 정확한 연장 이력이 필요해지면 전용 카운터 컬럼 도입을 고려할 것.
 * promotion-gate.ts의 maximumCycleExtensionWeeks(8)와 동일하게 "주" 단위여야 한다.
 */
export function estimateCycleExtendedWeeks(promotedAt: string | null, asOfDate: string): number {
  if (!promotedAt) return 0
  const asOfMs = Date.parse(`${asOfDate}T00:00:00Z`)
  const promotedMs = Date.parse(promotedAt)
  if (!Number.isFinite(asOfMs) || !Number.isFinite(promotedMs) || asOfMs < promotedMs) return 0
  const weeksSincePromotion = Math.floor((asOfMs - promotedMs) / (7 * 24 * 60 * 60 * 1000))
  return Math.max(0, weeksSincePromotion - INITIAL_SHADOW_CYCLE_WEEKS)
}

export function buildPromotionGateInputFromRows(input: {
  readonly asOfDate: string
  readonly championScored: readonly ScoredPredictionRow[]
  readonly challengerScored: readonly ScoredPredictionRow[]
  readonly registryHistory: readonly ModelRegistryHistoryRow[]
}): PromotionGateInput {
  const championRows = toEvalRows(input.championScored)
  const challengerRows = toEvalRows(input.challengerScored)
  const championSummary = evaluateWithWeeklyMondaySubset(championRows)
  const challengerSummary = evaluateWithWeeklyMondaySubset(challengerRows)
  // B-4/N3: 5일 horizon 겹침 자기상관이 CI를 낙관 왜곡하므로 비중복(주 1 기준일) 서브셋으로 계산한다.
  // nEff(challengerSummary.nonOverlappingN)도 동일한 weekly-Monday 정의이므로 표본 정의가 결속된다.
  const brierDeltaCi = computeBrierDeltaCi({
    baseline: selectWeeklyMondaySubset(championRows),
    candidate: selectWeeklyMondaySubset(challengerRows),
    confidenceLevel: 0.99,
  })
  const imbalance = detectClusterImbalance(challengerRows.map((row) => ({ clusterId: row.themeId })))
  const currentChampion = input.registryHistory.find((row) => row.status === 'champion')

  return {
    nEff: challengerSummary.nonOverlappingN,
    cycleExtendedWeeks: estimateCycleExtendedWeeks(currentChampion?.promoted_at ?? null, input.asOfDate),
    promotionsThisYear: countPromotionsThisYear(input.registryHistory, input.asOfDate),
    brierChampion: championSummary.weeklyMonday.brier ?? championSummary.raw.brier ?? 0.25,
    deltaBrierPoint: brierDeltaCi.meanDelta,
    deltaBrierUpper99: brierDeltaCi.upper,
    ecePoint: challengerSummary.weeklyMonday.ece ?? challengerSummary.raw.ece ?? 0,
    // ecePoint와 동일한 비중복(weekly-Monday) 표본에 대해 upper95를 추정해 표본 정의를 결속한다.
    // N4 shared 구현(lib/tli/eval/bootstrap.ts)을 재사용해 시드/반복수/fail-closed 정책을 결속한다.
    eceUpper95: computeEceClusterBootstrapUpper95(selectWeeklyMondaySubset(challengerRows)),
    pAt10Challenger: challengerSummary.weeklyMonday.risingPAt10 ?? challengerSummary.raw.risingPAt10 ?? 0,
    pAt10Champion: championSummary.weeklyMonday.risingPAt10 ?? championSummary.raw.risingPAt10 ?? 0,
    clusterBalance: {
      topFivePercentLabelShare: imbalance.topClusterShare,
      wildClusterBootstrapUsed: imbalance.useWildClusterBootstrap,
    },
  }
}

/** DB(theme_predictions_v3 + model_registry)로부터 실제 promotion gate 입력을 계산한다 (A3 — 파일 입력 의존 제거) */
export async function buildPromotionGateInputFromDb(input: { readonly asOfDate: string }): Promise<PromotionGateInput> {
  const [championScored, challengerScored, registryHistory] = await Promise.all([
    loadScoredPredictions('champion'),
    loadScoredPredictions('challenger'),
    loadModelRegistryHistory(),
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
