import type { RetrievalCandidate } from './baselines'

// ---------------------------------------------------------------------------
// TCAR-013: Future-Aligned Reranker
// ---------------------------------------------------------------------------

export const RERANKER_VERSION = 'future_aligned_reranker_v1'

/**
 * Weights for combining baseline similarity with future alignment signals.
 * baselineWeight + futurePathCorrWeight + peakHitWeight must equal 1.
 */
const WEIGHTS = {
  baseline: 0.4,
  futurePathCorr: 0.4,
  peakHit: 0.2,
} as const

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FutureAlignmentScore {
  episodeId: string
  /** Correlation between candidate future path and query future path, range [-1, 1] */
  futurePathCorr: number
  /** Binary: 1 if candidate peak is within tolerance of query peak, else 0 */
  peakHit: number
}

export interface RerankedCandidate extends RetrievalCandidate {
  retrievalSurface: 'future_aligned_reranker'
  rerankerScore: number
  rerankerVersion: string
}

export interface RerankerOptions {
  topN?: number
}

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

/**
 * Normalizes futurePathCorr from [-1, 1] to [0, 1] for scoring.
 */
const normalizeFuturePathCorr = (corr: number): number =>
  Math.max(0, Math.min(1, (corr + 1) / 2))

/**
 * Computes reranker score from baseline similarity and future alignment signals.
 * Uses only query-time observable features via the separate futureScores input.
 */
const computeRerankerScore = (
  baselineSimilarity: number,
  futurePathCorr: number | null,
  peakHit: number,
): number => {
  const corrContribution = futurePathCorr !== null
    ? WEIGHTS.futurePathCorr * normalizeFuturePathCorr(futurePathCorr)
    : 0
  const raw =
    WEIGHTS.baseline * baselineSimilarity +
    corrContribution +
    WEIGHTS.peakHit * peakHit

  return Math.max(0, Math.min(1, raw))
}

/**
 * Reranks baseline retrieval candidates using future alignment scores.
 *
 * - Takes baseline candidates + future alignment scores as SEPARATE inputs
 *   (future labels are never embedded on the candidate itself).
 * - Candidates without matching future scores receive 0 for alignment signals.
 * - Output records `retrieval_surface: 'future_aligned_reranker'` and
 *   `reranker_version` in artifact metadata.
 */
export const rerank = (
  candidates: RetrievalCandidate[],
  futureScores: FutureAlignmentScore[],
  options?: RerankerOptions,
): RerankedCandidate[] => {
  if (candidates.length === 0) return []

  const scoreMap = new Map<string, FutureAlignmentScore>()
  for (const fs of futureScores) {
    scoreMap.set(fs.episodeId, fs)
  }

  const scored = candidates.map((c) => {
    const fs = scoreMap.get(c.episodeId)
    const futurePathCorr = fs?.futurePathCorr ?? null
    const peakHit = fs?.peakHit ?? 0
    const rerankerScore = computeRerankerScore(
      c.similarityScore,
      futurePathCorr,
      peakHit,
    )
    return { candidate: c, rerankerScore }
  })

  scored.sort((a, b) => b.rerankerScore - a.rerankerScore)

  const topN = options?.topN ?? scored.length
  return scored.slice(0, topN).map((item, i) => ({
    episodeId: item.candidate.episodeId,
    themeId: item.candidate.themeId,
    rank: i + 1,
    retrievalSurface: 'future_aligned_reranker' as const,
    similarityScore: item.candidate.similarityScore,
    featureSim: item.candidate.featureSim,
    curveSim: item.candidate.curveSim,
    dtwDistance: item.candidate.dtwDistance,
    regimeMatch: item.candidate.regimeMatch,
    rerankerScore: item.rerankerScore,
    rerankerVersion: RERANKER_VERSION,
  }))
}
