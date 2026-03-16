import { describe, it, expect } from 'vitest'
import type { RetrievalCandidate } from '../analog/baselines'
import {
  rerank,
  RERANKER_VERSION,
  type FutureAlignmentScore,
  type RerankedCandidate,
  type RerankerOptions,
} from '../analog/reranker'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeCandidate = (
  id: string,
  overrides: Partial<RetrievalCandidate> = {},
): RetrievalCandidate => ({
  episodeId: id,
  themeId: `th-${id}`,
  rank: 1,
  retrievalSurface: 'price_volume_knn',
  similarityScore: 0.8,
  featureSim: 0.7,
  curveSim: 0.6,
  dtwDistance: null,
  regimeMatch: true,
  ...overrides,
})

const makeFutureScore = (
  episodeId: string,
  futurePathCorr: number,
  peakHit: number,
): FutureAlignmentScore => ({
  episodeId,
  futurePathCorr,
  peakHit,
})

// ---------------------------------------------------------------------------
// TCAR-013: Future-Aligned Reranker
// ---------------------------------------------------------------------------

describe('TCAR-013: rerank', () => {
  it('returns reranked candidates with retrieval_surface future_aligned_reranker', () => {
    const candidates: RetrievalCandidate[] = [
      makeCandidate('ep-1', { similarityScore: 0.9, rank: 1 }),
      makeCandidate('ep-2', { similarityScore: 0.7, rank: 2 }),
    ]
    const futureScores: FutureAlignmentScore[] = [
      makeFutureScore('ep-1', 0.3, 0),
      makeFutureScore('ep-2', 0.8, 1),
    ]

    const result = rerank(candidates, futureScores)

    for (const c of result) {
      expect(c.retrievalSurface).toBe('future_aligned_reranker')
    }
  })

  it('sets reranker_score and reranker_version on every output', () => {
    const candidates: RetrievalCandidate[] = [
      makeCandidate('ep-1'),
      makeCandidate('ep-2'),
    ]
    const futureScores: FutureAlignmentScore[] = [
      makeFutureScore('ep-1', 0.5, 1),
      makeFutureScore('ep-2', 0.4, 0),
    ]

    const result = rerank(candidates, futureScores)

    for (const c of result) {
      expect(typeof c.rerankerScore).toBe('number')
      expect(c.rerankerScore).toBeGreaterThanOrEqual(0)
      expect(c.rerankerScore).toBeLessThanOrEqual(1)
      expect(c.rerankerVersion).toBe(RERANKER_VERSION)
    }
  })

  it('reranks based on combined baseline + future alignment score', () => {
    // ep-1: high baseline (0.9), low future alignment (0.1, 0)
    // ep-2: low baseline (0.4), high future alignment (0.9, 1)
    const candidates: RetrievalCandidate[] = [
      makeCandidate('ep-1', { similarityScore: 0.9, rank: 1 }),
      makeCandidate('ep-2', { similarityScore: 0.4, rank: 2 }),
    ]
    const futureScores: FutureAlignmentScore[] = [
      makeFutureScore('ep-1', 0.1, 0),
      makeFutureScore('ep-2', 0.9, 1),
    ]

    const result = rerank(candidates, futureScores)

    // ep-2 should be promoted to rank 1 due to strong future alignment
    expect(result[0].episodeId).toBe('ep-2')
    expect(result[0].rank).toBe(1)
    expect(result[1].episodeId).toBe('ep-1')
    expect(result[1].rank).toBe(2)
  })

  it('preserves original candidate fields in output', () => {
    const candidates: RetrievalCandidate[] = [
      makeCandidate('ep-1', { featureSim: 0.85, curveSim: 0.72, dtwDistance: 3.2, regimeMatch: false }),
    ]
    const futureScores: FutureAlignmentScore[] = [
      makeFutureScore('ep-1', 0.5, 1),
    ]

    const result = rerank(candidates, futureScores)

    expect(result[0].episodeId).toBe('ep-1')
    expect(result[0].themeId).toBe('th-ep-1')
    expect(result[0].featureSim).toBe(0.85)
    expect(result[0].curveSim).toBe(0.72)
    expect(result[0].dtwDistance).toBe(3.2)
    expect(result[0].regimeMatch).toBe(false)
  })

  it('returns empty array for empty input', () => {
    const result = rerank([], [])
    expect(result).toEqual([])
  })

  it('handles candidates without matching future scores (null = 0 contribution)', () => {
    const candidates: RetrievalCandidate[] = [
      makeCandidate('ep-1', { similarityScore: 0.8 }),
      makeCandidate('ep-2', { similarityScore: 0.5 }),
    ]
    // only ep-2 has a future score
    const futureScores: FutureAlignmentScore[] = [
      makeFutureScore('ep-2', 0.9, 1),
    ]

    const result = rerank(candidates, futureScores)

    // ep-2 boosted by future alignment, ep-1 gets 0 future contribution (not 0.5 * weight)
    expect(result[0].episodeId).toBe('ep-2')
  })

  it('missing future score contributes 0, not normalized 0.5', () => {
    // Two identical baseline candidates — one with futurePathCorr=0 (known zero),
    // one missing (null). Missing should score LOWER than known-zero.
    const candidates: RetrievalCandidate[] = [
      makeCandidate('ep-known-zero', { similarityScore: 0.8 }),
      makeCandidate('ep-missing', { similarityScore: 0.8 }),
    ]
    const futureScores: FutureAlignmentScore[] = [
      makeFutureScore('ep-known-zero', 0, 0),
      // ep-missing has NO future score entry
    ]

    const result = rerank(candidates, futureScores)

    // ep-known-zero: 0.4*0.8 + 0.4*normalize(0) + 0.2*0 = 0.32 + 0.4*0.5 + 0 = 0.52
    // ep-missing:    0.4*0.8 + 0 + 0.2*0 = 0.32
    expect(result[0].episodeId).toBe('ep-known-zero')
    expect(result[0].rerankerScore).toBeGreaterThan(result[1].rerankerScore)
  })

  it('respects topN option', () => {
    const candidates: RetrievalCandidate[] = [
      makeCandidate('ep-1', { similarityScore: 0.9 }),
      makeCandidate('ep-2', { similarityScore: 0.8 }),
      makeCandidate('ep-3', { similarityScore: 0.7 }),
    ]
    const futureScores: FutureAlignmentScore[] = [
      makeFutureScore('ep-1', 0.5, 1),
      makeFutureScore('ep-2', 0.4, 0),
      makeFutureScore('ep-3', 0.3, 0),
    ]

    const opts: RerankerOptions = { topN: 2 }
    const result = rerank(candidates, futureScores, opts)

    expect(result).toHaveLength(2)
  })

  it('clamps rerankerScore to [0, 1]', () => {
    const candidates: RetrievalCandidate[] = [
      makeCandidate('ep-1', { similarityScore: 1.0 }),
    ]
    const futureScores: FutureAlignmentScore[] = [
      makeFutureScore('ep-1', 1.0, 1),
    ]

    const result = rerank(candidates, futureScores)

    expect(result[0].rerankerScore).toBeLessThanOrEqual(1)
    expect(result[0].rerankerScore).toBeGreaterThanOrEqual(0)
  })

  it('only uses query-time observable features (no future labels in candidate)', () => {
    // The reranker should take future alignment as a separate input,
    // NOT embed future labels into the candidate itself.
    // The RerankedCandidate type should NOT have futurePathCorr or peakHit directly.
    const candidates: RetrievalCandidate[] = [makeCandidate('ep-1')]
    const futureScores: FutureAlignmentScore[] = [makeFutureScore('ep-1', 0.5, 1)]

    const result = rerank(candidates, futureScores)

    // reranker_score is a combined score; individual future labels are not on the output
    expect(result[0]).not.toHaveProperty('futurePathCorr')
    expect(result[0]).not.toHaveProperty('peakHit')
  })

  it('produces deterministic output for same inputs', () => {
    const candidates: RetrievalCandidate[] = [
      makeCandidate('ep-1', { similarityScore: 0.8 }),
      makeCandidate('ep-2', { similarityScore: 0.6 }),
      makeCandidate('ep-3', { similarityScore: 0.7 }),
    ]
    const futureScores: FutureAlignmentScore[] = [
      makeFutureScore('ep-1', 0.3, 0),
      makeFutureScore('ep-2', 0.8, 1),
      makeFutureScore('ep-3', 0.5, 0),
    ]

    const run1 = rerank(candidates, futureScores)
    const run2 = rerank(candidates, futureScores)

    expect(run1.map((c) => c.episodeId)).toEqual(run2.map((c) => c.episodeId))
    expect(run1.map((c) => c.rerankerScore)).toEqual(run2.map((c) => c.rerankerScore))
  })
})

describe('TCAR-013: RERANKER_VERSION', () => {
  it('is a non-empty string', () => {
    expect(typeof RERANKER_VERSION).toBe('string')
    expect(RERANKER_VERSION.length).toBeGreaterThan(0)
  })
})
