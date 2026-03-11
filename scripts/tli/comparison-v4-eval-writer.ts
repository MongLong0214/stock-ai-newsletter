/**
 * CMPV4-007: Eval row builder + aggregation + sensitivity analysis
 *
 * Pure functions for building theme_comparison_eval_v2 rows
 * and computing run-level evaluation summaries.
 */

import type { ThemeComparisonEvalV2 } from '../../lib/tli/types/db'
import { COMPARISON_PRIMARY_HORIZON_DAYS } from '../../lib/tli/comparison/spec'

// ── Eval Row Builders ──

export const buildEvalRowV2 = (input: {
  runId: string
  candidateThemeId: string
  evaluationHorizonDays: number
  trajectoryCorrH14: number
  positionStageMatchH14: boolean
  binaryRelevant: boolean
  gradedGain: number
  censoredReason: string | null
  evaluatedAt: string
}): ThemeComparisonEvalV2 => ({
  run_id: input.runId,
  candidate_theme_id: input.candidateThemeId,
  evaluation_horizon_days: input.evaluationHorizonDays,
  trajectory_corr_h14: input.trajectoryCorrH14,
  position_stage_match_h14: input.positionStageMatchH14,
  binary_relevant: input.binaryRelevant,
  graded_gain: input.gradedGain,
  censored_reason: input.censoredReason,
  evaluated_at: input.evaluatedAt,
})

export const buildCensoredEvalRowV2 = (input: {
  runId: string
  candidateThemeId: string
  evaluationHorizonDays: number
  censoredReason: string
  evaluatedAt: string
}): ThemeComparisonEvalV2 => ({
  run_id: input.runId,
  candidate_theme_id: input.candidateThemeId,
  evaluation_horizon_days: input.evaluationHorizonDays,
  trajectory_corr_h14: null,
  position_stage_match_h14: null,
  binary_relevant: false,
  graded_gain: 0,
  censored_reason: input.censoredReason,
  evaluated_at: input.evaluatedAt,
})

// ── Run-Level Summary ──

interface RunEvalSummary {
  totalCandidates: number
  evaluatedCount: number
  censoredCount: number
  relevantCount: number
  precisionAtK: number
  meanGradedGain: number
  censorReasons: Record<string, number>
}

export const aggregateRunEvalSummary = (rows: ThemeComparisonEvalV2[]): RunEvalSummary => {
  const censored = rows.filter((r) => r.censored_reason != null)
  const evaluated = rows.filter((r) => r.censored_reason == null)
  const relevant = evaluated.filter((r) => r.binary_relevant)

  const censorReasons: Record<string, number> = {}
  for (const r of censored) {
    const reason = r.censored_reason!
    censorReasons[reason] = (censorReasons[reason] || 0) + 1
  }

  return {
    totalCandidates: rows.length,
    evaluatedCount: evaluated.length,
    censoredCount: censored.length,
    relevantCount: relevant.length,
    precisionAtK: evaluated.length > 0 ? relevant.length / evaluated.length : 0,
    meanGradedGain: evaluated.length > 0
      ? evaluated.reduce((sum, r) => sum + r.graded_gain, 0) / evaluated.length
      : 0,
    censorReasons,
  }
}

// ── Sensitivity Analysis ──

interface SensitivityRow {
  threshold: number
  matchCount: number
  relevantCount: number
  precision: number
  meanGain: number
}

// ── Censoring Sensitivity Analysis (PRD §6.8) ──

interface CensoringSensitivityView {
  totalSlots: number
  relevantCount: number
  precision: number
  meanGain: number
}

interface PairedDeltaByCensorReason {
  reason: string
  count: number
  conservativePrecision: number
  optimisticPrecision: number
  delta: number
}

interface CensoringSensitivityResult {
  conservative: CensoringSensitivityView
  optimistic: CensoringSensitivityView
  pairedDeltaByCensorReason: PairedDeltaByCensorReason[]
}

export const buildCensoringSensitivity = (
  rows: ThemeComparisonEvalV2[],
): CensoringSensitivityResult => {
  const censored = rows.filter((r) => r.censored_reason != null)
  const evaluated = rows.filter((r) => r.censored_reason == null)

  // Conservative: all candidates counted, censored = gain 0, binary_relevant = false
  const conservativeRelevant = evaluated.filter((r) => r.binary_relevant).length
  const conservativeTotal = rows.length
  const conservativePrecision = conservativeTotal > 0 ? conservativeRelevant / conservativeTotal : 0
  const conservativeMeanGain = conservativeTotal > 0
    ? rows.reduce((sum, r) => sum + (r.censored_reason != null ? 0 : r.graded_gain), 0) / conservativeTotal
    : 0

  // Optimistic: censored candidates excluded
  const optimisticRelevant = evaluated.filter((r) => r.binary_relevant).length
  const optimisticTotal = evaluated.length
  const optimisticPrecision = optimisticTotal > 0 ? optimisticRelevant / optimisticTotal : 0
  const optimisticMeanGain = optimisticTotal > 0
    ? evaluated.reduce((sum, r) => sum + r.graded_gain, 0) / optimisticTotal
    : 0

  // Paired delta by censor reason
  const reasonCounts: Record<string, number> = {}
  for (const r of censored) {
    const reason = r.censored_reason!
    reasonCounts[reason] = (reasonCounts[reason] || 0) + 1
  }

  const pairedDeltaByCensorReason: PairedDeltaByCensorReason[] = Object.entries(reasonCounts).map(
    ([reason, count]) => {
      // For each reason: compute precision without those censored candidates vs with them as gain 0
      const withoutThisReason = rows.filter((r) => r.censored_reason !== reason)
      const withoutEvaluated = withoutThisReason.filter((r) => r.censored_reason == null)
      const withoutRelevant = withoutEvaluated.filter((r) => r.binary_relevant).length
      const optPrec = withoutEvaluated.length > 0 ? withoutRelevant / withoutEvaluated.length : 0
      const consPrec = withoutThisReason.length > 0 ? withoutRelevant / withoutThisReason.length : 0

      return {
        reason,
        count,
        conservativePrecision: consPrec,
        optimisticPrecision: optPrec,
        delta: optPrec - consPrec,
      }
    },
  )

  return {
    conservative: {
      totalSlots: conservativeTotal,
      relevantCount: conservativeRelevant,
      precision: conservativePrecision,
      meanGain: conservativeMeanGain,
    },
    optimistic: {
      totalSlots: optimisticTotal,
      relevantCount: optimisticRelevant,
      precision: optimisticPrecision,
      meanGain: optimisticMeanGain,
    },
    pairedDeltaByCensorReason,
  }
}

// ── Threshold Sensitivity Analysis ──

export const buildSensitivityAnalysisRows = (input: {
  evalRows: ThemeComparisonEvalV2[]
  candidateSimilarities: Map<string, number>
  thresholds: number[]
}): SensitivityRow[] => {
  return input.thresholds.map((threshold) => {
    // Filter candidates that would pass this threshold
    const passing = input.evalRows.filter((row) => {
      const sim = input.candidateSimilarities.get(row.candidate_theme_id)
      return sim != null && sim >= threshold
    })

    const evaluated = passing.filter((r) => r.censored_reason == null)
    const relevant = evaluated.filter((r) => r.binary_relevant)

    return {
      threshold,
      matchCount: passing.length,
      relevantCount: relevant.length,
      precision: evaluated.length > 0 ? relevant.length / evaluated.length : 0,
      meanGain: evaluated.length > 0
        ? evaluated.reduce((sum, r) => sum + r.graded_gain, 0) / evaluated.length
        : 0,
    }
  })
}
