import { COMPARISON_PRIMARY_HORIZON_DAYS, type ComparisonCandidatePool } from '../../lib/tli/comparison/spec'
import type { ComparisonInput, PredictionResult } from '../../lib/tli/prediction'
import { supabaseAdmin } from './supabase-admin'
import { batchQuery, batchUpsert } from './supabase-batch'
import {
  buildComparisonCandidateRowV2,
  buildComparisonRunRowV2,
  buildPredictionSnapshotRowV2,
  finalizeComparisonRunV2,
} from './comparison-v4-records'
import type { ThemeComparisonCandidateV2 } from '../../lib/tli/types/db'

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

export function determineShadowCandidatePool(matches: Array<{ isPastActive?: boolean }>): ComparisonCandidatePool {
  if (matches.length === 0) return 'mixed_legacy'
  const activeCount = matches.filter(match => match.isPastActive === true).length
  if (activeCount === 0) return 'archetype'
  if (activeCount === matches.length) return 'peer'
  return 'mixed_legacy'
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

  const { data, error } = await supabaseAdmin
    .from('theme_comparison_runs_v2')
    .upsert(prepared.runRow, {
      onConflict: 'run_date,current_theme_id,algorithm_version,run_type,candidate_pool',
    })
    .select('id')
    .single()

  if (error || !data?.id) {
    throw new Error(`v2 shadow run upsert 실패: ${error?.message ?? 'missing run id'}`)
  }

  const runId = data.id as string
  const { error: siblingDeleteErr } = await supabaseAdmin
    .from('theme_comparison_runs_v2')
    .delete()
    .eq('run_date', input.runDate)
    .eq('current_theme_id', input.currentThemeId)
    .eq('algorithm_version', input.config.algorithmVersion)
    .eq('run_type', 'shadow')
    .neq('id', runId)

  if (siblingDeleteErr) {
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
    )
  }
  const materializedCandidateCount = Math.max(0, candidateRows.length - failedCount)

  const allCandidatesMaterialized = materializedCandidateCount === candidateRows.length
  const { error: updateErr } = await supabaseAdmin
    .from('theme_comparison_runs_v2')
    .update({
      materialized_candidate_count: materializedCandidateCount,
      publish_ready: allCandidatesMaterialized,
      status: allCandidatesMaterialized ? 'materializing' : 'failed',
      last_error: failedCount > 0 ? `${failedCount} candidate rows failed to materialize` : null,
    })
    .eq('id', runId)

  if (updateErr) {
    throw new Error(`v2 shadow run 상태 업데이트 실패: ${updateErr.message}`)
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

  if (error) {
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
  if (deleteErr) {
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
