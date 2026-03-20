/**
 * TCAR-003: Phase 0 Bridge Parity Harness
 *
 * Pure validator functions for the 4 PRD §9.2 bridge rows.
 * No DB calls — reusable by TCAR-003A (full certification).
 */

import { GATE_THRESHOLDS } from '@/lib/tli/forecast/types'
import type { BridgeRowName, GatePassResult, BridgeParity } from '@/lib/tli/forecast/types'

// --- Types ---

export interface BridgeRowResult {
  rowName: BridgeRowName
  verdict: GatePassResult
  parity: BridgeParity
  cutover_eligible: boolean
  rollback_triggered: boolean
  details: Record<string, unknown> | null
}

interface BridgeValidationSummary {
  allPassed: boolean
  results: BridgeRowResult[]
  cutoverEligible: boolean
  rollbackTriggered: boolean
}

// --- Thresholds (centralized in GATE_THRESHOLDS.bridge) ---

const COVERAGE_DIFF_THRESHOLD = GATE_THRESHOLDS.bridge.coverageDiffThreshold
const COVERAGE_GAP_THRESHOLD = GATE_THRESHOLDS.bridge.coverageGapThreshold
const RECONSTRUCTION_SUCCESS_THRESHOLD = GATE_THRESHOLDS.bridge.reconstructionSuccessThreshold
const MISSING_SNAPSHOT_THRESHOLD = GATE_THRESHOLDS.bridge.missingSnapshotThreshold
const DUAL_WRITE_THRESHOLD = GATE_THRESHOLDS.bridge.dualWriteThreshold

// --- Helpers ---

const safeDiv = (numerator: number, denominator: number): number =>
  denominator === 0 ? 0 : numerator / denominator

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value))

const buildResult = (
  rowName: BridgeRowName,
  metricName: string,
  metricValue: number,
  threshold: number,
  passed: boolean,
  rollbackTriggered: boolean,
  details: Record<string, unknown> | null = null,
): BridgeRowResult => ({
  rowName,
  verdict: passed ? 'pass' : 'fail',
  parity: {
    metric_name: metricName,
    metric_value: metricValue,
    threshold,
    passed,
  },
  cutover_eligible: passed,
  rollback_triggered: rollbackTriggered,
  details,
})

// --- Validators ---

export const validateEpisodeRegistryParity = (input: {
  activeThemeCount: number
  episodeThemeCount: number
  overlappingEpisodeCount: number
  coverageGapRatio: number
}): BridgeRowResult => {
  const coverageDiff =
    Math.abs(input.activeThemeCount - input.episodeThemeCount)
    / Math.max(input.activeThemeCount, 1)

  const coverageOk = coverageDiff <= COVERAGE_DIFF_THRESHOLD
  const overlapOk = input.overlappingEpisodeCount === 0
  const gapOk = input.coverageGapRatio <= COVERAGE_GAP_THRESHOLD

  const passed = coverageOk && overlapOk && gapOk
  const rollbackTriggered = !coverageOk

  return buildResult(
    'episode_registry',
    'coverage_diff',
    coverageDiff,
    COVERAGE_DIFF_THRESHOLD,
    passed,
    rollbackTriggered,
    {
      overlapping_episode_count: input.overlappingEpisodeCount,
      coverage_gap_ratio: input.coverageGapRatio,
    },
  )
}

export const validateQuerySnapshotParity = (input: {
  totalSnapshots: number
  reconstructionSuccessCount: number
  missingSnapshotCount: number
}): BridgeRowResult => {
  if (input.totalSnapshots === 0) {
    return createPendingNotMaterializedResult('query_snapshot_label')
  }

  const total = Math.max(input.totalSnapshots, 0)
  const successCount = clamp(input.reconstructionSuccessCount, 0, total)
  const missingCount = clamp(input.missingSnapshotCount, 0, total)

  const successRate = safeDiv(successCount, total)
  const missingRate = safeDiv(missingCount, total)

  const successOk = successRate >= RECONSTRUCTION_SUCCESS_THRESHOLD
  const missingOk = missingRate <= MISSING_SNAPSHOT_THRESHOLD

  const passed = successOk && missingOk
  const rollbackTriggered = !successOk

  return buildResult(
    'query_snapshot_label',
    'reconstruction_success_rate',
    successRate,
    RECONSTRUCTION_SUCCESS_THRESHOLD,
    passed,
    rollbackTriggered,
    { missing_rate: missingRate },
  )
}

