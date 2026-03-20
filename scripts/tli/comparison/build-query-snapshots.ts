/**
 * TCAR-007: Build Query Snapshot and Label Tables
 *
 * Pure functions for building point-in-time query snapshots and label rows
 * from episode data + lifecycle scores. No DB calls.
 */

import type { BoundarySource, PolicyVersionSet, ReconstructionStatus } from '@/lib/tli/analog/types'
import type { Stage } from '@/lib/tli/types/db'
import {
  buildIneligibilityReason,
  isPromotionEligible,
} from '@/lib/tli/promotion-eligibility'

export interface SnapshotInput {
  episodeId: string
  themeId: string
  snapshotDate: string
  sourceDataCutoff: string
  episodeStart: string
  lifecycleScore: number
  stage: Stage
  features: Record<string, number>
  policyVersions: PolicyVersionSet
  reconstructionStatus?: ReconstructionStatus
  reconstructionReason?: string
}

export interface LabelInput {
  episodeId: string
  themeId: string
  boundarySource: BoundarySource
  sourceDataCutoff: string
  isCompleted: boolean
  peakDate: string | null
  peakScore: number | null
  daysToPeak: number | null
  postPeakDrawdown10d: number | null
  postPeakDrawdown20d: number | null
  stageAtPeak: Stage | null
  hasAuditPass?: boolean
  policyVersions: PolicyVersionSet
}

interface QuerySnapshotOutput {
  episode_id: string
  theme_id: string
  snapshot_date: string
  source_data_cutoff: string
  features: Record<string, number>
  lifecycle_score: number
  stage: Stage
  days_since_episode_start: number
  policy_versions: PolicyVersionSet
  reconstruction_status: ReconstructionStatus
  reconstruction_reason: string | null
}

interface LabelRowOutput {
  episode_id: string
  theme_id: string
  boundary_source: BoundarySource
  source_data_cutoff: string
  is_completed: boolean
  peak_date: string | null
  peak_score: number | null
  days_to_peak: number | null
  post_peak_drawdown_10d: number | null
  post_peak_drawdown_20d: number | null
  stage_at_peak: Stage | null
  is_promotion_eligible: boolean
  promotion_ineligible_reason: string | null
  policy_versions: PolicyVersionSet
}

const daysBetween = (from: string, to: string): number => {
  const msPerDay = 86400000
  return Math.floor((new Date(to).getTime() - new Date(from).getTime()) / msPerDay)
}

export const buildQuerySnapshot = (input: SnapshotInput): QuerySnapshotOutput => {
  if (input.sourceDataCutoff > input.snapshotDate) {
    return {
      episode_id: input.episodeId,
      theme_id: input.themeId,
      snapshot_date: input.snapshotDate,
      source_data_cutoff: input.sourceDataCutoff,
      features: input.features,
      lifecycle_score: input.lifecycleScore,
      stage: input.stage,
      days_since_episode_start: daysBetween(input.episodeStart, input.snapshotDate),
      policy_versions: input.policyVersions,
      reconstruction_status: 'failed',
      reconstruction_reason: 'source_data_cutoff_after_snapshot_date',
    }
  }

  return {
    episode_id: input.episodeId,
    theme_id: input.themeId,
    snapshot_date: input.snapshotDate,
    source_data_cutoff: input.sourceDataCutoff,
    features: input.features,
    lifecycle_score: input.lifecycleScore,
    stage: input.stage,
    days_since_episode_start: daysBetween(input.episodeStart, input.snapshotDate),
    policy_versions: input.policyVersions,
    reconstruction_status: input.reconstructionStatus ?? 'success',
    reconstruction_reason: input.reconstructionReason ?? null,
  }
}

export const buildLabelRow = (input: LabelInput): LabelRowOutput => {
  const hasAuditPass = input.hasAuditPass ?? false
  const eligible = isPromotionEligible({
    boundarySource: input.boundarySource,
    isCompleted: input.isCompleted,
    hasAuditPass,
  })
  const reason = buildIneligibilityReason({
    boundarySource: input.boundarySource,
    isCompleted: input.isCompleted,
    hasAuditPass,
  })

  return {
    episode_id: input.episodeId,
    theme_id: input.themeId,
    boundary_source: input.boundarySource,
    source_data_cutoff: input.sourceDataCutoff,
    is_completed: input.isCompleted,
    peak_date: input.peakDate,
    peak_score: input.peakScore,
    days_to_peak: input.daysToPeak,
    post_peak_drawdown_10d: input.postPeakDrawdown10d,
    post_peak_drawdown_20d: input.postPeakDrawdown20d,
    stage_at_peak: input.stageAtPeak,
    is_promotion_eligible: eligible,
    promotion_ineligible_reason: reason,
    policy_versions: input.policyVersions,
  }
}

export const classifyReconstructionStatus = (input: {
  hasInterest: boolean
  hasNews: boolean
  hasScore: boolean
}): { status: ReconstructionStatus; reason: string | null } => {
  if (!input.hasScore) {
    const missing = ['score']
    if (!input.hasInterest) missing.push('interest')
    if (!input.hasNews) missing.push('news')
    return { status: 'failed', reason: `missing: ${missing.join(', ')}` }
  }

  const missingFeatures: string[] = []
  if (!input.hasInterest) missingFeatures.push('interest')
  if (!input.hasNews) missingFeatures.push('news')

  if (missingFeatures.length > 0) {
    return { status: 'partial', reason: `missing: ${missingFeatures.join(', ')}` }
  }

  return { status: 'success', reason: null }
}
