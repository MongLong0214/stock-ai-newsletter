/**
 * TCAR-010: Analog Evidence Artifact Writer
 *
 * Pure functions for building analog evidence packages.
 */

import type { EvidenceQuality, PolicyVersionSet } from '@/lib/tli/analog/types'
import type { Stage } from '@/lib/tli/types/db'
import { ABSTENTION_THRESHOLDS } from '@/lib/tli/forecast/types'

export interface EvidenceInput {
  querySnapshotId: string
  queryThemeId: string
  candidateId: string
  candidateEpisodeId: string
  analogFuturePathSummary: {
    peak_day: number
    total_days: number
    final_stage: Stage
    post_peak_drawdown: number | null
  }
  retrievalReason: string
  mismatchSummary: string | null
  analogSupportCount: number
  candidateConcentrationGini: number
  top1AnalogWeight: number
  policyVersions: PolicyVersionSet
}

interface EvidenceOutput {
  query_snapshot_id: string
  query_theme_id: string
  candidate_id: string
  candidate_episode_id: string
  analog_future_path_summary: Record<string, unknown>
  retrieval_reason: string
  mismatch_summary: string | null
  evidence_quality: EvidenceQuality
  evidence_quality_score: number
  analog_support_count: number
  candidate_concentration_gini: number
  top1_analog_weight: number
  policy_versions: PolicyVersionSet
}

export const computeEvidenceQuality = (input: {
  analogSupportCount: number
  candidateConcentrationGini: number
  top1AnalogWeight: number
}): { quality: EvidenceQuality; score: number } => {
  const thresholds = ABSTENTION_THRESHOLDS

  const supportOk = input.analogSupportCount >= thresholds.minAnalogSupport
  const giniOk = input.candidateConcentrationGini <= thresholds.maxCandidateConcentrationGini
  const weightOk = input.top1AnalogWeight <= thresholds.maxTop1AnalogWeight
  const passCount = [supportOk, giniOk, weightOk].filter(Boolean).length

  const supportScore = Math.min(1, input.analogSupportCount / (thresholds.minAnalogSupport * 2))
  const giniScore = Math.max(0, 1 - input.candidateConcentrationGini)
  const weightScore = Math.max(0, 1 - input.top1AnalogWeight)
  const compositeScore = (supportScore * 0.4 + giniScore * 0.3 + weightScore * 0.3)

  let quality: EvidenceQuality
  if (passCount === 3) {
    quality = 'high'
  } else if (passCount >= 2) {
    quality = 'medium'
  } else {
    quality = 'low'
  }

  return {
    quality,
    score: Number.isFinite(compositeScore) ? Math.round(compositeScore * 100) / 100 : 0,
  }
}

export const buildAnalogEvidence = (input: EvidenceInput): EvidenceOutput => {
  const { quality, score } = computeEvidenceQuality({
    analogSupportCount: input.analogSupportCount,
    candidateConcentrationGini: input.candidateConcentrationGini,
    top1AnalogWeight: input.top1AnalogWeight,
  })

  return {
    query_snapshot_id: input.querySnapshotId,
    query_theme_id: input.queryThemeId,
    candidate_id: input.candidateId,
    candidate_episode_id: input.candidateEpisodeId,
    analog_future_path_summary: input.analogFuturePathSummary as Record<string, unknown>,
    retrieval_reason: input.retrievalReason,
    mismatch_summary: input.mismatchSummary,
    evidence_quality: quality,
    evidence_quality_score: score,
    analog_support_count: input.analogSupportCount,
    candidate_concentration_gini: input.candidateConcentrationGini,
    top1_analog_weight: input.top1AnalogWeight,
    policy_versions: input.policyVersions,
  }
}