export const validateAnalogCandidatesParity = (input: {
  expectedArtifacts: number
  materializedArtifacts: number
  dualWriteSuccessCount: number
  dualWriteAttemptCount: number
  auditTrailComplete: boolean
}): BridgeRowResult => {
  if (input.expectedArtifacts === 0 || input.dualWriteAttemptCount === 0) {
    return createPendingNotMaterializedResult('analog_candidates_evidence')
  }

  const expected = Math.max(input.expectedArtifacts, 0)
  const materialized = Math.max(input.materializedArtifacts, 0)
  const attempts = Math.max(input.dualWriteAttemptCount, 0)
  const successes = clamp(input.dualWriteSuccessCount, 0, attempts)

  const completeness = safeDiv(materialized, Math.max(expected, 1))
  const dualWriteRate = safeDiv(successes, Math.max(attempts, 1))

  const completenessOk = completeness >= 1.0
  const dualWriteOk = dualWriteRate >= DUAL_WRITE_THRESHOLD
  const auditOk = input.auditTrailComplete

  const passed = completenessOk && dualWriteOk && auditOk
  const rollbackTriggered = !dualWriteOk || !auditOk

  return buildResult(
    'analog_candidates_evidence',
    'dual_write_rate',
    dualWriteRate,
    DUAL_WRITE_THRESHOLD,
    passed,
    rollbackTriggered,
    { artifact_completeness: completeness },
  )
}

export const validateForecastControlParity = (input: {
  rollbackDrillCount: number
  rollbackDrillSuccessCount: number
  failClosedVerified: boolean
}): BridgeRowResult => {
  const drillSuccessRate = safeDiv(
    input.rollbackDrillSuccessCount,
    Math.max(input.rollbackDrillCount, 1),
  )

  const drillCountOk = input.rollbackDrillCount >= GATE_THRESHOLDS.bridge.rollbackDrillsBeforeCutover
  const drillRateOk = drillSuccessRate >= 1.0
  const failClosedOk = input.failClosedVerified

  const passed = drillCountOk && drillRateOk && failClosedOk
  const rollbackTriggered = !drillRateOk || !failClosedOk

  return buildResult(
    'forecast_control',
    'drill_success_rate',
    drillSuccessRate,
    1.0,
    passed,
    rollbackTriggered,
    { drill_count: input.rollbackDrillCount, minimum_required: GATE_THRESHOLDS.bridge.rollbackDrillsBeforeCutover },
  )
}

// --- Aggregator ---

export const runBridgeValidation = (
  results: BridgeRowResult[],
): BridgeValidationSummary => {
  // Fail-closed: empty results = no evidence = fail (not vacuous true)
  const allPassed = results.length > 0 && results.every(r => r.verdict === 'pass')
  const rollbackTriggered = results.some(r => r.rollback_triggered)
  const cutoverEligible = allPassed && !rollbackTriggered

  return {
    allPassed,
    results,
    cutoverEligible,
    rollbackTriggered,
  }
}

// --- Pending Not Materialized Helper ---

export const createPendingNotMaterializedResult = (
  rowName: BridgeRowName,
): BridgeRowResult => ({
  rowName,
  verdict: 'pending_not_materialized',
  parity: {
    metric_name: 'not_materialized',
    metric_value: 0,
    threshold: 0,
    passed: false,
  },
  cutover_eligible: false,
  rollback_triggered: false,
  details: null,
})
