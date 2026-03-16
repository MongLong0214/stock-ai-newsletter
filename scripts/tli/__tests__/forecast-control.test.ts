import { describe, expect, it } from 'vitest'
import {
  buildForecastControlRecord,
  validateServingStatusTransition,
  buildRollbackDrillPatch,
  checkCutoverEligibility,
  runRollbackDrill,
  detectFailOpen,
  evaluateCutoverReadiness,
} from '../forecast-control'
import { GATE_THRESHOLDS } from '../../../lib/tli/forecast/types'
import type { ForecastControlRow } from '../../../lib/tli/types/bridge-schema'

const makeControlRow = (overrides: Partial<ForecastControlRow> = {}): ForecastControlRow => ({
  id: 'ctrl-001',
  artifact_version: 'forecast_control_v1',
  production_version: '1.0',
  serving_status: 'shadow',
  cutover_ready: false,
  rollback_target_version: null,
  rollback_drill_count: 0,
  rollback_drill_last_success: null,
  fail_closed_verified: false,
  ship_verdict_artifact_id: null,
  policy_versions: {},
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
})

describe('TCAR-002: forecast control helpers', () => {
  describe('buildForecastControlRecord', () => {
    it('returns a record with correct defaults', () => {
      const record = buildForecastControlRecord({
        productionVersion: '1.0',
        policyVersions: { episode_policy_version: '1.0' },
      })
      expect(record.artifact_version).toBe('forecast_control_v1')
      expect(record.production_version).toBe('1.0')
      expect(record.serving_status).toBe('shadow')
      expect(record.cutover_ready).toBe(false)
      expect(record.rollback_drill_count).toBe(0)
      expect(record.fail_closed_verified).toBe(false)
    })

    it('includes policy_versions from input', () => {
      const pv = { episode_policy_version: '2.0', label_policy_version: '1.0' }
      const record = buildForecastControlRecord({
        productionVersion: '1.0',
        policyVersions: pv,
      })
      expect(record.policy_versions).toEqual(pv)
    })
  })

  describe('validateServingStatusTransition', () => {
    it('allows shadow → production', () => {
      expect(validateServingStatusTransition('shadow', 'production')).toBe(true)
    })

    it('allows shadow → canary', () => {
      expect(validateServingStatusTransition('shadow', 'canary')).toBe(true)
    })

    it('allows shadow → rolled_back', () => {
      expect(validateServingStatusTransition('shadow', 'rolled_back')).toBe(true)
    })

    it('allows shadow → disabled', () => {
      expect(validateServingStatusTransition('shadow', 'disabled')).toBe(true)
    })

    it('allows canary → production', () => {
      expect(validateServingStatusTransition('canary', 'production')).toBe(true)
    })

    it('allows canary → rolled_back', () => {
      expect(validateServingStatusTransition('canary', 'rolled_back')).toBe(true)
    })

    it('allows canary → disabled', () => {
      expect(validateServingStatusTransition('canary', 'disabled')).toBe(true)
    })

    it('allows production → rolled_back', () => {
      expect(validateServingStatusTransition('production', 'rolled_back')).toBe(true)
    })

    it('allows production → disabled', () => {
      expect(validateServingStatusTransition('production', 'disabled')).toBe(true)
    })

    it('disallows production → shadow', () => {
      expect(validateServingStatusTransition('production', 'shadow')).toBe(false)
    })

    it('disallows production → canary', () => {
      expect(validateServingStatusTransition('production', 'canary')).toBe(false)
    })

    it('allows rolled_back → shadow (re-attempt)', () => {
      expect(validateServingStatusTransition('rolled_back', 'shadow')).toBe(true)
    })

    it('allows rolled_back → disabled (emergency off)', () => {
      expect(validateServingStatusTransition('rolled_back', 'disabled')).toBe(true)
    })

    it('disallows rolled_back → production', () => {
      expect(validateServingStatusTransition('rolled_back', 'production')).toBe(false)
    })

    it('disallows rolled_back → canary', () => {
      expect(validateServingStatusTransition('rolled_back', 'canary')).toBe(false)
    })

    it('disallows canary → shadow (no backwards)', () => {
      expect(validateServingStatusTransition('canary', 'shadow')).toBe(false)
    })

    it('disallows disabled → any other state (terminal)', () => {
      expect(validateServingStatusTransition('disabled', 'shadow')).toBe(false)
      expect(validateServingStatusTransition('disabled', 'canary')).toBe(false)
      expect(validateServingStatusTransition('disabled', 'production')).toBe(false)
      expect(validateServingStatusTransition('disabled', 'rolled_back')).toBe(false)
    })

    it('allows same-state transition (no-op)', () => {
      expect(validateServingStatusTransition('shadow', 'shadow')).toBe(true)
      expect(validateServingStatusTransition('canary', 'canary')).toBe(true)
      expect(validateServingStatusTransition('production', 'production')).toBe(true)
      expect(validateServingStatusTransition('rolled_back', 'rolled_back')).toBe(true)
      expect(validateServingStatusTransition('disabled', 'disabled')).toBe(true)
    })
  })

  describe('buildRollbackDrillPatch', () => {
    it('increments drill count and sets last success on success', () => {
      const row = makeControlRow({ rollback_drill_count: 1 })
      const patch = buildRollbackDrillPatch(row, true)
      expect(patch.rollback_drill_count).toBe(2)
      expect(patch.rollback_drill_last_success).toBeDefined()
    })

    it('does NOT increment drill count on failure (success-only counting)', () => {
      const row = makeControlRow({ rollback_drill_count: 0 })
      const patch = buildRollbackDrillPatch(row, false)
      expect(patch.rollback_drill_count).toBe(0)
      expect(patch.rollback_drill_last_success).toBeUndefined()
    })

    it('prevents cutover with 1 success + 1 failure (requires 2 successes)', () => {
      // Simulate: drill 1 succeeds, drill 2 fails
      const afterSuccess = makeControlRow({ rollback_drill_count: 0 })
      const successPatch = buildRollbackDrillPatch(afterSuccess, true)
      expect(successPatch.rollback_drill_count).toBe(1)

      const afterOneSuccess = makeControlRow({ rollback_drill_count: successPatch.rollback_drill_count })
      const failPatch = buildRollbackDrillPatch(afterOneSuccess, false)
      // Count stays at 1 — not enough for cutover (needs 2)
      expect(failPatch.rollback_drill_count).toBe(1)

      const eligibility = checkCutoverEligibility(makeControlRow({
        rollback_drill_count: failPatch.rollback_drill_count,
        rollback_drill_last_success: '2026-01-01T00:00:00Z',
        fail_closed_verified: true,
        serving_status: 'shadow',
      }))
      expect(eligibility.eligible).toBe(false)
      expect(eligibility.reasons).toContain('rollback_drill_count_insufficient')
    })
  })

  describe('checkCutoverEligibility', () => {
    it('returns eligible when all conditions met', () => {
      const row = makeControlRow({
        rollback_drill_count: 2,
        rollback_drill_last_success: '2026-01-01T00:00:00Z',
        fail_closed_verified: true,
        serving_status: 'shadow',
        rollback_target_version: '1.0',
      })
      const result = checkCutoverEligibility(row)
      expect(result.eligible).toBe(true)
      expect(result.reasons).toHaveLength(0)
    })

    it('returns ineligible when drill count too low', () => {
      const row = makeControlRow({
        rollback_drill_count: 1,
        fail_closed_verified: true,
        serving_status: 'shadow',
      })
      const result = checkCutoverEligibility(row)
      expect(result.eligible).toBe(false)
      expect(result.reasons).toContain('rollback_drill_count_insufficient')
    })

    it('returns ineligible when fail_closed not verified', () => {
      const row = makeControlRow({
        rollback_drill_count: 2,
        fail_closed_verified: false,
        serving_status: 'shadow',
      })
      const result = checkCutoverEligibility(row)
      expect(result.eligible).toBe(false)
      expect(result.reasons).toContain('fail_closed_not_verified')
    })

    it('returns ineligible when already rolled_back', () => {
      const row = makeControlRow({
        rollback_drill_count: 3,
        fail_closed_verified: true,
        serving_status: 'rolled_back',
      })
      const result = checkCutoverEligibility(row)
      expect(result.eligible).toBe(false)
      expect(result.reasons).toContain('invalid_serving_status')
    })

    it('returns ineligible from production status (already cut over)', () => {
      const row = makeControlRow({
        rollback_drill_count: 2,
        fail_closed_verified: true,
        serving_status: 'production',
      })
      const result = checkCutoverEligibility(row)
      expect(result.eligible).toBe(false)
      expect(result.reasons).toContain('invalid_serving_status')
    })

    it('returns ineligible when no drill has succeeded', () => {
      const row = makeControlRow({
        rollback_drill_count: 2,
        rollback_drill_last_success: null,
        fail_closed_verified: true,
        serving_status: 'shadow',
      })
      const result = checkCutoverEligibility(row)
      expect(result.eligible).toBe(false)
      expect(result.reasons).toContain('no_successful_drill')
    })

    it('returns ineligible when rollback target is blank despite drills and fail-closed verification', () => {
      const row = makeControlRow({
        rollback_drill_count: 2,
        rollback_drill_last_success: '2026-01-01T00:00:00Z',
        fail_closed_verified: true,
        serving_status: 'shadow',
        rollback_target_version: '   ',
      })
      const result = checkCutoverEligibility(row)
      expect(result.eligible).toBe(false)
      expect(result.reasons).toContain('no_rollback_target')
    })

    it('allows cutover from canary status (pre-production)', () => {
      const row = makeControlRow({
        rollback_drill_count: 2,
        rollback_drill_last_success: '2026-01-01T00:00:00Z',
        fail_closed_verified: true,
        serving_status: 'canary',
        rollback_target_version: '1.0',
      })
      const result = checkCutoverEligibility(row)
      expect(result.eligible).toBe(true)
    })

    it('accumulates multiple failure reasons', () => {
      const row = makeControlRow({
        rollback_drill_count: 0,
        fail_closed_verified: false,
        serving_status: 'rolled_back',
      })
      const result = checkCutoverEligibility(row)
      expect(result.eligible).toBe(false)
      expect(result.reasons.length).toBeGreaterThanOrEqual(3)
    })

    it('uses GATE_THRESHOLDS.bridge constants', () => {
      expect(GATE_THRESHOLDS.bridge.rollbackDrillsBeforeCutover).toBe(2)
      expect(GATE_THRESHOLDS.bridge.consecutivePassesForCutover).toBe(4)
    })
  })

  // ============================================================
  // TCAR-004: runRollbackDrill
  // ============================================================
  describe('runRollbackDrill', () => {
    it('succeeds with valid rollback target', () => {
      const row = makeControlRow({
        rollback_drill_count: 1,
        production_version: '2.0',
        rollback_target_version: '1.0',
      })
      const result = runRollbackDrill(row)
      expect(result.success).toBe(true)
      expect(result.drillNumber).toBe(2)
      expect(result.patch.rollback_drill_count).toBe(2)
      expect(result.evidence.from_version).toBe('2.0')
      expect(result.evidence.rollback_target).toBe('1.0')
      expect(result.evidence.drill_number).toBe(2)
    })

    it('fails when rollback_target_version is null', () => {
      const row = makeControlRow({
        rollback_drill_count: 0,
        rollback_target_version: null,
      })
      const result = runRollbackDrill(row)
      expect(result.success).toBe(false)
      expect(result.reason).toBe('no_rollback_target')
    })

    it('fails when rollback_target_version is empty string', () => {
      const row = makeControlRow({
        rollback_drill_count: 0,
        rollback_target_version: '',
      })
      const result = runRollbackDrill(row)
      expect(result.success).toBe(false)
      expect(result.reason).toBe('no_rollback_target')
    })

    it('fails when rollback_target_version is whitespace only', () => {
      const row = makeControlRow({
        rollback_drill_count: 0,
        rollback_target_version: '  ',
      })
      const result = runRollbackDrill(row)
      expect(result.success).toBe(false)
      expect(result.reason).toBe('no_rollback_target')
    })

    it('increments drill number from current count', () => {
      const row = makeControlRow({
        rollback_drill_count: 5,
        rollback_target_version: '1.0',
      })
      const result = runRollbackDrill(row)
      expect(result.drillNumber).toBe(6)
    })

    it('evidence contains a timestamp', () => {
      const row = makeControlRow({ rollback_target_version: '1.0' })
      const result = runRollbackDrill(row)
      expect(result.evidence.timestamp).toBeDefined()
      expect(typeof result.evidence.timestamp).toBe('string')
    })
  })

  // ============================================================
  // TCAR-004: detectFailOpen
  // ============================================================
  describe('detectFailOpen', () => {
    it('returns no fail-open for clean shadow control', () => {
      const row = makeControlRow({
        serving_status: 'shadow',
        fail_closed_verified: true,
        cutover_ready: false,
        rollback_drill_count: 2,
        rollback_target_version: '1.0',
      })
      const result = detectFailOpen(row)
      expect(result.failOpenDetected).toBe(false)
      expect(result.reasons).toHaveLength(0)
    })

    it('detects production without fail_closed', () => {
      const row = makeControlRow({
        serving_status: 'production',
        fail_closed_verified: false,
        rollback_target_version: '1.0',
      })
      const result = detectFailOpen(row)
      expect(result.failOpenDetected).toBe(true)
      expect(result.reasons).toContain('serving_without_fail_closed')
    })

    it('detects cutover_ready without drills', () => {
      const row = makeControlRow({
        cutover_ready: true,
        rollback_drill_count: 1,
        fail_closed_verified: true,
        rollback_target_version: '1.0',
      })
      const result = detectFailOpen(row)
      expect(result.failOpenDetected).toBe(true)
      expect(result.reasons).toContain('cutover_ready_without_drills')
    })

    it('detects cutover_ready without fail_closed', () => {
      const row = makeControlRow({
        cutover_ready: true,
        rollback_drill_count: 3,
        fail_closed_verified: false,
        rollback_target_version: '1.0',
      })
      const result = detectFailOpen(row)
      expect(result.failOpenDetected).toBe(true)
      expect(result.reasons).toContain('cutover_ready_without_fail_closed')
    })

    it('detects production without rollback_target', () => {
      const row = makeControlRow({
        serving_status: 'production',
        fail_closed_verified: true,
        rollback_target_version: null,
      })
      const result = detectFailOpen(row)
      expect(result.failOpenDetected).toBe(true)
      expect(result.reasons).toContain('serving_without_rollback_target')
    })

    it('detects canary without rollback_target', () => {
      const row = makeControlRow({
        serving_status: 'canary',
        fail_closed_verified: true,
        rollback_target_version: null,
      })
      const result = detectFailOpen(row)
      expect(result.failOpenDetected).toBe(true)
      expect(result.reasons).toContain('serving_without_rollback_target')
    })

    it('detects canary with blank rollback_target', () => {
      const row = makeControlRow({
        serving_status: 'canary',
        fail_closed_verified: true,
        rollback_target_version: ' ',
      })
      const result = detectFailOpen(row)
      expect(result.failOpenDetected).toBe(true)
      expect(result.reasons).toContain('serving_without_rollback_target')
    })

    it('accumulates multiple violations', () => {
      const row = makeControlRow({
        serving_status: 'production',
        fail_closed_verified: false,
        cutover_ready: true,
        rollback_drill_count: 0,
        rollback_target_version: null,
      })
      const result = detectFailOpen(row)
      expect(result.failOpenDetected).toBe(true)
      expect(result.reasons.length).toBeGreaterThanOrEqual(3)
    })

    it('returns no fail-open for shadow with all verified', () => {
      const row = makeControlRow({
        serving_status: 'shadow',
        fail_closed_verified: true,
        cutover_ready: false,
        rollback_drill_count: 3,
        rollback_target_version: '1.0',
      })
      const result = detectFailOpen(row)
      expect(result.failOpenDetected).toBe(false)
    })
  })

  // ============================================================
  // TCAR-004: evaluateCutoverReadiness
  // ============================================================
  describe('evaluateCutoverReadiness', () => {
    it('returns ready when all conditions met', () => {
      const row = makeControlRow({
        serving_status: 'shadow',
        rollback_drill_count: 2,
        rollback_drill_last_success: '2026-01-01T00:00:00Z',
        fail_closed_verified: true,
        cutover_ready: false,
        rollback_target_version: '1.0',
      })
      const result = evaluateCutoverReadiness(row)
      expect(result.ready).toBe(true)
      expect(result.eligible).toBe(true)
      expect(result.failOpenDetected).toBe(false)
      expect(result.drillsComplete).toBe(true)
      expect(result.failClosedVerified).toBe(true)
      expect(result.reasons).toHaveLength(0)
    })

    it('returns not ready when eligible but fail-open detected', () => {
      const row = makeControlRow({
        serving_status: 'canary',
        rollback_drill_count: 2,
        rollback_drill_last_success: '2026-01-01T00:00:00Z',
        fail_closed_verified: true,
        cutover_ready: true,
        rollback_target_version: null,
      })
      const result = evaluateCutoverReadiness(row)
      expect(result.eligible).toBe(false)
      expect(result.failOpenDetected).toBe(true)
      expect(result.reasons).toContain('no_rollback_target')
      expect(result.reasons).toContain('serving_without_rollback_target')
      expect(result.ready).toBe(false)
    })

    it('returns not ready when not eligible', () => {
      const row = makeControlRow({
        serving_status: 'shadow',
        rollback_drill_count: 0,
        fail_closed_verified: false,
      })
      const result = evaluateCutoverReadiness(row)
      expect(result.ready).toBe(false)
      expect(result.eligible).toBe(false)
      expect(result.drillsComplete).toBe(false)
      expect(result.failClosedVerified).toBe(false)
    })

    it('accumulates reasons from both eligibility and fail-open', () => {
      const row = makeControlRow({
        serving_status: 'production',
        rollback_drill_count: 0,
        fail_closed_verified: false,
        cutover_ready: true,
        rollback_target_version: null,
      })
      const result = evaluateCutoverReadiness(row)
      expect(result.ready).toBe(false)
      expect(result.reasons.length).toBeGreaterThanOrEqual(2)
    })

    it('drillsComplete reflects GATE_THRESHOLDS', () => {
      const row = makeControlRow({
        serving_status: 'shadow',
        rollback_drill_count: GATE_THRESHOLDS.bridge.rollbackDrillsBeforeCutover,
        fail_closed_verified: true,
      })
      const result = evaluateCutoverReadiness(row)
      expect(result.drillsComplete).toBe(true)
    })

    it('drillsComplete is false below threshold', () => {
      const row = makeControlRow({
        serving_status: 'shadow',
        rollback_drill_count: GATE_THRESHOLDS.bridge.rollbackDrillsBeforeCutover - 1,
        fail_closed_verified: true,
      })
      const result = evaluateCutoverReadiness(row)
      expect(result.drillsComplete).toBe(false)
    })
  })
})
