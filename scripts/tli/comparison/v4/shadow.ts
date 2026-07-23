// allow: SIZE_OK - Legacy TLI phase0/v4 coordinator kept narrow for T-002; PRD Phase 4 cleanup is tracked in .omo/plans/tli-v3-rebuild.md.
import { COMPARISON_PRIMARY_HORIZON_DAYS, type ComparisonCandidatePool } from '@/lib/tli/comparison/spec'
import type { ComparisonInput, PredictionResult } from '@/lib/tli/prediction'
import { supabaseAdmin } from '@/scripts/tli/shared/supabase-admin'
import { batchQuery, batchUpsert } from '@/scripts/tli/shared/supabase-batch'
import {
  buildComparisonCandidateRowV2,
  buildComparisonRunRowV2,
  buildPredictionSnapshotRowV2,
  finalizeComparisonRunV2,
} from '@/scripts/tli/comparison/v4/records'
import type { ThemeComparisonCandidateV2, ThemeComparisonRunV2 } from '@/lib/tli/types/db'

export const DEFAULT_COMPARISON_V4_SHADOW_ALGORITHM_VERSION = 'comparison-v4-shadow-v1'
export const DEFAULT_COMPARISON_V4_THRESHOLD_POLICY_VERSION = 'comparison-v4-threshold-v1'
export const DEFAULT_COMPARISON_V4_SPEC_VERSION = 'comparison-v4-spec-v1'
export const DEFAULT_THEME_DEFINITION_VERSION = 'theme-def-v2.0'
export const DEFAULT_LIFECYCLE_SCORE_VERSION = 'lifecycle-score-v2.0'

export interface ComparisonV4ShadowConfig {
  enabled: boolean
  algorithmVersion: string
  thresholdPolicyVersion: string
  comparisonSpecVersion: string
}

export function getComparisonV4ShadowConfig(): ComparisonV4ShadowConfig {
  return {
    enabled: process.env.TLI_COMPARISON_V4_SHADOW_ENABLED === 'true',
    algorithmVersion: process.env.TLI_COMPARISON_V4_ALGORITHM_VERSION || DEFAULT_COMPARISON_V4_SHADOW_ALGORITHM_VERSION,
    thresholdPolicyVersion: process.env.TLI_COMPARISON_V4_THRESHOLD_POLICY_VERSION || DEFAULT_COMPARISON_V4_THRESHOLD_POLICY_VERSION,
    comparisonSpecVersion: process.env.TLI_COMPARISON_V4_SPEC_VERSION || DEFAULT_COMPARISON_V4_SPEC_VERSION,
  }
}

export function assertComparisonV4PipelineEnabled(
  config: ComparisonV4ShadowConfig,
  pipelineName: string,
) {
  if (!config.enabled) {
    throw new Error(`Comparison v4 ${pipelineName} requires TLI_COMPARISON_V4_SHADOW_ENABLED=true`)
  }
}

interface ShadowMatchInput {
  pastThemeId: string
  similarity: number
  currentDay: number
  pastPeakDay: number
  pastTotalDays: number
  estimatedDaysToPeak: number
  message: string
  featureSim: number | null
  curveSim: number | null
  keywordSim: number | null
  pastPeakScore: number | null
  pastFinalStage: string | null
  pastDeclineDays: number | null
  isPastActive?: boolean
}

/** Postgres foreign_key_violation — tli_babl_phase_observations의 ON DELETE RESTRICT가 스냅샷을 고정한 경우 */
const BABL_PINNED_FK_CODE = '23503'

