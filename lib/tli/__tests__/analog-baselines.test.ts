/**
 * TCAR-009: Implement Baseline Candidate Retrieval Pack
 *
 * TDD RED phase — tests for baseline analog retrieval (3 surfaces).
 */

import { describe, expect, it } from 'vitest'
import {
  retrievePriceVolumeKnn,
  retrieveDtwBaseline,
  retrieveRegimeFilteredNn,
  type QueryInput,
  type CorpusEpisode,
  type RetrievalCandidate,
} from '../analog/baselines'

// --- Test helpers ---

const makeQuery = (overrides: Partial<QueryInput> = {}): QueryInput => ({
  episodeId: 'ep-query',
  themeId: 'th-query',
  snapshotDate: '2026-02-01',
  features: { interest: 0.8, news_momentum: 0.6, volatility: 0.3 },
  curve: [10, 20, 40, 60, 80, 70],
  stage: 'Growth',
  ...overrides,
})

const makeCorpusEpisode = (id: string, overrides: Partial<CorpusEpisode> = {}): CorpusEpisode => ({
  episodeId: id,
  themeId: `th-${id}`,
  episodeEnd: '2025-12-01',
  features: { interest: 0.7, news_momentum: 0.5, volatility: 0.4 },
  curve: [10, 25, 45, 65, 75, 60],
  stage: 'Growth',
  peakDay: 5,
  totalDays: 30,
  ...overrides,
})

describe('TCAR-009: retrievePriceVolumeKnn', () => {
  it('returns top-N candidates ranked by feature similarity', () => {
    const query = makeQuery()
    const corpus: CorpusEpisode[] = [
      makeCorpusEpisode('ep-1', { features: { interest: 0.79, news_momentum: 0.59, volatility: 0.31 } }),
      makeCorpusEpisode('ep-2', { features: { interest: 0.5, news_momentum: 0.3, volatility: 0.8 } }),
      makeCorpusEpisode('ep-3', { features: { interest: 0.78, news_momentum: 0.61, volatility: 0.29 } }),
    ]

    const result = retrievePriceVolumeKnn(query, corpus, { topN: 2 })

    expect(result).toHaveLength(2)
    expect(result[0].rank).toBe(1)
    expect(result[1].rank).toBe(2)
    // ep-1 and ep-3 should rank higher than ep-2 (closer features)
    expect(result.map(r => r.episodeId)).not.toContain('ep-2')
  })

  it('sets retrieval_surface to price_volume_knn', () => {
    const result = retrievePriceVolumeKnn(
      makeQuery(),
      [makeCorpusEpisode('ep-1')],
      { topN: 1 },
    )

    expect(result[0].retrievalSurface).toBe('price_volume_knn')
  })

  it('excludes episodes that end after query snapshot date', () => {
    const query = makeQuery({ snapshotDate: '2026-01-15' })
    const corpus: CorpusEpisode[] = [
      makeCorpusEpisode('ep-past', { episodeEnd: '2025-12-01' }),
      makeCorpusEpisode('ep-future', { episodeEnd: '2026-02-01' }), // After query date
      makeCorpusEpisode('ep-active', { episodeEnd: null }), // Still active
    ]

    const result = retrievePriceVolumeKnn(query, corpus, { topN: 5 })

    expect(result).toHaveLength(1)
    expect(result[0].episodeId).toBe('ep-past')
  })

  it('returns empty array for empty corpus', () => {
    const result = retrievePriceVolumeKnn(makeQuery(), [], { topN: 5 })
    expect(result).toHaveLength(0)
  })

  it('returns fewer than topN if corpus is smaller', () => {
    const result = retrievePriceVolumeKnn(
      makeQuery(),
      [makeCorpusEpisode('ep-1')],
      { topN: 5 },
    )
    expect(result).toHaveLength(1)
  })

  it('produces deterministic ranking for same input', () => {
    const query = makeQuery()
    const corpus = [makeCorpusEpisode('ep-1'), makeCorpusEpisode('ep-2')]

    const r1 = retrievePriceVolumeKnn(query, corpus, { topN: 2 })
    const r2 = retrievePriceVolumeKnn(query, corpus, { topN: 2 })

    expect(r1.map(r => r.episodeId)).toEqual(r2.map(r => r.episodeId))
  })
})

