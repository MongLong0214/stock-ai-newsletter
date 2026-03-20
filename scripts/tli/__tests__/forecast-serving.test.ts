/**
 * TCAR-018: Forecast Control Plane and Fail-Closed Serving Reader
 *
 * TDD RED phase — tests for serving reader, ship verdict writer, fail-closed policy.
 */

import { describe, expect, it } from 'vitest'
import {
  readServingVersion,
  resolveShipVerdictCutoverReady,
  writeShipVerdictToControl,
  isServingAllowed,
  loadRollbackTarget,
  type ControlPlaneState,
} from '@/scripts/tli/comparison/forecast-serving'

// --- Test helpers ---

const makeControlState = (overrides: Partial<ControlPlaneState> = {}): ControlPlaneState => ({
  productionVersion: '2.0',
  servingStatus: 'shadow',
  cutoverReady: false,
  rollbackTargetVersion: '1.0',
  failClosedVerified: true,
  shipVerdictArtifactId: null,
  ...overrides,
})

describe('TCAR-018: readServingVersion', () => {
  it('returns production version when serving and cutover ready', () => {
    const state = makeControlState({
      servingStatus: 'production',
      cutoverReady: true,
      failClosedVerified: true,
    })

    const result = readServingVersion(state)

    expect(result.version).toBe('2.0')
    expect(result.serving).toBe(true)
  })

  it('returns null version when not in production', () => {
    const state = makeControlState({ servingStatus: 'shadow' })
    const result = readServingVersion(state)

    expect(result.version).toBeNull()
    expect(result.serving).toBe(false)
  })

  it('returns null version when in production but not cutover ready', () => {
    const state = makeControlState({
      servingStatus: 'production',
      cutoverReady: false,
    })
    const result = readServingVersion(state)

    expect(result.version).toBeNull()
    expect(result.serving).toBe(false)
    expect(result.reason).toBe('cutover_not_ready')
  })

  it('returns null when fail-closed not verified (fail-closed policy)', () => {
    const state = makeControlState({
      servingStatus: 'production',
      cutoverReady: true,
      failClosedVerified: false,
    })
    const result = readServingVersion(state)

    expect(result.version).toBeNull()
    expect(result.serving).toBe(false)
    expect(result.reason).toBe('fail_closed_not_verified')
  })

  it('returns null when rollback target is missing (fail-closed)', () => {
    const state = makeControlState({
      servingStatus: 'production',
      cutoverReady: true,
      failClosedVerified: true,
      rollbackTargetVersion: null,
    })
    const result = readServingVersion(state)

    expect(result.version).toBeNull()
    expect(result.serving).toBe(false)
    expect(result.reason).toBe('no_rollback_target')
  })

  it('returns null when rollback target is empty string (fail-closed)', () => {
    const state = makeControlState({
      servingStatus: 'production',
      cutoverReady: true,
      failClosedVerified: true,
      rollbackTargetVersion: '',
    })
    const result = readServingVersion(state)

    expect(result.version).toBeNull()
    expect(result.serving).toBe(false)
    expect(result.reason).toBe('no_rollback_target')
  })

  it('returns null when rollback target is whitespace (fail-closed)', () => {
    const state = makeControlState({
      servingStatus: 'production',
      cutoverReady: true,
      failClosedVerified: true,
      rollbackTargetVersion: '   ',
    })
    const result = readServingVersion(state)

    expect(result.version).toBeNull()
    expect(result.serving).toBe(false)
    expect(result.reason).toBe('no_rollback_target')
  })
})

describe('TCAR-018: writeShipVerdictToControl', () => {
  it('sets cutover_ready=true when verdict recommends cutover', () => {
    const patch = writeShipVerdictToControl({
      verdictArtifactId: 'verdict-001',
      cutoverRecommended: true,
    })

    expect(patch.cutover_ready).toBe(true)
    expect(patch.ship_verdict_artifact_id).toBe('verdict-001')
  })

  it('sets cutover_ready=false when verdict does NOT recommend cutover', () => {
    const patch = writeShipVerdictToControl({
      verdictArtifactId: 'verdict-002',
      cutoverRecommended: false,
    })

    expect(patch.cutover_ready).toBe(false)
    expect(patch.ship_verdict_artifact_id).toBe('verdict-002')
  })
})

describe('TCAR-018: resolveShipVerdictCutoverReady', () => {
  it('requires both ship recommendation and bridge certification before cutover opens', () => {
    expect(resolveShipVerdictCutoverReady({
      cutoverRecommended: true,
      bridgeCertified: true,
    })).toBe(true)
    expect(resolveShipVerdictCutoverReady({
      cutoverRecommended: true,
      bridgeCertified: false,
    })).toBe(false)
    expect(resolveShipVerdictCutoverReady({
      cutoverRecommended: false,
      bridgeCertified: true,
    })).toBe(false)
  })
})

describe('TCAR-018: isServingAllowed', () => {
  it('returns true when all conditions met', () => {
    expect(isServingAllowed({
      servingStatus: 'production',
      cutoverReady: true,
      failClosedVerified: true,
      rollbackTargetVersion: '1.0',
    })).toBe(true)
  })

  it('returns false when no rollback target (fail-closed)', () => {
    expect(isServingAllowed({
      servingStatus: 'production',
      cutoverReady: true,
      failClosedVerified: true,
      rollbackTargetVersion: null,
    })).toBe(false)
  })

  it('returns false when rollback target is empty string (fail-closed)', () => {
    expect(isServingAllowed({
      servingStatus: 'production',
      cutoverReady: true,
      failClosedVerified: true,
      rollbackTargetVersion: '',
    })).toBe(false)
  })

  it('returns false when rollback target is whitespace (fail-closed)', () => {
    expect(isServingAllowed({
      servingStatus: 'production',
      cutoverReady: true,
      failClosedVerified: true,
      rollbackTargetVersion: '   ',
    })).toBe(false)
  })

  it('returns false when rolled back', () => {
    expect(isServingAllowed({
      servingStatus: 'rolled_back',
      cutoverReady: true,
      failClosedVerified: true,
      rollbackTargetVersion: '1.0',
    })).toBe(false)
  })

  it('returns false when disabled', () => {
    expect(isServingAllowed({
      servingStatus: 'disabled',
      cutoverReady: false,
      failClosedVerified: false,
      rollbackTargetVersion: null,
    })).toBe(false)
  })
})

describe('TCAR-018: loadRollbackTarget', () => {
  it('returns rollback version when available', () => {
    const result = loadRollbackTarget(makeControlState({ rollbackTargetVersion: '1.5' }))

    expect(result.version).toBe('1.5')
    expect(result.available).toBe(true)
  })

  it('returns unavailable when no rollback target', () => {
    const result = loadRollbackTarget(makeControlState({ rollbackTargetVersion: null }))

    expect(result.version).toBeNull()
    expect(result.available).toBe(false)
  })

  it('returns unavailable when rollback target is empty string', () => {
    const result = loadRollbackTarget(makeControlState({ rollbackTargetVersion: '' }))

    expect(result.available).toBe(false)
  })

  it('returns unavailable when rollback target is whitespace', () => {
    const result = loadRollbackTarget(makeControlState({ rollbackTargetVersion: '   ' }))

    expect(result.available).toBe(false)
  })
})