/** B-Abl 관측이 고정하지 않은 스냅샷만 골라 삭제한다 (고정 행은 PIT 원본으로 보존). */
async function deleteUnpinnedSnapshots(input: { runId: string; snapshotDate: string }): Promise<void> {
  const { data: scoped, error: scopeErr } = await supabaseAdmin
    .from('prediction_snapshots_v2')
    .select('id')
    .eq('comparison_run_id', input.runId)
    .eq('snapshot_date', input.snapshotDate)
  if (scopeErr) {
    throw new Error(`v2 snapshot 정리 대상 조회 실패: ${scopeErr.message}`)
  }
  const scopedIds = (scoped ?? []).map((row) => row.id as string)
  if (scopedIds.length === 0) return

  const { data: pinnedRows, error: pinnedErr } = await supabaseAdmin
    .from('tli_babl_phase_observations')
    .select('source_prediction_snapshot_id')
    .in('source_prediction_snapshot_id', scopedIds)
  if (pinnedErr) {
    throw new Error(`v2 snapshot 고정 여부 조회 실패: ${pinnedErr.message}`)
  }
  const pinned = new Set((pinnedRows ?? []).map((row) => row.source_prediction_snapshot_id as string))
  const deletable = scopedIds.filter((id) => !pinned.has(id))
  if (deletable.length === 0) return

  const { error: retryErr } = await supabaseAdmin
    .from('prediction_snapshots_v2')
    .delete()
    .in('id', deletable)
  if (retryErr) {
    throw new Error(`v2 shadow snapshot 비고정 row 정리 실패: ${retryErr.message}`)
  }
}

export function determineShadowCandidatePool(matches: Array<{ isPastActive?: boolean }>): ComparisonCandidatePool {
  if (matches.length === 0) return 'mixed_legacy'
  const activeCount = matches.filter(match => match.isPastActive === true).length
  if (activeCount === 0) return 'archetype'
  if (activeCount === matches.length) return 'peer'
  return 'mixed_legacy'
}

export function resolveShadowRunMaterialization(input: {
  candidateCount: number
  failedCount: number
}) {
  const materializedCandidateCount = Math.max(0, input.candidateCount - input.failedCount)
  const allCandidatesMaterialized = materializedCandidateCount === input.candidateCount
  const lastError = input.failedCount > 0
    ? `${input.failedCount} candidate rows failed to materialize`
    : null

  return {
    materializedCandidateCount,
    allCandidatesMaterialized,
    lastError,
    status: allCandidatesMaterialized ? 'materializing' as const : 'failed' as const,
  }
}

export function prepareComparisonShadowRows(input: {
  config: ComparisonV4ShadowConfig
  runDate: string
  currentThemeId: string
  sourceDataCutoffDate: string
  matches: ShadowMatchInput[]
}) {
  if (!input.config.enabled) return null
  const candidatePool = determineShadowCandidatePool(input.matches)

  const runRow = buildComparisonRunRowV2({
    runDate: input.runDate,
    currentThemeId: input.currentThemeId,
    algorithmVersion: input.config.algorithmVersion,
    runType: 'prod',
    candidatePool,
    thresholdPolicyVersion: input.config.thresholdPolicyVersion,
    sourceDataCutoffDate: input.sourceDataCutoffDate,
    comparisonSpecVersion: input.config.comparisonSpecVersion,
    themeDefinitionVersion: DEFAULT_THEME_DEFINITION_VERSION,
    lifecycleScoreVersion: DEFAULT_LIFECYCLE_SCORE_VERSION,
    expectedCandidateCount: input.matches.length,
  })

  runRow.status = 'materializing'

  const candidateRows = input.matches.map((match, idx) =>
    buildComparisonCandidateRowV2(runRow.id, idx + 1, match),
  )

  return { runRow, candidateRows }
}

export function preparePredictionShadowRow(input: {
  config: ComparisonV4ShadowConfig
  themeId: string
  snapshotDate: string
  comparisonRunId: string
  candidatePool: ComparisonCandidatePool
  prediction: PredictionResult
}) {
  if (!input.config.enabled) return null

  return buildPredictionSnapshotRowV2({
    themeId: input.themeId,
    snapshotDate: input.snapshotDate,
    comparisonRunId: input.comparisonRunId,
    algorithmVersion: input.config.algorithmVersion,
    runType: 'prod',
    candidatePool: input.candidatePool,
    evaluationHorizonDays: COMPARISON_PRIMARY_HORIZON_DAYS,
    comparisonSpecVersion: input.config.comparisonSpecVersion,
    prediction: {
      comparisonCount: input.prediction.comparisonCount,
      avgSimilarity: input.prediction.avgSimilarity,
      phase: input.prediction.phase,
      confidence: input.prediction.confidence,
      riskLevel: input.prediction.riskLevel,
      momentum: input.prediction.momentum,
      avgPeakDay: input.prediction.avgPeakDay,
      avgTotalDays: input.prediction.avgTotalDays,
      avgDaysToPeak: input.prediction.avgDaysToPeak,
      currentProgress: input.prediction.currentProgress,
      daysSinceSpike: input.prediction.daysSinceSpike,
      scenarios: input.prediction.scenarios,
      predictionIntervals: input.prediction.predictionIntervals,
    },
  })
}

