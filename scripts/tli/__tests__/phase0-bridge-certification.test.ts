/**
 * TCAR-003A: Full Phase 0 Bridge Certification
 *
 * TDD tests for bridge certification runner that executes all 4 bridge rows
 * and produces cutover-ready verdicts with consecutive pass/fail tracking.
 */

import { describe, expect, it } from 'vitest'
import {
  runBridgeCertification,
  evaluateCutoverReadiness,
  evaluateRollbackTrigger,
  type BridgeCertificationInput,
  type BridgeCertificationResult,
  type WeeklyVerdictHistory,
} from '../phase0-bridge-certification'
import { GATE_THRESHOLDS } from '../../../lib/tli/forecast/types'

// --- Test helpers ---

const makePassingInput = (overrides: Partial<BridgeCertificationInput> = {}): BridgeCertificationInput => ({
  episodeRegistry: {
    activeThemeCount: 100,
    episodeThemeCount: 100,
    overlappingEpisodeCount: 0,
    coverageGapRatio: 0.01,
  },
  querySnapshotLabel: {
    totalSnapshots: 1000,
    reconstructionSuccessCount: 998,
    missingSnapshotCount: 5,
  },
  analogCandidatesEvidence: {
    expectedArtifacts: 50,
    materializedArtifacts: 50,
    dualWriteSuccessCount: 100,
    dualWriteAttemptCount: 100,
    auditTrailComplete: true,
  },
  forecastControl: {
    rollbackDrillCount: 2,
    rollbackDrillSuccessCount: 2,
    failClosedVerified: true,
  },
  ...overrides,
})

describe('TCAR-003A: runBridgeCertification', () => {
  it('passes when all 4 bridge rows pass', () => {
    const result = runBridgeCertification(makePassingInput())

    expect(result.allPassed).toBe(true)
    expect(result.cutoverEligible).toBe(true)
    expect(result.rollbackTriggered).toBe(false)
    expect(result.results).toHaveLength(4)
  })

  it('fails when episode registry parity fails', () => {
    const result = runBridgeCertification(makePassingInput({
      episodeRegistry: {
        activeThemeCount: 100,
        episodeThemeCount: 50,
        overlappingEpisodeCount: 0,
        coverageGapRatio: 0.01,
      },
    }))

    expect(result.allPassed).toBe(false)
    expect(result.cutoverEligible).toBe(false)
  })

  it('fails when query snapshot parity fails', () => {
    const result = runBridgeCertification(makePassingInput({
      querySnapshotLabel: {
        totalSnapshots: 1000,
        reconstructionSuccessCount: 900,
        missingSnapshotCount: 100,
      },
    }))

    expect(result.allPassed).toBe(false)
  })

  it('fails when analog candidates parity fails', () => {
    const result = runBridgeCertification(makePassingInput({
      analogCandidatesEvidence: {
        expectedArtifacts: 50,
        materializedArtifacts: 30,
        dualWriteSuccessCount: 80,
        dualWriteAttemptCount: 100,
        auditTrailComplete: false,
      },
    }))

    expect(result.allPassed).toBe(false)
  })

  it('fails when forecast control parity fails', () => {
    const result = runBridgeCertification(makePassingInput({
      forecastControl: {
        rollbackDrillCount: 2,
        rollbackDrillSuccessCount: 1,
        failClosedVerified: false,
      },
    }))

    expect(result.allPassed).toBe(false)
  })

  it('identifies all 4 bridge row names in results', () => {
    const result = runBridgeCertification(makePassingInput())
    const names = result.results.map(r => r.rowName)

    expect(names).toContain('episode_registry')
    expect(names).toContain('query_snapshot_label')
    expect(names).toContain('analog_candidates_evidence')
    expect(names).toContain('forecast_control')
  })

  it('triggers rollback when critical row fails', () => {
    const result = runBridgeCertification(makePassingInput({
      forecastControl: {
        rollbackDrillCount: 2,
        rollbackDrillSuccessCount: 0,
        failClosedVerified: false,
      },
    }))

    expect(result.rollbackTriggered).toBe(true)
  })
})

describe('TCAR-003A: evaluateCutoverReadiness', () => {
  it('returns true after consecutive passes meet threshold', () => {
    const history: WeeklyVerdictHistory = {
      consecutivePasses: GATE_THRESHOLDS.bridge.consecutivePassesForCutover,
      consecutiveFailures: 0,
    }

    expect(evaluateCutoverReadiness(history)).toBe(true)
  })

  it('returns false when consecutive passes below threshold', () => {
    const history: WeeklyVerdictHistory = {
      consecutivePasses: GATE_THRESHOLDS.bridge.consecutivePassesForCutover - 1,
      consecutiveFailures: 0,
    }

    expect(evaluateCutoverReadiness(history)).toBe(false)
  })
})

describe('TCAR-003A: evaluateRollbackTrigger', () => {
  it('returns true after consecutive failures meet threshold', () => {
    const history: WeeklyVerdictHistory = {
      consecutivePasses: 0,
      consecutiveFailures: GATE_THRESHOLDS.bridge.consecutiveFailuresForRollback,
    }

    expect(evaluateRollbackTrigger(history)).toBe(true)
  })

  it('returns false when consecutive failures below threshold', () => {
    const history: WeeklyVerdictHistory = {
      consecutivePasses: 0,
      consecutiveFailures: GATE_THRESHOLDS.bridge.consecutiveFailuresForRollback - 1,
    }

    expect(evaluateRollbackTrigger(history)).toBe(false)
  })
})
