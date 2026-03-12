import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as awaitlessReader from './comparison-v4-reader'
import type { Level4ServingMetadata, Level4SourceSurface } from '@/lib/tli/comparison/level4-types'
import {
  DEFAULT_COMPARISON_V4_SERVING_VERSION,
  applyCertifiedWeightVersion,
  buildLevel4ServingMetadata,
  getComparisonV4ServingVersion,
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

  it('is disabled by default', () => {
    delete process.env.TLI_COMPARISON_V4_SERVING_ENABLED
    expect(isComparisonV4ServingEnabled()).toBe(false)
  })

  it('uses explicit production version when provided', () => {
    process.env.TLI_COMPARISON_V4_PRODUCTION_VERSION = 'algo-v4-prod'
    expect(getComparisonV4ServingVersion()).toBe('algo-v4-prod')
  })

  it('falls back to latest serving version when no production pointer exists', () => {
    delete process.env.TLI_COMPARISON_V4_PRODUCTION_VERSION
    expect(getComparisonV4ServingVersion()).toBe(DEFAULT_COMPARISON_V4_SERVING_VERSION)
  })

  it('selects the newest published archetype run for serving', () => {
    const selected = selectPublishedComparisonRun([
      { id: 'run-1', candidate_pool: 'peer', publish_ready: true, status: 'published', created_at: '2026-03-11T01:00:00Z', algorithm_version: 'a' },
      { id: 'run-2', candidate_pool: 'archetype', publish_ready: false, status: 'published', created_at: '2026-03-11T02:00:00Z', algorithm_version: 'a' },
      { id: 'run-3', candidate_pool: 'archetype', publish_ready: true, status: 'published', created_at: '2026-03-11T03:00:00Z', algorithm_version: 'a' },
    ], DEFAULT_COMPARISON_V4_SERVING_VERSION)

    expect(selected?.id).toBe('run-3')
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
      {
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
      },
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

  it('returns view mode when serving view env is set', () => {
    process.env.TLI_COMPARISON_V4_SERVING_VIEW = 'true'
    expect(getComparisonV4ReaderMode()).toBe('view')
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
})