export function buildShadowRunPersistenceRow(
  runRow: ThemeComparisonRunV2,
  existingRunId?: string | null,
): ThemeComparisonRunV2 {
  if (!existingRunId) return runRow
  return {
    ...runRow,
    id: existingRunId,
  }
}

export function toPredictionInputsFromShadowCandidates(
  candidates: ThemeComparisonCandidateV2[],
  pastThemeNames: Record<string, string>,
): ComparisonInput[] {
  return candidates
    .sort((a, b) => a.rank - b.rank)
    .map((candidate) => ({
      pastTheme: pastThemeNames[candidate.candidate_theme_id] || candidate.candidate_theme_id,
      similarity: candidate.similarity_score,
      estimatedDaysToPeak: candidate.estimated_days_to_peak,
      pastPeakDay: candidate.past_peak_day,
      pastTotalDays: candidate.past_total_days,
    }))
}

export async function upsertComparisonShadowRun(input: {
  config: ComparisonV4ShadowConfig
  runDate: string
  currentThemeId: string
  sourceDataCutoffDate: string
  matches: ShadowMatchInput[]
}) {
  const prepared = prepareComparisonShadowRows(input)
  if (!prepared) return null

  const logicalKey = {
    run_date: prepared.runRow.run_date,
    current_theme_id: prepared.runRow.current_theme_id,
    algorithm_version: prepared.runRow.algorithm_version,
    run_type: prepared.runRow.run_type,
    candidate_pool: prepared.runRow.candidate_pool,
  }

  const { data: existingRun, error: existingRunError } = await supabaseAdmin
    .from('theme_comparison_runs_v2')
    .select('id')
    .match(logicalKey)
    .maybeSingle()

  if (existingRunError) {
    throw new Error(`v2 shadow run 기존 row 조회 실패: ${existingRunError.message}`)
  }

  const persistedRunRow = buildShadowRunPersistenceRow(prepared.runRow, existingRun?.id as string | null | undefined)

  if (existingRun?.id) {
    const { id: _id, created_at: _createdAt, ...updatePayload } = persistedRunRow
    const { error: updateError } = await supabaseAdmin
      .from('theme_comparison_runs_v2')
      .update(updatePayload)
      .eq('id', existingRun.id)

    if (updateError) {
      throw new Error(`v2 shadow run update 실패: ${updateError.message}`)
    }
  } else {
    const { error: insertError } = await supabaseAdmin
      .from('theme_comparison_runs_v2')
      .insert(persistedRunRow)

    if (insertError) {
      throw new Error(`v2 shadow run insert 실패: ${insertError.message}`)
    }
  }

  const runId = persistedRunRow.id as string
  const { error: siblingDeleteErr } = await supabaseAdmin
    .from('theme_comparison_runs_v2')
    .delete()
    .eq('run_date', input.runDate)
    .eq('current_theme_id', input.currentThemeId)
    .eq('algorithm_version', input.config.algorithmVersion)
    .eq('run_type', prepared.runRow.run_type)
    .neq('id', runId)

  if (siblingDeleteErr && siblingDeleteErr.code === BABL_PINNED_FK_CODE) {
    // sibling run 삭제가 스냅샷 CASCADE를 타다 B-Abl 고정 행에 막힌 경우 —
    // 고정된 run은 PIT 원본으로 남긴다. 잔존 sibling은 서빙 선택(최신순)에 무해하다.
    console.warn('   ⚠️ v2 sibling run이 B-Abl 관측에 고정되어 정리를 건너뜀')
  } else if (siblingDeleteErr) {
    throw new Error(`v2 shadow sibling run 정리 실패: ${siblingDeleteErr.message}`)
  }

  const { error: candidateDeleteErr } = await supabaseAdmin
    .from('theme_comparison_candidates_v2')
    .delete()
    .eq('run_id', runId)

  if (candidateDeleteErr) {
    throw new Error(`v2 shadow candidate 정리 실패: ${candidateDeleteErr.message}`)
  }

  const candidateRows = prepared.candidateRows.map((row) => ({ ...row, run_id: runId }))
  let failedCount = 0
  if (candidateRows.length > 0) {
    failedCount = await batchUpsert(
      'theme_comparison_candidates_v2',
      candidateRows as unknown as Record<string, unknown>[],
      'run_id,candidate_theme_id',
      'comparison-v4 shadow candidates',
      { failOnPartial: false },
    )
  }
  const materialization = resolveShadowRunMaterialization({
    candidateCount: candidateRows.length,
    failedCount,
  })
  const { error: updateErr } = await supabaseAdmin
    .from('theme_comparison_runs_v2')
    .update({
      materialized_candidate_count: materialization.materializedCandidateCount,
      publish_ready: materialization.allCandidatesMaterialized,
      status: materialization.status,
      last_error: materialization.lastError,
    })
    .eq('id', runId)

  if (updateErr) {
    throw new Error(`v2 shadow run 상태 업데이트 실패: ${updateErr.message}`)
  }

  if (!materialization.allCandidatesMaterialized) {
    throw new Error(materialization.lastError || 'comparison-v4 shadow candidates failed to materialize')
  }

  return { runId, candidateRows, candidatePool: prepared.runRow.candidate_pool }
}

