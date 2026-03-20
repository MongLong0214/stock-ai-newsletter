import { describe, expect, it } from 'vitest'
import type { RetrievalCandidate } from '@/lib/tli/analog/baselines'
import {
  aggregateRetrievalCandidates,
  buildMismatchSummary,
  buildRetrievalReason,
  computeCandidateConcentrationStats,
  selectCandidateEpisodeCorpus,
} from '../comparison/materialize-phase0-artifacts'

describe('aggregateRetrievalCandidates', () => {
  it('merges duplicate episode candidates across retrieval surfaces and keeps the best score', () => {
    const candidates: RetrievalCandidate[] = [
      {
        episodeId: 'ep-1',
        themeId: 'theme-1',
        rank: 1,
        retrievalSurface: 'price_volume_knn',
        similarityScore: 0.71,
        featureSim: 0.71,
        curveSim: null,
        dtwDistance: null,
        regimeMatch: false,
      },
      {
        episodeId: 'ep-1',
        themeId: 'theme-1',
        rank: 2,
        retrievalSurface: 'dtw_baseline',
        similarityScore: 0.82,
        featureSim: null,
        curveSim: 0.82,
        dtwDistance: 0.12,
        regimeMatch: false,
      },
      {
        episodeId: 'ep-2',
        themeId: 'theme-2',
        rank: 1,
        retrievalSurface: 'regime_filtered_nn',
        similarityScore: 0.75,
        featureSim: 0.75,
        curveSim: 0.7,
        dtwDistance: null,
        regimeMatch: true,
      },
    ]

    const aggregated = aggregateRetrievalCandidates({ candidates, topN: 5 })

    expect(aggregated).toHaveLength(2)
    expect(aggregated[0].candidateEpisodeId).toBe('ep-1')
    expect(aggregated[0].retrievalSurface).toBe('dtw_baseline')
    expect(aggregated[0].curveSim).toBe(0.82)
  })
})

describe('selectCandidateEpisodeCorpus', () => {
  const completedEpisode = {
    id: 'ep-completed',
    theme_id: 'theme-completed',
    episode_number: 1,
    boundary_source_start: 'observed' as const,
    boundary_source_end: 'observed' as const,
    episode_start: '2026-01-01',
    episode_end: '2026-02-01',
    is_active: false,
    multi_peak: false,
    primary_peak_date: '2026-01-15',
    peak_score: 80,
    policy_versions: {},
  }

  const activeEpisode = {
    ...completedEpisode,
    id: 'ep-active',
    theme_id: 'theme-active',
    is_active: true,
    episode_end: null,
  }

  it('prefers completed episodes once they exist', () => {
    const result = selectCandidateEpisodeCorpus({
      completedEpisodes: [completedEpisode],
      allEpisodes: [completedEpisode, activeEpisode],
      currentThemeId: 'theme-query',
    })

    expect(result).toEqual([completedEpisode])
  })

  it('falls back to all episodes when no completed episodes exist', () => {
    const result = selectCandidateEpisodeCorpus({
      completedEpisodes: [],
      allEpisodes: [completedEpisode, activeEpisode],
      currentThemeId: 'theme-query',
    })

    expect(result).toHaveLength(2)
  })
})

describe('computeCandidateConcentrationStats', () => {
  it('returns bounded concentration metrics', () => {
    const result = computeCandidateConcentrationStats([0.9, 0.5, 0.3])

    expect(result.gini).toBeGreaterThanOrEqual(0)
    expect(result.gini).toBeLessThanOrEqual(1)
    expect(result.top1Weight).toBeGreaterThan(0)
    expect(result.top1Weight).toBeLessThanOrEqual(1)
  })
})

describe('human-readable retrieval outputs', () => {
  it('builds retrieval reasons with surface and strength signals', () => {
    const reason = buildRetrievalReason({
      surface: 'regime_filtered_nn',
      featureSim: 0.8,
      curveSim: 0.75,
      regimeMatch: true,
    })

    expect(reason).toContain('레짐')
    expect(reason).toContain('feature')
    expect(reason).toContain('curve')
  })

  it('builds mismatch summary only for materially different paths', () => {
    expect(buildMismatchSummary({
      queryDay: 41,
      candidatePeakDay: 15,
      candidateTotalDays: 70,
    })).toContain('정점 시점 차이')

    expect(buildMismatchSummary({
      queryDay: 41,
      candidatePeakDay: 39,
      candidateTotalDays: 45,
    })).toBeNull()
  })
})
