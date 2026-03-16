/**
 * TCAR-008: Isolate Inferred-Boundary Rows and Promotion Eligibility
 *
 * Pure functions for filtering, tagging, and determining promotion eligibility
 * of label rows based on boundary source (PRD §10.6).
 *
 * Rules:
 * - observed: promotion-eligible by default
 * - inferred-v1: requires separate audit approval
 * - imported: requires provenance metadata and explicit certification
 * - incomplete episodes: never eligible
 */

import type { BoundarySource } from './analog/types'

// --- Types ---

export interface LabelForPromotion {
  episode_id: string
  theme_id: string
  boundary_source: BoundarySource
  is_completed: boolean
  is_promotion_eligible: boolean
  promotion_ineligible_reason: string | null
}

interface InferredRowStats {
  totalCount: number
  observedCount: number
  inferredCount: number
  importedCount: number
  inferredRatio: number
  inferredEpisodeIds: string[]
  importedEpisodeIds: string[]
}

// --- Promotion Eligibility ---

export const isPromotionEligible = (input: {
  boundarySource: BoundarySource
  isCompleted: boolean
  hasAuditPass: boolean
}): boolean => {
  if (!input.isCompleted) return false

  if (input.boundarySource === 'observed') return true

  // inferred-v1 and imported require audit pass
  return input.hasAuditPass
}

// --- Ineligibility Reason ---

export const buildIneligibilityReason = (input: {
  boundarySource: BoundarySource
  isCompleted: boolean
  hasAuditPass: boolean
}): string | null => {
  // Not completed takes priority
  if (!input.isCompleted) return 'episode_not_completed'

  if (input.boundarySource === 'observed') return null

  if (input.boundarySource === 'inferred-v1' && !input.hasAuditPass) {
    return 'inferred_boundary_no_audit'
  }

  if (input.boundarySource === 'imported' && !input.hasAuditPass) {
    return 'imported_boundary_no_audit'
  }

  return null
}

// --- Filter ---

export const filterPromotionEligible = (
  labels: LabelForPromotion[],
  auditPassedEpisodeIds?: Set<string>,
): LabelForPromotion[] =>
  labels.filter(label =>
    isPromotionEligible({
      boundarySource: label.boundary_source,
      isCompleted: label.is_completed,
      hasAuditPass: auditPassedEpisodeIds?.has(label.episode_id) ?? false,
    }),
  )

// --- Tag / Stats ---

export const tagInferredRows = (labels: LabelForPromotion[]): InferredRowStats => {
  const totalCount = labels.length

  if (totalCount === 0) {
    return {
      totalCount: 0,
      observedCount: 0,
      inferredCount: 0,
      importedCount: 0,
      inferredRatio: 0,
      inferredEpisodeIds: [],
      importedEpisodeIds: [],
    }
  }

  const inferredEpisodeIds: string[] = []
  const importedEpisodeIds: string[] = []
  let observedCount = 0
  let inferredCount = 0
  let importedCount = 0

  for (const label of labels) {
    if (label.boundary_source === 'inferred-v1') {
      inferredCount++
      inferredEpisodeIds.push(label.episode_id)
    } else if (label.boundary_source === 'imported') {
      importedCount++
      importedEpisodeIds.push(label.episode_id)
    } else {
      observedCount++
    }
  }

  return {
    totalCount,
    observedCount,
    inferredCount,
    importedCount,
    inferredRatio: inferredCount / totalCount,
    inferredEpisodeIds,
    importedEpisodeIds,
  }
}