export async function loadShadowRunsByTheme(input: {
  config: ComparisonV4ShadowConfig
  themeIds: string[]
  runDate: string
}) {
  if (!input.config.enabled || input.themeIds.length === 0) {
    return new Map<string, { runId: string; candidatePool: ComparisonCandidatePool }>()
  }

  const { data, error } = await supabaseAdmin
    .from('theme_comparison_runs_v2')
    .select('id, current_theme_id, candidate_pool, created_at')
    .eq('run_date', input.runDate)
    .eq('algorithm_version', input.config.algorithmVersion)
    .in('run_type', ['prod', 'shadow'])
    .in('status', ['materializing', 'complete', 'published'])
    .order('created_at', { ascending: false })
    .in('current_theme_id', input.themeIds)

  if (error) {
    throw new Error(`v2 shadow run 조회 실패: ${error.message}`)
  }

  const map = new Map<string, { runId: string; candidatePool: ComparisonCandidatePool }>()
  for (const row of data ?? []) {
    const key = row.current_theme_id as string
    if (map.has(key)) continue
    map.set(key, {
      runId: row.id as string,
      candidatePool: row.candidate_pool as ComparisonCandidatePool,
    })
  }
  return map
}

export async function loadShadowCandidatesByRunIds(input: {
  config: ComparisonV4ShadowConfig
  runIds: string[]
}) {
  if (!input.config.enabled || input.runIds.length === 0) return new Map<string, ThemeComparisonCandidateV2[]>()

  const rows = await batchQuery<ThemeComparisonCandidateV2>(
    'theme_comparison_candidates_v2',
    'run_id, candidate_theme_id, rank, similarity_score, feature_sim, curve_sim, keyword_sim, current_day, past_peak_day, past_total_days, estimated_days_to_peak, message, past_peak_score, past_final_stage, past_decline_days, is_selected_top3',
    input.runIds,
    (query) => query.order('rank', { ascending: true }),
    'run_id',
  )

  const byRunId = new Map<string, ThemeComparisonCandidateV2[]>()
  for (const row of rows) {
    const list = byRunId.get(row.run_id) || []
    list.push(row)
    byRunId.set(row.run_id, list)
  }

  return byRunId
}

