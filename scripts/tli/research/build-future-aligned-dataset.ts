/**
 * TCAR-012: Build Future-Aligned Training Dataset and Targets
 *
 * Pure functions for generating pairwise/contrastive training data with
 * future-path-aligned labels. Right-censored rows are explicitly excluded.
 * No DB calls — composable building blocks.
 */

import type { Stage } from '@/lib/tli/types/db'
import { classifyFutureAlignment } from '@/lib/tli/analog/targets'
import type { FutureAlignmentLabel } from '@/lib/tli/analog/targets'

// --- Types ---

interface QuerySnapshotRef {
  episodeId: string
  themeId: string
  snapshotDate: string
  peakDay: number
  totalDays: number
  isCompleted: boolean
  stage: Stage
}

interface CandidateRef {
  episodeId: string
  themeId: string
  peakDay: number
  totalDays: number
  isCompleted: boolean
  similarity: number
}

export interface DatasetInput {
  querySnapshot: QuerySnapshotRef
  candidates: CandidateRef[]
}

export interface FutureAlignedPair {
  queryEpisodeId: string
  queryThemeId: string
  queryStage: Stage
  candidateEpisodeId: string
  candidateThemeId: string
  futureAlignmentLabel: FutureAlignmentLabel
  peakDayGap: number
  totalDaysGap: number
  candidateSimilarity: number
}

export { classifyFutureAlignment }

// --- Pair Builder ---

export const buildFutureAlignedPairs = (input: DatasetInput): FutureAlignedPair[] => {
  // PRD: right-censored rows excluded
  if (!input.querySnapshot.isCompleted) return []

  const completedCandidates = input.candidates.filter(c => c.isCompleted)

  return completedCandidates.map(candidate => {
    const { label, peakDayGap } = classifyFutureAlignment({
      queryPeakDay: input.querySnapshot.peakDay,
      queryTotalDays: input.querySnapshot.totalDays,
      candidatePeakDay: candidate.peakDay,
      candidateTotalDays: candidate.totalDays,
    })

    return {
      queryEpisodeId: input.querySnapshot.episodeId,
      queryThemeId: input.querySnapshot.themeId,
      queryStage: input.querySnapshot.stage,
      candidateEpisodeId: candidate.episodeId,
      candidateThemeId: candidate.themeId,
      futureAlignmentLabel: label,
      peakDayGap,
      totalDaysGap: Math.abs(input.querySnapshot.totalDays - candidate.totalDays),
      candidateSimilarity: candidate.similarity,
    }
  })
}

// --- Dataset Lineage ---

export interface DatasetLineage {
  totalInputCandidates: number
  rightCensoredQueryExcluded: boolean
  rightCensoredCandidatesExcluded: number
  totalPairs: number
  positiveCount: number
  negativeCount: number
  ambiguousCount: number
  generatedAt: string
}

export const buildDatasetLineage = (input: DatasetInput, pairs: FutureAlignedPair[]): DatasetLineage => {
  const rightCensoredCandidates = input.candidates.filter(c => !c.isCompleted).length
  return {
    totalInputCandidates: input.candidates.length,
    rightCensoredQueryExcluded: !input.querySnapshot.isCompleted,
    rightCensoredCandidatesExcluded: rightCensoredCandidates,
    totalPairs: pairs.length,
    positiveCount: pairs.filter(p => p.futureAlignmentLabel === 'positive').length,
    negativeCount: pairs.filter(p => p.futureAlignmentLabel === 'negative').length,
    ambiguousCount: pairs.filter(p => p.futureAlignmentLabel === 'ambiguous').length,
    generatedAt: new Date().toISOString(),
  }
}
