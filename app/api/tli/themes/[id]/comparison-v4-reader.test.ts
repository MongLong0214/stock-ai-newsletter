import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as awaitlessReader from './comparison-v4-reader'
import type { Level4ServingMetadata, Level4SourceSurface } from '@/lib/tli/comparison/level4-types'
import {
  DEFAULT_COMPARISON_V4_SERVING_VERSION,
  applyCertifiedWeightVersion,
  buildCompletedAnalogComparisonRows,
  buildLevel4ServingMetadata,
  hasActiveComparisonV4ServingControl,
  getComparisonV4ReaderMode,
  isComparisonV4ServingEnabled,
  mapV2CandidatesToLegacyComparisons,
  resolvePinnedServingArtifactVersions,
  selectPublishedComparisonRun,
} from './comparison-v4-reader'

describe('comparison v4 reader', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  it('is enabled by default', () => {
    delete process.env.TLI_COMPARISON_V4_SERVING_ENABLED
    expect(isComparisonV4ServingEnabled()).toBe(true)
  })

  it('prefers archetype runs, then mixed runs, then peer runs for serving', () => {
    const selected = selectPublishedComparisonRun([
      { id: 'run-1', candidate_pool: 'peer', publish_ready: true, status: 'published', created_at: '2026-03-11T01:00:00Z', algorithm_version: 'a' },
      { id: 'run-mixed', candidate_pool: 'mixed_legacy', publish_ready: true, status: 'published', created_at: '2026-03-11T02:30:00Z', algorithm_version: 'a' },
      { id: 'run-2', candidate_pool: 'archetype', publish_ready: false, status: 'published', created_at: '2026-03-11T02:00:00Z', algorithm_version: 'a' },
      { id: 'run-3', candidate_pool: 'archetype', publish_ready: true, status: 'published', created_at: '2026-03-11T03:00:00Z', algorithm_version: 'a' },
    ], DEFAULT_COMPARISON_V4_SERVING_VERSION)

    expect(selected?.id).toBe('run-3')
  })

  it('falls back to mixed_legacy when no archetype run exists', () => {
    const selected = selectPublishedComparisonRun([
      { id: 'run-1', candidate_pool: 'peer', publish_ready: true, status: 'published', created_at: '2026-03-11T01:00:00Z', algorithm_version: 'a' },
      { id: 'run-mixed', candidate_pool: 'mixed_legacy', publish_ready: true, status: 'published', created_at: '2026-03-11T02:30:00Z', algorithm_version: 'a' },
    ], DEFAULT_COMPARISON_V4_SERVING_VERSION)

    expect(selected?.id).toBe('run-mixed')
  })

  it('maps v2 candidates into the legacy comparison payload shape', () => {
    const rows = mapV2CandidatesToLegacyComparisons([
      {
        candidate_theme_id: 'past-1',
        similarity_score: 0.73,
        current_day: 12,
        past_peak_day: 20,
        past_total_days: 35,
        message: 'sample',
        feature_sim: 0.5,
        curve_sim: 0.7,
        keyword_sim: 0.1,
        past_peak_score: 82,
        past_final_stage: 'Decline',
        past_decline_days: 9,
      },
    ])

    expect(rows).toEqual([
      expect.objectContaining({
        id: 'past-1',
        past_theme_id: 'past-1',
        similarity_score: 0.73,
        current_day: 12,
        past_peak_day: 20,
        past_total_days: 35,
        message: 'sample',
        feature_sim: 0.5,
        curve_sim: 0.7,
        keyword_sim: 0.1,
        past_peak_score: 82,
        past_final_stage: 'Decline',
        past_decline_days: 9,
      }),
    ])
  })

  it('builds completed analog comparison rows from query snapshot artifacts', () => {
    const rows = buildCompletedAnalogComparisonRows({
      currentDay: 41,
      candidates: [
        {
          id: 'candidate-1',
          candidate_theme_id: 'past-1',
          candidate_episode_id: 'episode-1',
          similarity_score: 0.82,
          feature_sim: 0.7,
          curve_sim: 0.8,
          keyword_sim: 0.1,
          rank: 1,
        },
      ],
      evidenceByCandidateId: new Map([
        ['candidate-1', {
          candidate_id: 'candidate-1',
          candidate_episode_id: 'episode-1',
          analog_future_path_summary: {
            peak_day: 15,
            total_days: 40,
            final_stage: 'Dormant',
            post_peak_drawdown: 0.25,
          },
          retrieval_reason: 'completed analog retrieval',
          mismatch_summary: null,
          evidence_quality: 'high',
          evidence_quality_score: 0.91,
          analog_support_count: 18,
          candidate_concentration_gini: 0.2,
          top1_analog_weight: 0.45,
        }],
      ]),
      episodeById: new Map([
        ['episode-1', {
          id: 'episode-1',
          is_active: false,
        }],
      ]),
    })

    expect(rows).toEqual([
      expect.objectContaining({
        candidate_theme_id: 'past-1',
        similarity_score: 0.82,
        current_day: 41,
        past_peak_day: 15,
        past_total_days: 40,
        past_final_stage: 'Dormant',
        past_decline_days: 25,
        supportCount: 18,
        confidenceTier: 'high',
      }),
    ])
  })

  it('keeps active peer analog rows observational when the candidate episode is still active', () => {
    const rows = buildCompletedAnalogComparisonRows({
      currentDay: 41,
      candidates: [
        {
          id: 'candidate-1',
          candidate_theme_id: 'past-1',
          candidate_episode_id: 'episode-1',
          similarity_score: 0.82,
          feature_sim: 0.7,
          curve_sim: 0.8,
          keyword_sim: 0.1,
          rank: 1,
        },
      ],
      evidenceByCandidateId: new Map([
        ['candidate-1', {
          candidate_id: 'candidate-1',
          candidate_episode_id: 'episode-1',
          analog_future_path_summary: {
            peak_day: 15,
            total_days: 40,
            final_stage: 'Dormant',
            post_peak_drawdown: 0.25,
          },
          retrieval_reason: 'active peer retrieval',
          mismatch_summary: null,
          evidence_quality: 'medium',
          evidence_quality_score: 0.72,
          analog_support_count: 12,
          candidate_concentration_gini: 0.28,
          top1_analog_weight: 0.39,
        }],
      ]),
      episodeById: new Map([
        ['episode-1', {
          id: 'episode-1',
          is_active: true,
        }],
      ]),
    })

    expect(rows).toEqual([
      expect.objectContaining({
        candidate_theme_id: 'past-1',
        past_final_stage: null,
        past_decline_days: null,
        confidenceTier: 'medium',
      }),
    ])
  })

  it('attaches level4 serving metadata to mapped candidates when a certification artifact is provided', () => {
    const metadata = buildLevel4ServingMetadata({
      source_surface: 'v2_certification',
      calibration_version: 'cal-2026-03-12',
      weight_version: 'w-2026-03-12',
      bin_summary: [
        { bucket: 7, mean_predicted: 0.61, empirical_rate: 0.18, count: 220 },
      ],
    }, 0.73)

    const rows = mapV2CandidatesToLegacyComparisons([
      {
        candidate_theme_id: 'past-1',
        similarity_score: 0.73,
        current_day: 12,
        past_peak_day: 20,
        past_total_days: 35,
        message: 'sample',
        feature_sim: 0.5,
        curve_sim: 0.7,
        keyword_sim: 0.1,
        past_peak_score: 82,
        past_final_stage: 'Decline',
        past_decline_days: 9,
      },
    ], metadata)

    expect(rows[0]).toMatchObject({
      relevanceProbability: 0.18,
      supportCount: 220,
      confidenceTier: 'medium',
      calibrationVersion: 'cal-2026-03-12',
      weightVersion: 'w-2026-03-12',
      sourceSurface: 'v2_certification',
    })
  })

  it('preserves artifact versions when analog rows only override support and confidence metadata', () => {
    const rows = mapV2CandidatesToLegacyComparisons([
      {
        candidate_theme_id: 'past-1',
        similarity_score: 0.73,
        current_day: 12,
        past_peak_day: 20,
        past_total_days: 35,
        message: 'sample',
        feature_sim: 0.5,
        curve_sim: 0.7,
        keyword_sim: 0.1,
        past_peak_score: 82,
        past_final_stage: null,
        past_decline_days: null,
        supportCount: 18,
        confidenceTier: 'high',
        sourceSurface: 'v2_certification',
      },
    ], {
      source_surface: 'v2_certification',
      calibration_version: 'cal-2026-03-12',
      weight_version: 'w-2026-03-12',
      bin_summary: [
        { bucket: 7, mean_predicted: 0.61, empirical_rate: 0.18, count: 220 },
      ],
    })

    expect(rows[0]).toMatchObject({
      supportCount: 18,
      confidenceTier: 'high',
      calibrationVersion: 'cal-2026-03-12',
      weightVersion: 'w-2026-03-12',
      sourceSurface: 'v2_certification',
    })
  })

  it('applies an active certified weight version to serving metadata', () => {
    const merged = applyCertifiedWeightVersion(
      {
        source_surface: 'v2_certification',
        calibration_version: 'cal-2026-03-12',
        weight_version: null,
        bin_summary: [],
      },
      {
        weight_version: 'w-active-2026-03-12',
        source_surface: 'v2_certification',
      },
    )

    expect(merged.weight_version).toBe('w-active-2026-03-12')
  })

  it('returns table mode by default', () => {
    delete process.env.TLI_COMPARISON_V4_SERVING_VIEW
    expect(getComparisonV4ReaderMode()).toBe('table')
  })

  it('rejects legacy diagnostic calibration artifacts for serving', () => {
    const reader = awaitlessReader as typeof awaitlessReader & {
      isCertificationSourceSurface: (value: unknown) => boolean
    }
    expect(typeof reader.isCertificationSourceSurface).toBe('function')
    expect(reader.isCertificationSourceSurface('legacy_diagnostic')).toBe(false)
    expect(reader.isCertificationSourceSurface('v2_certification')).toBe(true)
    expect(reader.isCertificationSourceSurface('replay_equivalent')).toBe(true)
  })

  it('fails closed when serving metadata is not certification-grade', () => {
    const reader = awaitlessReader as typeof awaitlessReader & {
      assertCertificationServingArtifact: (metadata: Pick<Level4ServingMetadata, 'source_surface' | 'calibration_version'>) => unknown
    }
    expect(typeof reader.assertCertificationServingArtifact).toBe('function')
    expect(() => reader.assertCertificationServingArtifact({
      source_surface: 'legacy_diagnostic' as Level4SourceSurface,
      calibration_version: 'cal-v1',
    })).toThrow(/certification/i)
  })

  it('resolves an active certified weight version for serving metadata', async () => {
    const version = await awaitlessReader.resolveServingWeightVersion({
      requestedWeightVersion: 'w-2026-03-12',
      loadWeightArtifact: vi.fn().mockResolvedValue({
        weight_version: 'w-2026-03-12',
        source_surface: 'v2_certification',
      }),
    })

    expect(version).toBe('w-2026-03-12')
  })

  it('fails closed when the active weight version is missing a certification artifact', async () => {
    await expect(awaitlessReader.resolveServingWeightVersion({
      requestedWeightVersion: 'w-2026-03-12',
      loadWeightArtifact: vi.fn().mockRejectedValue(new Error('missing weight artifact')),
    })).rejects.toThrow(/weight artifact/i)
  })

  it('uses control-row-pinned calibration and weight versions for serving artifacts', () => {
    expect(resolvePinnedServingArtifactVersions({
      calibration_version: 'cal-pinned',
      weight_version: 'w-pinned',
      serving_enabled: true,
    })).toEqual({
      calibrationVersion: 'cal-pinned',
      weightVersion: 'w-pinned',
    })
  })

  it('identifies whether a control row is actively serving', () => {
    expect(hasActiveComparisonV4ServingControl(null)).toBe(false)
    expect(hasActiveComparisonV4ServingControl({
      production_version: 'algo-v4',
      serving_enabled: false,
    })).toBe(false)
    expect(hasActiveComparisonV4ServingControl({
      production_version: 'algo-v4',
      serving_enabled: true,
    })).toBe(true)
  })

  it('always serves v4 regardless of env flag state', () => {
    process.env.TLI_COMPARISON_V4_SERVING_ENABLED = 'false'
    expect(isComparisonV4ServingEnabled()).toBe(true)
    process.env.TLI_COMPARISON_V4_SERVING_ENABLED = 'true'
    expect(isComparisonV4ServingEnabled()).toBe(true)
  })
})
