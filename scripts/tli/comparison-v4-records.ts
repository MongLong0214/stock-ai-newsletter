import type {
  ComparisonCandidatePool,
  ComparisonRunType,
  PredictionSnapshotV2,
  ThemeComparisonCandidateV2,
  ThemeComparisonRunV2,
} from '../../lib/tli/types/db'
import type { PredictionResult } from '../../lib/tli/prediction'

interface RunRowInput {
  runDate: string
  currentThemeId: string
  algorithmVersion: string
  runType: ComparisonRunType
  candidatePool: ComparisonCandidatePool
  thresholdPolicyVersion: string
  sourceDataCutoffDate: string
  comparisonSpecVersion: string
  expectedCandidateCount: number
}

export function buildComparisonRunRowV2(input: RunRowInput): ThemeComparisonRunV2 {
  return {
    id: crypto.randomUUID(),
    run_date: input.runDate,
    current_theme_id: input.currentThemeId,
    algorithm_version: input.algorithmVersion,
    run_type: input.runType,
    candidate_pool: input.candidatePool,
    threshold_policy_version: input.thresholdPolicyVersion,
    source_data_cutoff_date: input.sourceDataCutoffDate,
    comparison_spec_version: input.comparisonSpecVersion,
    status: 'pending',
    publish_ready: false,
    expected_candidate_count: input.expectedCandidateCount,
    materialized_candidate_count: 0,
    expected_snapshot_count: 0,
    materialized_snapshot_count: 0,
    attempt_no: 1,
    checkpoint_cursor: null,
    last_error: null,
    started_at: null,
    completed_at: null,
    published_at: null,
    created_at: new Date().toISOString(),
  }
}

interface CandidateSource {
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
}

export function buildComparisonCandidateRowV2(
  runId: string,
  rank: number,
  input: CandidateSource,
): ThemeComparisonCandidateV2 {
  return {
    run_id: runId,
    candidate_theme_id: input.pastThemeId,
    rank,
    similarity_score: input.similarity,
    feature_sim: input.featureSim,
    curve_sim: input.curveSim,
    keyword_sim: input.keywordSim,
    current_day: input.currentDay,
    past_peak_day: input.pastPeakDay,
    past_total_days: input.pastTotalDays,
    estimated_days_to_peak: input.estimatedDaysToPeak,
    message: input.message,
    past_peak_score: input.pastPeakScore,
    past_final_stage: input.pastFinalStage,
    past_decline_days: input.pastDeclineDays,
    is_selected_top3: rank <= 3,
  }
}

interface SnapshotPredictionInput {
  comparisonCount: number
  avgSimilarity: number
  phase: string
  confidence: string
  riskLevel: string
  momentum: string
  avgPeakDay: number
  avgTotalDays: number
  avgDaysToPeak: number
  currentProgress: number
  daysSinceSpike: number
  scenarios: PredictionResult['scenarios']
  predictionIntervals: PredictionResult['predictionIntervals']
}

interface SnapshotRowInput {
  themeId: string
  snapshotDate: string
  comparisonRunId: string
  algorithmVersion: string
  runType: ComparisonRunType
  candidatePool: ComparisonCandidatePool
  evaluationHorizonDays: number
  comparisonSpecVersion: string
  prediction: SnapshotPredictionInput
}

export function buildPredictionSnapshotRowV2(input: SnapshotRowInput): PredictionSnapshotV2 {
  return {
    id: crypto.randomUUID(),
    theme_id: input.themeId,
    snapshot_date: input.snapshotDate,
    comparison_run_id: input.comparisonRunId,
    comparison_count: input.prediction.comparisonCount,
    avg_similarity: input.prediction.avgSimilarity,
    phase: input.prediction.phase,
    confidence: input.prediction.confidence,
    risk_level: input.prediction.riskLevel,
    momentum: input.prediction.momentum,
    avg_peak_day: input.prediction.avgPeakDay,
    avg_total_days: input.prediction.avgTotalDays,
    avg_days_to_peak: input.prediction.avgDaysToPeak,
    current_progress: input.prediction.currentProgress,
    days_since_spike: input.prediction.daysSinceSpike,
    best_scenario: input.prediction.scenarios.best as unknown as Record<string, unknown>,
    median_scenario: input.prediction.scenarios.median as unknown as Record<string, unknown>,
    worst_scenario: input.prediction.scenarios.worst as unknown as Record<string, unknown>,
    prediction_intervals: input.prediction.predictionIntervals,
    status: 'pending',
    created_at: new Date().toISOString(),
    algorithm_version: input.algorithmVersion,
    run_type: input.runType,
    candidate_pool: input.candidatePool,
    evaluation_horizon_days: input.evaluationHorizonDays,
    comparison_spec_version: input.comparisonSpecVersion,
    evaluated_at: null,
    actual_score: null,
    actual_stage: null,
    phase_correct: null,
    peak_timing_error_days: null,
  }
}

export function buildLegacyComparisonPayloadFromV2(
  candidates: ThemeComparisonCandidateV2[],
  pastThemeNames: Record<string, string>,
  lifecycleCurvesByThemeId: Record<string, Array<{ date: string; score: number }>> = {},
) {
  return candidates.map(candidate => ({
    pastTheme: pastThemeNames[candidate.candidate_theme_id] ?? 'Unknown',
    pastThemeId: candidate.candidate_theme_id,
    similarity: candidate.similarity_score,
    currentDay: candidate.current_day,
    pastPeakDay: candidate.past_peak_day,
    pastTotalDays: candidate.past_total_days,
    estimatedDaysToPeak: candidate.estimated_days_to_peak,
    message: candidate.message,
    featureSim: candidate.feature_sim,
    curveSim: candidate.curve_sim,
    keywordSim: candidate.keyword_sim,
    pastPeakScore: candidate.past_peak_score,
    pastFinalStage: candidate.past_final_stage,
    pastDeclineDays: candidate.past_decline_days,
    lifecycleCurve: lifecycleCurvesByThemeId[candidate.candidate_theme_id] || [],
  }))
}

interface PublishCheckInput {
  publish_ready: boolean
  expected_candidate_count: number
  materialized_candidate_count: number
  expected_snapshot_count: number
  materialized_snapshot_count: number
}

export function canPublishComparisonRunV2(input: PublishCheckInput) {
  return input.publish_ready
    && input.expected_candidate_count === input.materialized_candidate_count
    && input.expected_snapshot_count === input.materialized_snapshot_count
}

export function finalizeComparisonRunV2(input: PublishCheckInput) {
  const countsComplete = input.expected_candidate_count === input.materialized_candidate_count
    && input.expected_snapshot_count === input.materialized_snapshot_count

  if (canPublishComparisonRunV2(input)) return 'published'
  if (countsComplete) return 'complete'
  return 'failed'
}