export async function upsertPredictionShadowSnapshot(input: {
  config: ComparisonV4ShadowConfig
  runId: string
  themeId: string
  snapshotDate: string
  candidatePool: ComparisonCandidatePool
  prediction: PredictionResult
}) {
  const row = preparePredictionShadowRow({
    config: input.config,
    themeId: input.themeId,
    snapshotDate: input.snapshotDate,
    comparisonRunId: input.runId,
    candidatePool: input.candidatePool,
    prediction: input.prediction,
  })
  if (!row) return null

  const { error } = await supabaseAdmin
    .from('prediction_snapshots_v2')
    .upsert(row, {
      onConflict: 'theme_id,snapshot_date,algorithm_version,run_type,candidate_pool,evaluation_horizon_days',
    })

  // 23503 = B-Abl 관측(046 FK ON DELETE RESTRICT)이 기존 스냅샷을 고정한 경우.
  // 새 id로의 교체(upsert)는 고정된 PIT 원본을 깨므로 DB가 막는 것이 옳고,
  // 같은 날 재실행에서는 먼저 기록된 행이 진실이다 — 유지하고 집계를 계속한다.
  if (error && error.code !== BABL_PINNED_FK_CODE) {
    throw new Error(`v2 prediction snapshot upsert 실패: ${error.message}`)
  }

  const [countResult, runResult] = await Promise.all([
    supabaseAdmin
      .from('prediction_snapshots_v2')
      .select('*', { count: 'exact', head: true })
      .eq('comparison_run_id', input.runId),
    supabaseAdmin
      .from('theme_comparison_runs_v2')
      .select('publish_ready, expected_candidate_count, materialized_candidate_count, expected_snapshot_count')
      .eq('id', input.runId)
      .single(),
  ])

  if (countResult.error) {
    throw new Error(`v2 snapshot count 조회 실패: ${countResult.error.message}`)
  }
  if (runResult.error) {
    throw new Error(`v2 shadow run snapshot count 조회 실패: ${runResult.error.message}`)
  }

  const materializedSnapshots = countResult.count ?? 0
  const runRow = runResult.data

  const expectedSnapshots = Math.max(Number(runRow.expected_snapshot_count) || 1, materializedSnapshots)

  const finalStatus = finalizeComparisonRunV2({
    publish_ready: Boolean(runRow.publish_ready),
    expected_candidate_count: Number(runRow.expected_candidate_count),
    materialized_candidate_count: Number(runRow.materialized_candidate_count),
    expected_snapshot_count: expectedSnapshots,
    materialized_snapshot_count: materializedSnapshots,
  })
  const { error: finalizeErr } = await supabaseAdmin
    .from('theme_comparison_runs_v2')
    .update({
      expected_snapshot_count: expectedSnapshots,
      materialized_snapshot_count: materializedSnapshots,
      status: finalStatus,
      ...(finalStatus === 'published' ? { published_at: new Date().toISOString() } : {}),
    })
    .eq('id', input.runId)

  if (finalizeErr) {
    throw new Error(`v2 shadow run snapshot count 업데이트 실패: ${finalizeErr.message}`)
  }

  return row
}

export async function markShadowRunCompleteWithoutSnapshot(input: {
  config: ComparisonV4ShadowConfig
  runId: string
  snapshotDate: string
}) {
  if (!input.config.enabled) return

  const { error: deleteErr } = await supabaseAdmin
    .from('prediction_snapshots_v2')
    .delete()
    .eq('comparison_run_id', input.runId)
    .eq('snapshot_date', input.snapshotDate)
  if (deleteErr && deleteErr.code === BABL_PINNED_FK_CODE) {
    // B-Abl 관측이 고정한 스냅샷이 섞여 있으면 statement 전체가 거부된다.
    // 고정 행은 PIT 원본으로 보존하고, 고정되지 않은 stale row만 골라 정리한다.
    await deleteUnpinnedSnapshots({ runId: input.runId, snapshotDate: input.snapshotDate })
  } else if (deleteErr) {
    throw new Error(`v2 shadow snapshot stale row 정리 실패: ${deleteErr.message}`)
  }

  const { data: runRow, error: loadErr } = await supabaseAdmin
    .from('theme_comparison_runs_v2')
    .select('publish_ready, expected_candidate_count, materialized_candidate_count')
    .eq('id', input.runId)
    .single()

  if (loadErr) {
    throw new Error(`v2 shadow run complete 조회 실패: ${loadErr.message}`)
  }

  const finalStatus = finalizeComparisonRunV2({
    publish_ready: Boolean(runRow.publish_ready),
    expected_candidate_count: Number(runRow.expected_candidate_count),
    materialized_candidate_count: Number(runRow.materialized_candidate_count),
    expected_snapshot_count: 0,
    materialized_snapshot_count: 0,
  })
  const { error } = await supabaseAdmin
    .from('theme_comparison_runs_v2')
    .update({
      expected_snapshot_count: 0,
      materialized_snapshot_count: 0,
      status: finalStatus,
      ...(finalStatus === 'published' ? { published_at: new Date().toISOString() } : {}),
    })
    .eq('id', input.runId)

  if (error) {
    throw new Error(`v2 shadow run complete 처리 실패: ${error.message}`)
  }
}
