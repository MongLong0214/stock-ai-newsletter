import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComparisonInput, PredictionResult } from '@/lib/tli/prediction'
import { buildComparisonCandidateRowV2, buildPredictionSnapshotRowV2 } from '@/scripts/tli/comparison/v4/records'
import {
  DEFAULT_COMPARISON_V4_SHADOW_ALGORITHM_VERSION,
  assertComparisonV4PipelineEnabled,
  buildShadowRunPersistenceRow,
  determineShadowCandidatePool,
  getComparisonV4ShadowConfig,
  resolveShadowRunMaterialization,
  toPredictionInputsFromShadowCandidates,
  prepareComparisonShadowRows,
  preparePredictionShadowRow,
} from '@/scripts/tli/comparison/v4/shadow'

describe('comparison v4 shadow config', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  it('is disabled by default', () => {
    delete process.env.TLI_COMPARISON_V4_SHADOW_ENABLED
    const config = getComparisonV4ShadowConfig()
    expect(config.enabled).toBe(false)
    expect(config.algorithmVersion).toBe(DEFAULT_COMPARISON_V4_SHADOW_ALGORITHM_VERSION)
  })

  it('reads algorithm and policy version from env', () => {
    process.env.TLI_COMPARISON_V4_SHADOW_ENABLED = 'true'
    process.env.TLI_COMPARISON_V4_ALGORITHM_VERSION = 'algo-v4-test'
    process.env.TLI_COMPARISON_V4_THRESHOLD_POLICY_VERSION = 'policy-v2'

    const config = getComparisonV4ShadowConfig()
    expect(config.enabled).toBe(true)
    expect(config.algorithmVersion).toBe('algo-v4-test')
    expect(config.thresholdPolicyVersion).toBe('policy-v2')
  })

  it('fails closed when active comparison v4 pipeline is invoked while disabled', () => {
    expect(() => assertComparisonV4PipelineEnabled({
      enabled: false,
      algorithmVersion: 'algo-v4',
      thresholdPolicyVersion: 'policy-v1',
      comparisonSpecVersion: 'spec-v4',
    }, 'comparison generation')).toThrow(/comparison generation/i)
  })
})

