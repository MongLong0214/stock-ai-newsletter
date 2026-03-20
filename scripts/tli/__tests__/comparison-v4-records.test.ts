import { describe, expect, it } from 'vitest'
import {
  buildComparisonRunRowV2,
  buildComparisonCandidateRowV2,
  buildPredictionSnapshotRowV2,
  buildLegacyComparisonPayloadFromV2,
  canPublishComparisonRunV2,
  finalizeComparisonRunV2,
} from '@/scripts/tli/comparison/v4/records'

describe('comparison v4 record builders', () => {
  it('builds a run row with publish metadata defaults', () => {
    const row = buildComparisonRunRowV2({
      runDate: '2026-03-11',
      currentThemeId: 'theme-1',
      algorithmVersion: 'v4-shadow',
      runType: 'shadow',
      candidatePool: 'archetype',
      thresholdPolicyVersion: 'policy-v1',
      sourceDataCutoffDate: '2026-03-11',
      comparisonSpecVersion: 'spec-v4',
      themeDefinitionVersion: 'td-v2.0',
      lifecycleScoreVersion: 'ls-v2.0',
      expectedCandidateCount: 3,
    })

    expect(row.status).toBe('pending')
    expect(row.publish_ready).toBe(false)
    expect(row.expected_candidate_count).toBe(3)
    expect(row.materialized_candidate_count).toBe(0)
  })

  it('builds a candidate row with all legacy payload fields preserved', () => {
    const row = buildComparisonCandidateRowV2('run-1', 1, {
      pastThemeId: 'past-1',
      similarity: 0.723,
      currentDay: 12,
      pastPeakDay: 20,
      pastTotalDays: 35,
      estimatedDaysToPeak: 8,
      message: 'sample',
      featureSim: 0.5,
      curveSim: 0.7,
      keywordSim: 0.1,
      pastPeakScore: 82,
      pastFinalStage: 'Decline',
      pastDeclineDays: 9,
    })

    expect(row.run_id).toBe('run-1')
    expect(row.rank).toBe(1)
    expect(row.candidate_theme_id).toBe('past-1')
    expect(row.current_day).toBe(12)
    expect(row.past_peak_score).toBe(82)
  })

  it('builds a v2 snapshot row with lineage fields', () => {
    const row = buildPredictionSnapshotRowV2({
      themeId: 'theme-1',
      snapshotDate: '2026-03-11',
      comparisonRunId: 'run-1',
      algorithmVersion: 'v4-shadow',
      runType: 'shadow',
      candidatePool: 'archetype',
      evaluationHorizonDays: 14,
      comparisonSpecVersion: 'spec-v4',
      prediction: {
        comparisonCount: 3,
        avgSimilarity: 0.61,
        phase: 'rising',
        confidence: 'high',
        riskLevel: 'low',
        momentum: 'accelerating',
        avgPeakDay: 20,
        avgTotalDays: 40,
        avgDaysToPeak: 8,
        currentProgress: 30,
        daysSinceSpike: 12,
        scenarios: {
          best: { themeName: 'best', peakDay: 10, totalDays: 20, similarity: 0.7 },
          median: { themeName: 'median', peakDay: 20, totalDays: 30, similarity: 0.6 },
          worst: { themeName: 'worst', peakDay: 30, totalDays: 40, similarity: 0.5 },
        },
        predictionIntervals: {
          peakDay: { lower: 10, upper: 20, median: 15, confidenceLevel: 0.9 },
          totalDays: { lower: 30, upper: 40, median: 35, confidenceLevel: 0.9 },
        },
      },
    })

    expect(row.comparison_run_id).toBe('run-1')
    expect(row.candidate_pool).toBe('archetype')
    expect(row.algorithm_version).toBe('v4-shadow')
    expect(row.evaluation_horizon_days).toBe(14)
    expect(row.prediction_intervals).toEqual({
      peakDay: { lower: 10, upper: 20, median: 15, confidenceLevel: 0.9 },
      totalDays: { lower: 30, upper: 40, median: 35, confidenceLevel: 0.9 },
    })
  })

  it('reconstructs legacy comparison payload from v2 candidate rows', () => {
    const payload = buildLegacyComparisonPayloadFromV2([
      {
        run_id: 'run-1',
        candidate_theme_id: 'past-1',
        rank: 1,
        similarity_score: 0.723,
        feature_sim: 0.5,
        curve_sim: 0.7,
        keyword_sim: 0.1,
        current_day: 12,
        past_peak_day: 20,
        past_total_days: 35,
        estimated_days_to_peak: 8,
        message: 'sample',
        past_peak_score: 82,
        past_final_stage: 'Decline',
        past_decline_days: 9,
        is_selected_top3: true,
      },
    ], { 'past-1': 'Past Theme' }, { 'past-1': [{ date: '2026-03-01', score: 50 }] })

    expect(payload[0]).toEqual({
      pastTheme: 'Past Theme',
      pastThemeId: 'past-1',
      similarity: 0.723,
      currentDay: 12,
      pastPeakDay: 20,
      pastTotalDays: 35,
      estimatedDaysToPeak: 8,
      message: 'sample',
      featureSim: 0.5,
      curveSim: 0.7,
      keywordSim: 0.1,
      pastPeakScore: 82,
      pastFinalStage: 'Decline',
      pastDeclineDays: 9,
      lifecycleCurve: [{ date: '2026-03-01', score: 50 }],
    })
  })

  it('only allows publish when publish-ready and counts match', () => {
    expect(canPublishComparisonRunV2({
      publish_ready: true,
      expected_candidate_count: 3,
      materialized_candidate_count: 3,
      expected_snapshot_count: 1,
      materialized_snapshot_count: 1,
    })).toBe(true)

    expect(canPublishComparisonRunV2({
      publish_ready: false,
      expected_candidate_count: 3,
      materialized_candidate_count: 3,
      expected_snapshot_count: 1,
      materialized_snapshot_count: 1,
    })).toBe(false)
  })

  // ── Gap 1: PRD §6.4 — theme_definition_version + lifecycle_score_version ──

  it('includes theme_definition_version and lifecycle_score_version in run row', () => {
    const row = buildComparisonRunRowV2({
      runDate: '2026-03-11',
      currentThemeId: 'theme-1',
      algorithmVersion: 'v4-shadow',
      runType: 'shadow',
      candidatePool: 'archetype',
      thresholdPolicyVersion: 'policy-v1',
      sourceDataCutoffDate: '2026-03-11',
      comparisonSpecVersion: 'spec-v4',
      expectedCandidateCount: 3,
      themeDefinitionVersion: 'td-v2.1',
      lifecycleScoreVersion: 'ls-v2.3',
    })

    expect(row.theme_definition_version).toBe('td-v2.1')
    expect(row.lifecycle_score_version).toBe('ls-v2.3')
  })

  it('finalizes run status to published or failed according to completeness', () => {
    expect(finalizeComparisonRunV2({
      publish_ready: false,
      expected_candidate_count: 2,
      materialized_candidate_count: 2,
      expected_snapshot_count: 1,
      materialized_snapshot_count: 1,
    })).toBe('complete')

    expect(finalizeComparisonRunV2({
      publish_ready: true,
      expected_candidate_count: 2,
      materialized_candidate_count: 2,
      expected_snapshot_count: 1,
      materialized_snapshot_count: 1,
    })).toBe('published')

    expect(finalizeComparisonRunV2({
      publish_ready: true,
      expected_candidate_count: 2,
      materialized_candidate_count: 1,
      expected_snapshot_count: 1,
      materialized_snapshot_count: 0,
    })).toBe('failed')
  })
})
