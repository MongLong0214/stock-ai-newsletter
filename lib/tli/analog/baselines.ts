/**
 * TCAR-009: Baseline Candidate Retrieval Pack
 *
 * Three retrieval surfaces for analog episode matching:
 * 1. price_volume_knn — normalized feature-space nearest neighbor
 * 2. dtw_baseline — DTW curve similarity
 * 3. regime_filtered_nn — stage-filtered combined similarity
 *
 * All functions are pure (no DB calls). Corpus filtering ensures
 * only episodes observable before query time are considered (PRD §12.1.3).
 */

import type { RetrievalSurface } from './types'
import type { Stage } from '../types/db'
import { dtwSimilarity } from '../comparison/dtw'

// --- Types ---

export interface QueryInput {
  episodeId: string
  themeId: string
  snapshotDate: string
  features: Record<string, number>
  curve: number[]
  stage: Stage
}

export interface CorpusEpisode {
  episodeId: string
  themeId: string
  episodeEnd: string | null
  features: Record<string, number>
  curve: number[]
  stage: Stage
  peakDay: number
  totalDays: number
}

export interface RetrievalCandidate {
  episodeId: string
  themeId: string
  rank: number
  retrievalSurface: RetrievalSurface
  similarityScore: number
  featureSim: number | null
  curveSim: number | null
  dtwDistance: number | null
  regimeMatch: boolean
}

interface RetrievalOptions {
  topN: number
}

// --- Helpers ---

const filterObservableCorpus = (
  corpus: CorpusEpisode[],
  snapshotDate: string,
): CorpusEpisode[] =>
  corpus.filter(ep =>
    ep.episodeEnd !== null && ep.episodeEnd <= snapshotDate,
  )

const euclideanSimilarity = (a: Record<string, number>, b: Record<string, number>): number => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  let sumSq = 0
  for (const key of keys) {
    const diff = (a[key] ?? 0) - (b[key] ?? 0)
    sumSq += diff * diff
  }
  const dist = Math.sqrt(sumSq)
  // Convert distance to [0,1] similarity
  return 1 / (1 + dist)
}

const cosineSim = (a: number[], b: number[]): number => {
  if (a.length === 0 || b.length === 0) return 0
  const minLen = Math.min(a.length, b.length)
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < minLen; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  if (denom === 0) return 0
  // Clamp to [0, 1] (curves are non-negative)
  return Math.max(0, Math.min(1, dot / denom))
}

const rankCandidates = (
  scored: { episode: CorpusEpisode; score: number; featureSim: number | null; curveSim: number | null; dtwDist: number | null; regimeMatch: boolean }[],
  surface: RetrievalSurface,
  topN: number,
): RetrievalCandidate[] =>
  scored
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .map((item, i) => ({
      episodeId: item.episode.episodeId,
      themeId: item.episode.themeId,
      rank: i + 1,
      retrievalSurface: surface,
      similarityScore: Math.max(0, Math.min(1, item.score)),
      featureSim: item.featureSim,
      curveSim: item.curveSim,
      dtwDistance: item.dtwDist,
      regimeMatch: item.regimeMatch,
    }))

// --- Retrieval Surface 1: Price-Volume kNN ---

export const retrievePriceVolumeKnn = (
  query: QueryInput,
  corpus: CorpusEpisode[],
  options: RetrievalOptions,
): RetrievalCandidate[] => {
  const observable = filterObservableCorpus(corpus, query.snapshotDate)
  if (observable.length === 0) return []

  const scored = observable.map(ep => ({
    episode: ep,
    score: euclideanSimilarity(query.features, ep.features),
    featureSim: euclideanSimilarity(query.features, ep.features),
    curveSim: null as number | null,
    dtwDist: null as number | null,
    regimeMatch: query.stage === ep.stage,
  }))

  return rankCandidates(scored, 'price_volume_knn', options.topN)
}

// --- Retrieval Surface 2: DTW Baseline ---

export const retrieveDtwBaseline = (
  query: QueryInput,
  corpus: CorpusEpisode[],
  options: RetrievalOptions,
): RetrievalCandidate[] => {
  if (query.curve.length === 0) return []

  const observable = filterObservableCorpus(corpus, query.snapshotDate)
  if (observable.length === 0) return []

  const scored = observable
    .filter(ep => ep.curve.length > 0)
    .map(ep => {
      const sim = dtwSimilarity(query.curve, ep.curve)
      return {
        episode: ep,
        score: sim,
        featureSim: null as number | null,
        curveSim: sim,
        dtwDist: sim > 0 ? Math.round(-Math.log(sim) * 1000) / 1000 : null,
        regimeMatch: query.stage === ep.stage,
      }
    })

  return rankCandidates(scored, 'dtw_baseline', options.topN)
}

// --- Retrieval Surface 3: Regime-Filtered NN ---

export const retrieveRegimeFilteredNn = (
  query: QueryInput,
  corpus: CorpusEpisode[],
  options: RetrievalOptions,
): RetrievalCandidate[] => {
  const observable = filterObservableCorpus(corpus, query.snapshotDate)

  // Filter to same stage/regime
  const sameRegime = observable.filter(ep => ep.stage === query.stage)
  if (sameRegime.length === 0) return []

  // Combined: 0.5 feature + 0.5 curve
  const scored = sameRegime.map(ep => {
    const featSim = euclideanSimilarity(query.features, ep.features)
    const curvSim = query.curve.length > 0 && ep.curve.length > 0
      ? cosineSim(query.curve, ep.curve)
      : 0

    return {
      episode: ep,
      score: query.curve.length > 0 ? featSim * 0.5 + curvSim * 0.5 : featSim,
      featureSim: featSim,
      curveSim: curvSim,
      dtwDist: null as number | null,
      regimeMatch: true,
    }
  })

  return rankCandidates(scored, 'regime_filtered_nn', options.topN)
}
