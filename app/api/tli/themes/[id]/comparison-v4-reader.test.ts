import { beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_COMPARISON_V4_SERVING_VERSION,
  getComparisonV4ServingVersion,
  getComparisonV4ReaderMode,
  isComparisonV4ServingEnabled,
  mapV2CandidatesToLegacyComparisons,
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

  it('returns view mode when serving view env is set', () => {
    process.env.TLI_COMPARISON_V4_SERVING_VIEW = 'true'
    expect(getComparisonV4ReaderMode()).toBe('view')
  })

  it('returns table mode by default', () => {
    delete process.env.TLI_COMPARISON_V4_SERVING_VIEW
    expect(getComparisonV4ReaderMode()).toBe('table')
  })
})