describe('TCAR-009: retrieveDtwBaseline', () => {
  it('returns candidates ranked by DTW similarity', () => {
    const query = makeQuery({ curve: [10, 20, 40, 60, 80, 70] })
    const corpus: CorpusEpisode[] = [
      makeCorpusEpisode('ep-similar', { curve: [12, 22, 38, 62, 78, 68] }),
      makeCorpusEpisode('ep-different', { curve: [80, 70, 60, 40, 20, 10] }),
    ]

    const result = retrieveDtwBaseline(query, corpus, { topN: 2 })

    expect(result).toHaveLength(2)
    expect(result[0].episodeId).toBe('ep-similar')
    expect(result[0].retrievalSurface).toBe('dtw_baseline')
  })

  it('excludes future episodes from corpus', () => {
    const query = makeQuery({ snapshotDate: '2026-01-15' })
    const corpus: CorpusEpisode[] = [
      makeCorpusEpisode('ep-past', { episodeEnd: '2025-12-01', curve: [10, 20, 30] }),
      makeCorpusEpisode('ep-future', { episodeEnd: '2026-02-01', curve: [10, 20, 30] }),
    ]

    const result = retrieveDtwBaseline(query, corpus, { topN: 5 })

    expect(result).toHaveLength(1)
    expect(result[0].episodeId).toBe('ep-past')
  })

  it('handles empty curves gracefully', () => {
    const query = makeQuery({ curve: [] })
    const corpus = [makeCorpusEpisode('ep-1', { curve: [10, 20, 30] })]

    const result = retrieveDtwBaseline(query, corpus, { topN: 5 })

    expect(result).toHaveLength(0)
  })

  it('returns dtw_distance in candidate metadata', () => {
    const result = retrieveDtwBaseline(
      makeQuery(),
      [makeCorpusEpisode('ep-1')],
      { topN: 1 },
    )

    expect(result[0].dtwDistance).toBeDefined()
    expect(typeof result[0].dtwDistance).toBe('number')
  })
})

describe('TCAR-009: retrieveRegimeFilteredNn', () => {
  it('only retrieves candidates in same stage/regime', () => {
    const query = makeQuery({ stage: 'Growth' })
    const corpus: CorpusEpisode[] = [
      makeCorpusEpisode('ep-growth', { stage: 'Growth' }),
      makeCorpusEpisode('ep-peak', { stage: 'Peak' }),
      makeCorpusEpisode('ep-decay', { stage: 'Decline' }),
    ]

    const result = retrieveRegimeFilteredNn(query, corpus, { topN: 5 })

    expect(result.every(r => r.regimeMatch)).toBe(true)
    expect(result).toHaveLength(1)
    expect(result[0].episodeId).toBe('ep-growth')
  })

  it('sets retrieval_surface to regime_filtered_nn', () => {
    const result = retrieveRegimeFilteredNn(
      makeQuery({ stage: 'Growth' }),
      [makeCorpusEpisode('ep-1', { stage: 'Growth' })],
      { topN: 1 },
    )

    expect(result[0].retrievalSurface).toBe('regime_filtered_nn')
    expect(result[0].regimeMatch).toBe(true)
  })

  it('returns empty when no regime match in corpus', () => {
    const query = makeQuery({ stage: 'Peak' })
    const corpus: CorpusEpisode[] = [
      makeCorpusEpisode('ep-1', { stage: 'Growth' }),
      makeCorpusEpisode('ep-2', { stage: 'Decline' }),
    ]

    const result = retrieveRegimeFilteredNn(query, corpus, { topN: 5 })

    expect(result).toHaveLength(0)
  })

  it('ranks by combined feature + curve similarity within regime', () => {
    const query = makeQuery({ stage: 'Growth', curve: [10, 20, 40, 60, 80, 70] })
    const corpus: CorpusEpisode[] = [
      makeCorpusEpisode('ep-close', {
        stage: 'Growth',
        features: { interest: 0.79, news_momentum: 0.59, volatility: 0.31 },
        curve: [12, 22, 38, 62, 78, 68],
      }),
      makeCorpusEpisode('ep-far', {
        stage: 'Growth',
        features: { interest: 0.3, news_momentum: 0.2, volatility: 0.9 },
        curve: [80, 70, 60, 40, 20, 10],
      }),
    ]

    const result = retrieveRegimeFilteredNn(query, corpus, { topN: 2 })

    expect(result[0].episodeId).toBe('ep-close')
  })
})

describe('TCAR-009: RetrievalCandidate output contract', () => {
  it('has all required fields per AnalogCandidatesV1', () => {
    const result = retrievePriceVolumeKnn(
      makeQuery(),
      [makeCorpusEpisode('ep-1')],
      { topN: 1 },
    )
    const c = result[0]

    expect(typeof c.episodeId).toBe('string')
    expect(typeof c.themeId).toBe('string')
    expect(typeof c.rank).toBe('number')
    expect(typeof c.retrievalSurface).toBe('string')
    expect(typeof c.similarityScore).toBe('number')
    expect(c.similarityScore).toBeGreaterThanOrEqual(0)
    expect(c.similarityScore).toBeLessThanOrEqual(1)
  })
})