describe('comparison v4 shadow row preparation', () => {
  it('derives candidate pool from match activity flags', () => {
    expect(determineShadowCandidatePool([])).toBe('mixed_legacy')
    expect(determineShadowCandidatePool([{ isPastActive: false }])).toBe('archetype')
    expect(determineShadowCandidatePool([{ isPastActive: true }])).toBe('peer')
    expect(determineShadowCandidatePool([{ isPastActive: true }, { isPastActive: false }])).toBe('mixed_legacy')
  })

  it('prepares a run row and candidate rows from matches', () => {
    const prepared = prepareComparisonShadowRows({
      config: {
        enabled: true,
        algorithmVersion: 'algo-v4',
        thresholdPolicyVersion: 'policy-v1',
        comparisonSpecVersion: 'spec-v4',
      },
      runDate: '2026-03-11',
      currentThemeId: 'theme-1',
      sourceDataCutoffDate: '2026-03-11',
      matches: [
        {
          pastThemeId: 'past-1',
          similarity: 0.7,
          currentDay: 12,
          pastPeakDay: 20,
          pastTotalDays: 35,
          estimatedDaysToPeak: 8,
          message: 'sample',
          featureSim: 0.5,
          curveSim: 0.6,
          keywordSim: 0.1,
          pastPeakScore: 82,
          pastFinalStage: 'Decline',
          pastDeclineDays: 9,
          isPastActive: false,
        },
      ],
    })

    expect(prepared).not.toBeNull()
    if (!prepared) throw new Error('expected prepared shadow rows')
    expect(prepared.runRow.current_theme_id).toBe('theme-1')
    expect(prepared.runRow.status).toBe('materializing')
    expect(prepared.runRow.candidate_pool).toBe('archetype')
    expect(prepared.candidateRows).toHaveLength(1)
    expect(prepared.candidateRows[0].candidate_theme_id).toBe('past-1')
  })

  it('returns null when shadow is disabled', () => {
    const prepared = prepareComparisonShadowRows({
      config: {
        enabled: false,
        algorithmVersion: 'algo-v4',
        thresholdPolicyVersion: 'policy-v1',
        comparisonSpecVersion: 'spec-v4',
      },
      runDate: '2026-03-11',
      currentThemeId: 'theme-1',
      sourceDataCutoffDate: '2026-03-11',
      matches: [],
    })

    expect(prepared).toBeNull()
  })

  it('keeps mixed_legacy pool for empty-match runs', () => {
    const prepared = prepareComparisonShadowRows({
      config: {
        enabled: true,
        algorithmVersion: 'algo-v4',
        thresholdPolicyVersion: 'policy-v1',
        comparisonSpecVersion: 'spec-v4',
      },
      runDate: '2026-03-11',
      currentThemeId: 'theme-1',
      sourceDataCutoffDate: '2026-03-11',
      matches: [],
    })

    expect(prepared).not.toBeNull()
    if (!prepared) throw new Error('expected prepared shadow rows')
    expect(prepared.runRow.candidate_pool).toBe('mixed_legacy')
    expect(prepared.candidateRows).toHaveLength(0)
  })

  it('reuses an existing shadow run id when rebuilding the same logical run', () => {
    const prepared = prepareComparisonShadowRows({
      config: {
        enabled: true,
        algorithmVersion: 'algo-v4',
        thresholdPolicyVersion: 'policy-v1',
        comparisonSpecVersion: 'spec-v4',
      },
      runDate: '2026-03-11',
      currentThemeId: 'theme-1',
      sourceDataCutoffDate: '2026-03-11',
      matches: [],
    })

    if (!prepared) throw new Error('expected prepared shadow rows')

    const persisted = buildShadowRunPersistenceRow(prepared.runRow, 'existing-run-id')
    expect(persisted.id).toBe('existing-run-id')
  })

  it('prepares a prediction snapshot row linked to a run id', () => {
    const prediction: PredictionResult = {
      comparisonCount: 3,
      avgSimilarity: 0.61,
      avgPeakDay: 20,
      avgTotalDays: 40,
      avgDaysToPeak: 8,
      currentProgress: 30,
      daysSinceSpike: 12,
      confidence: 'high',
      phase: 'rising',
      momentum: 'accelerating',
      phaseMessage: 'msg',
      riskLevel: 'low',
      keyInsight: 'insight',
      stageConfidence: 0.8,
      peakProgress: 50,
      scenarios: { best: { themeName: 'a', peakDay: 10, totalDays: 20, similarity: 0.5 }, median: { themeName: 'b', peakDay: 20, totalDays: 30, similarity: 0.4 }, worst: { themeName: 'c', peakDay: 30, totalDays: 40, similarity: 0.3 } },
      predictionIntervals: undefined,
    }

    const prepared = preparePredictionShadowRow({
      config: {
        enabled: true,
        algorithmVersion: 'algo-v4',
        thresholdPolicyVersion: 'policy-v1',
        comparisonSpecVersion: 'spec-v4',
      },
      themeId: 'theme-1',
      snapshotDate: '2026-03-11',
      comparisonRunId: 'run-1',
      candidatePool: 'archetype',
      prediction,
    })

    expect(prepared?.comparison_run_id).toBe('run-1')
    expect(prepared?.candidate_pool).toBe('archetype')
    expect(prepared?.algorithm_version).toBe('algo-v4')
  })

  it('builds prediction inputs from shadow candidates only', () => {
    const inputs = toPredictionInputsFromShadowCandidates(
      [
        {
          run_id: 'run-1',
          candidate_theme_id: 'past-1',
          rank: 1,
          similarity_score: 0.7,
          feature_sim: 0.5,
          curve_sim: 0.6,
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
      ],
      { 'past-1': 'Past Theme' },
    )

    expect(inputs).toEqual([
      {
        pastTheme: 'Past Theme',
        similarity: 0.7,
        estimatedDaysToPeak: 8,
        pastPeakDay: 20,
        pastTotalDays: 35,
      },
    ])
  })

  it('fails closed when any candidate row fails to materialize', () => {
    expect(resolveShadowRunMaterialization({
      candidateCount: 3,
      failedCount: 1,
    })).toEqual({
      materializedCandidateCount: 2,
      allCandidatesMaterialized: false,
      lastError: '1 candidate rows failed to materialize',
      status: 'failed',
    })

    expect(resolveShadowRunMaterialization({
      candidateCount: 3,
      failedCount: 0,
    })).toEqual({
      materializedCandidateCount: 3,
      allCandidatesMaterialized: true,
      lastError: null,
      status: 'materializing',
    })
  })
})
