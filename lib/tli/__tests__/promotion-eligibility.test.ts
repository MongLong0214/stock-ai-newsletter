/**
 * TCAR-008: Isolate Inferred-Boundary Rows and Promotion Eligibility
 *
 * TDD RED phase — tests for inferred row isolation and promotion filtering.
 */

import { describe, expect, it } from 'vitest'
import {
  isPromotionEligible,
  filterPromotionEligible,
  tagInferredRows,
  buildIneligibilityReason,
  type LabelForPromotion,
} from '../promotion-eligibility'

// --- Test helpers ---

const makeLabel = (overrides: Partial<LabelForPromotion> = {}): LabelForPromotion => ({
  episode_id: 'ep-001',
  theme_id: 'th-001',
  boundary_source: 'observed',
  is_completed: true,
  is_promotion_eligible: true,
  promotion_ineligible_reason: null,
  ...overrides,
})

describe('TCAR-008: isPromotionEligible', () => {
  it('returns true for observed completed episodes', () => {
    expect(isPromotionEligible({
      boundarySource: 'observed',
      isCompleted: true,
      hasAuditPass: false,
    })).toBe(true)
  })

  it('returns false for inferred-v1 without audit pass', () => {
    expect(isPromotionEligible({
      boundarySource: 'inferred-v1',
      isCompleted: true,
      hasAuditPass: false,
    })).toBe(false)
  })

  it('returns true for inferred-v1 WITH audit pass', () => {
    expect(isPromotionEligible({
      boundarySource: 'inferred-v1',
      isCompleted: true,
      hasAuditPass: true,
    })).toBe(true)
  })

  it('returns false for imported without audit pass', () => {
    expect(isPromotionEligible({
      boundarySource: 'imported',
      isCompleted: true,
      hasAuditPass: false,
    })).toBe(false)
  })

  it('returns true for imported WITH audit pass', () => {
    expect(isPromotionEligible({
      boundarySource: 'imported',
      isCompleted: true,
      hasAuditPass: true,
    })).toBe(true)
  })

  it('returns false for incomplete episodes regardless of boundary', () => {
    expect(isPromotionEligible({
      boundarySource: 'observed',
      isCompleted: false,
      hasAuditPass: false,
    })).toBe(false)
  })
})

describe('TCAR-008: buildIneligibilityReason', () => {
  it('returns null for eligible observed episodes', () => {
    expect(buildIneligibilityReason({
      boundarySource: 'observed',
      isCompleted: true,
      hasAuditPass: false,
    })).toBeNull()
  })

  it('returns inferred_boundary_no_audit for inferred without audit', () => {
    expect(buildIneligibilityReason({
      boundarySource: 'inferred-v1',
      isCompleted: true,
      hasAuditPass: false,
    })).toBe('inferred_boundary_no_audit')
  })

  it('returns imported_boundary_no_audit for imported without audit', () => {
    expect(buildIneligibilityReason({
      boundarySource: 'imported',
      isCompleted: true,
      hasAuditPass: false,
    })).toBe('imported_boundary_no_audit')
  })

  it('returns episode_not_completed for incomplete episodes', () => {
    expect(buildIneligibilityReason({
      boundarySource: 'observed',
      isCompleted: false,
      hasAuditPass: false,
    })).toBe('episode_not_completed')
  })

  it('prioritizes not_completed over boundary issues', () => {
    expect(buildIneligibilityReason({
      boundarySource: 'inferred-v1',
      isCompleted: false,
      hasAuditPass: false,
    })).toBe('episode_not_completed')
  })
})

describe('TCAR-008: filterPromotionEligible', () => {
  it('includes only observed completed labels by default', () => {
    const labels: LabelForPromotion[] = [
      makeLabel({ episode_id: 'ep-001', boundary_source: 'observed', is_completed: true }),
      makeLabel({ episode_id: 'ep-002', boundary_source: 'inferred-v1', is_completed: true }),
      makeLabel({ episode_id: 'ep-003', boundary_source: 'imported', is_completed: true }),
    ]

    const result = filterPromotionEligible(labels)

    expect(result).toHaveLength(1)
    expect(result[0].episode_id).toBe('ep-001')
  })

  it('includes audit-passed inferred labels when audit IDs provided', () => {
    const labels: LabelForPromotion[] = [
      makeLabel({ episode_id: 'ep-001', boundary_source: 'observed', is_completed: true }),
      makeLabel({ episode_id: 'ep-002', boundary_source: 'inferred-v1', is_completed: true }),
      makeLabel({ episode_id: 'ep-003', boundary_source: 'inferred-v1', is_completed: true }),
    ]
    const auditPassedEpisodeIds = new Set(['ep-002'])

    const result = filterPromotionEligible(labels, auditPassedEpisodeIds)

    expect(result).toHaveLength(2)
    expect(result.map(r => r.episode_id)).toEqual(['ep-001', 'ep-002'])
  })

  it('excludes incomplete episodes even if observed', () => {
    const labels: LabelForPromotion[] = [
      makeLabel({ episode_id: 'ep-001', boundary_source: 'observed', is_completed: false }),
    ]

    const result = filterPromotionEligible(labels)

    expect(result).toHaveLength(0)
  })

  it('handles empty input', () => {
    expect(filterPromotionEligible([])).toHaveLength(0)
  })
})

describe('TCAR-008: tagInferredRows', () => {
  it('tags inferred-v1 rows with metadata', () => {
    const labels: LabelForPromotion[] = [
      makeLabel({ episode_id: 'ep-001', boundary_source: 'observed' }),
      makeLabel({ episode_id: 'ep-002', boundary_source: 'inferred-v1' }),
      makeLabel({ episode_id: 'ep-003', boundary_source: 'imported' }),
    ]

    const result = tagInferredRows(labels)

    expect(result.inferredCount).toBe(1)
    expect(result.importedCount).toBe(1)
    expect(result.observedCount).toBe(1)
    expect(result.totalCount).toBe(3)
    expect(result.inferredRatio).toBeCloseTo(1 / 3)
    expect(result.inferredEpisodeIds).toEqual(['ep-002'])
    expect(result.importedEpisodeIds).toEqual(['ep-003'])
  })

  it('returns zero ratios for empty input', () => {
    const result = tagInferredRows([])

    expect(result.totalCount).toBe(0)
    expect(result.inferredRatio).toBe(0)
    expect(result.inferredCount).toBe(0)
  })

  it('handles all-observed case', () => {
    const labels: LabelForPromotion[] = [
      makeLabel({ episode_id: 'ep-001', boundary_source: 'observed' }),
      makeLabel({ episode_id: 'ep-002', boundary_source: 'observed' }),
    ]

    const result = tagInferredRows(labels)

    expect(result.inferredCount).toBe(0)
    expect(result.inferredRatio).toBe(0)
  })
})
