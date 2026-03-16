/**
 * TCAR-003A: Full Phase 0 Bridge Certification
 *
 * Runs all 4 PRD §9.2 bridge rows using the validators from TCAR-003,
 * produces cutover-ready verdict with consecutive pass/fail tracking.
 * Pure functions — no DB calls.
 */

import { GATE_THRESHOLDS } from '../../lib/tli/forecast/types'
import {
  validateEpisodeRegistryParity,
  validateQuerySnapshotParity,
  validateAnalogCandidatesParity,
  validateForecastControlParity,
  runBridgeValidation,
  type BridgeRowResult,
} from './phase0-bridge'

// --- Types ---

export interface BridgeCertificationInput {
  episodeRegistry: {
    activeThemeCount: number
    episodeThemeCount: number
    overlappingEpisodeCount: number
    coverageGapRatio: number
  }
  querySnapshotLabel: {
    totalSnapshots: number
    reconstructionSuccessCount: number
    missingSnapshotCount: number
  }
  analogCandidatesEvidence: {
    expectedArtifacts: number
    materializedArtifacts: number
    dualWriteSuccessCount: number
    dualWriteAttemptCount: number
    auditTrailComplete: boolean
  }
  forecastControl: {
    rollbackDrillCount: number
    rollbackDrillSuccessCount: number
    failClosedVerified: boolean
  }
}

export interface BridgeCertificationResult {
  allPassed: boolean
  results: BridgeRowResult[]
  cutoverEligible: boolean
  rollbackTriggered: boolean
}

export interface WeeklyVerdictHistory {
  consecutivePasses: number
  consecutiveFailures: number
}

// --- Full Certification Runner ---

export const runBridgeCertification = (
  input: BridgeCertificationInput,
): BridgeCertificationResult => {
  const results: BridgeRowResult[] = [
    validateEpisodeRegistryParity(input.episodeRegistry),
    validateQuerySnapshotParity(input.querySnapshotLabel),
    validateAnalogCandidatesParity(input.analogCandidatesEvidence),
    validateForecastControlParity(input.forecastControl),
  ]

  const summary = runBridgeValidation(results)

  return {
    allPassed: summary.allPassed,
    results: summary.results,
    cutoverEligible: summary.cutoverEligible,
    rollbackTriggered: summary.rollbackTriggered,
  }
}

// --- Cutover Readiness (consecutive weekly passes) ---

export const evaluateCutoverReadiness = (
  history: WeeklyVerdictHistory,
): boolean =>
  history.consecutivePasses >= GATE_THRESHOLDS.bridge.consecutivePassesForCutover

// --- Rollback Trigger (consecutive weekly failures) ---

export const evaluateRollbackTrigger = (
  history: WeeklyVerdictHistory,
): boolean =>
  history.consecutiveFailures >= GATE_THRESHOLDS.bridge.consecutiveFailuresForRollback
