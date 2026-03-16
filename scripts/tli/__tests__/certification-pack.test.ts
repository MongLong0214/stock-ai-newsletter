/**
 * TCAR-020: Runbooks and Enterprise Certification Pack
 *
 * TDD tests for certification pack validator and template generators.
 * Validates that certification artifacts are reproducible and reference
 * the correct numeric gate thresholds.
 */

import { describe, expect, it } from 'vitest'
import {
  validateCertificationPack,
  buildRunbookChecklist,
  buildShipMemo,
  type CertificationPackInput,
  type RunbookChecklist,
  type ShipMemo,
} from '../certification-pack'
import { GATE_THRESHOLDS } from '../../../lib/tli/forecast/types'

// --- Test helpers ---

const makePassingPack = (overrides: Partial<CertificationPackInput> = {}): CertificationPackInput => ({
  bridgeCertification: { allPassed: true, consecutivePasses: 4 },
  retrievalGate: { passed: true },
  forecastShipGate: { cutoverRecommended: true, failedCriteria: [] },
  rollbackDrills: { count: 2, allSucceeded: true },
  labelAudit: { overlappingEpisodes: 0, inferredBoundaryRatio: 0.08, inferredBoundarySliceRatio: 0.05, rightCensoredAsNegatives: 0, futureInformedBoundaryChanges: 0 },
  ...overrides,
})

describe('TCAR-020: validateCertificationPack', () => {
  it('validates a complete passing pack', () => {
    const result = validateCertificationPack(makePassingPack())

    expect(result.valid).toBe(true)
    expect(result.missingItems).toHaveLength(0)
  })

  it('fails when bridge certification not passed', () => {
    const result = validateCertificationPack(makePassingPack({
      bridgeCertification: { allPassed: false, consecutivePasses: 2 },
    }))

    expect(result.valid).toBe(false)
    expect(result.missingItems).toContain('bridge_certification')
  })

  it('fails when retrieval gate not passed', () => {
    const result = validateCertificationPack(makePassingPack({
      retrievalGate: { passed: false },
    }))

    expect(result.valid).toBe(false)
    expect(result.missingItems).toContain('retrieval_gate')
  })

  it('fails when forecast ship gate not recommended', () => {
    const result = validateCertificationPack(makePassingPack({
      forecastShipGate: { cutoverRecommended: false, failedCriteria: ['global_ece_too_high'] },
    }))

    expect(result.valid).toBe(false)
    expect(result.missingItems).toContain('forecast_ship_gate')
  })

  it('fails when rollback drills insufficient', () => {
    const result = validateCertificationPack(makePassingPack({
      rollbackDrills: { count: 1, allSucceeded: true },
    }))

    expect(result.valid).toBe(false)
    expect(result.missingItems).toContain('rollback_drills')
  })

  it('fails when label audit has overlapping episodes', () => {
    const result = validateCertificationPack(makePassingPack({
      labelAudit: { overlappingEpisodes: 1, inferredBoundaryRatio: 0.08, inferredBoundarySliceRatio: 0.05, rightCensoredAsNegatives: 0, futureInformedBoundaryChanges: 0 },
    }))

    expect(result.valid).toBe(false)
    expect(result.missingItems).toContain('label_audit')
  })

  it('fails when inferred boundary slice ratio exceeds ceiling', () => {
    const result = validateCertificationPack(makePassingPack({
      labelAudit: { overlappingEpisodes: 0, inferredBoundaryRatio: 0.08, inferredBoundarySliceRatio: 0.15, rightCensoredAsNegatives: 0, futureInformedBoundaryChanges: 0 },
    }))

    expect(result.valid).toBe(false)
    expect(result.missingItems).toContain('label_audit')
  })

  it('fails when future-informed boundary changes > 0', () => {
    const result = validateCertificationPack(makePassingPack({
      labelAudit: { overlappingEpisodes: 0, inferredBoundaryRatio: 0.08, inferredBoundarySliceRatio: 0.05, rightCensoredAsNegatives: 0, futureInformedBoundaryChanges: 1 },
    }))

    expect(result.valid).toBe(false)
    expect(result.missingItems).toContain('label_audit')
  })

  it('reports all failures simultaneously', () => {
    const result = validateCertificationPack({
      bridgeCertification: { allPassed: false, consecutivePasses: 0 },
      retrievalGate: { passed: false },
      forecastShipGate: { cutoverRecommended: false, failedCriteria: ['insufficient_shadow_weeks'] },
      rollbackDrills: { count: 0, allSucceeded: false },
      labelAudit: { overlappingEpisodes: 3, inferredBoundaryRatio: 0.20, inferredBoundarySliceRatio: 0.15, rightCensoredAsNegatives: 2, futureInformedBoundaryChanges: 1 },
    })

    expect(result.valid).toBe(false)
    expect(result.missingItems.length).toBeGreaterThanOrEqual(5)
  })
})

describe('TCAR-020: buildRunbookChecklist', () => {
  it('generates a checklist with all required sections', () => {
    const checklist = buildRunbookChecklist()

    expect(checklist.sections).toContain('phase0_bridge')
    expect(checklist.sections).toContain('rollback_drill')
    expect(checklist.sections).toContain('retrieval_gate')
    expect(checklist.sections).toContain('forecast_ship')
    expect(checklist.sections).toContain('cutover')
    expect(checklist.sections).toContain('rollback_procedure')
  })

  it('references gate thresholds', () => {
    const checklist = buildRunbookChecklist()

    expect(checklist.thresholdReferences.consecutivePassesForCutover)
      .toBe(GATE_THRESHOLDS.bridge.consecutivePassesForCutover)
    expect(checklist.thresholdReferences.rollbackDrillsBeforeCutover)
      .toBe(GATE_THRESHOLDS.bridge.rollbackDrillsBeforeCutover)
  })
})

describe('TCAR-020: buildShipMemo', () => {
  it('generates a memo with gate results', () => {
    const memo = buildShipMemo(makePassingPack())

    expect(memo.recommendation).toBe('approve')
    expect(memo.gateResults).toBeDefined()
    expect(typeof memo.generatedAt).toBe('string')
  })

  it('generates reject recommendation when pack invalid', () => {
    const memo = buildShipMemo(makePassingPack({
      forecastShipGate: { cutoverRecommended: false, failedCriteria: ['global_ece_too_high'] },
    }))

    expect(memo.recommendation).toBe('reject')
  })

  it('includes numeric gate thresholds in memo', () => {
    const memo = buildShipMemo(makePassingPack())

    expect(memo.thresholds).toBeDefined()
    expect(memo.thresholds.globalEceCeiling).toBe(GATE_THRESHOLDS.forecastShip.globalEceCeiling)
  })
})
