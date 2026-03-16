/**
 * TCAR-001: Canonical enterprise contracts for forecasting and control
 *
 * Defines gate threshold constants, forecast control types, and bridge audit contracts
 * as specified in the enterprise PRD (tli-theme-cycle-analog-retrieval-enterprise-prd.md).
 */

import type { PolicyVersionSet } from '../analog/types'

// --- Gate Threshold Constants ---

export const GATE_THRESHOLDS = {
  retrieval: {
    /** delta FuturePathCorr@5 lower bound >= +0.02 */
    futurePathCorrLowerBound: 0.02,
    /** delta PeakHit@5 lower bound >= +0.03 */
    peakHitLowerBound: 0.03,
    /** PeakGap@5 median improvement >= 5% */
    peakGapImprovementPct: 5,
    /** no priority slice regression worse than -0.01 */
    sliceRegressionLimit: -0.01,
  },
  forecastShip: {
    /** prospective shadow >= 6 weeks */
    minProspectiveShadowWeeks: 6,
    /** eligible live queries >= 400 */
    minLiveQueries: 400,
    /** each priority slice >= 50 live queries */
    minSliceLiveQueries: 50,
    /** IBS relative improvement >= 5% */
    ibsRelativeImprovement: 0.05,
    /** Brier improvement threshold >= 3% relative */
    brierImprovementThreshold: 0.03,
    /** at least 2 of Brier@5/10/20 must improve */
    brierMinImprovingHorizons: 2,
    /** global ECE <= 0.05 */
    globalEceCeiling: 0.05,
    /** worst priority slice ECE <= 0.08 */
    worstSliceEceCeiling: 0.08,
  },
  data: {
    /** unknown/coverage_gap <= 5% */
    coverageGapCeiling: 0.05,
    /** point-in-time leakage audit failures = 0 */
    leakageAuditFailuresCeiling: 0,
    /** missing point-in-time snapshot <= 1% */
    missingSnapshotCeiling: 0.01,
  },
  phaseBReadiness: {
    /** native eval rows >= 5000 */
    minNativeEvalRows: 5000,
    /** distinct weekly cohorts >= 8 */
    minWeeklyCohorts: 8,
    /** each priority slice >= 300 eval rows */
    minSliceEvalRows: 300,
    /** OR >= 50 completed episodes */
    minSliceCompletedEpisodes: 50,
  },
  bridge: {
    /** 4 consecutive weekly passes for cutover */
    consecutivePassesForCutover: 4,
    /** 2 consecutive weekly failures for rollback */
    consecutiveFailuresForRollback: 2,
    /** 2 successful rollback drills before serving cutover */
    rollbackDrillsBeforeCutover: 2,
    /** episode registry coverage diff <= 2% */
    coverageDiffThreshold: 0.02,
    /** episode registry coverage gap <= 5% */
    coverageGapThreshold: 0.05,
    /** query snapshot reconstruction success >= 99% */
    reconstructionSuccessThreshold: 0.99,
    /** missing point-in-time snapshot <= 1% */
    missingSnapshotThreshold: 0.01,
    /** dual-write success rate >= 99% */
    dualWriteThreshold: 0.99,
  },
  labelAudit: {
    /** overlapping episodes = 0 */
    overlappingEpisodesCeiling: 0,
    /** inferred-boundary rows <= 15% overall */
    inferredBoundaryOverallCeiling: 0.15,
    /** inferred-boundary rows <= 10% in any priority slice */
    inferredBoundarySliceCeiling: 0.10,
    /** right-censored rows used as completed negatives = 0 */
    rightCensoredAsNegativesCeiling: 0,
    /** future-informed boundary changes in replay = 0 */
    futureInformedBoundaryChangesCeiling: 0,
  },
} as const

// --- Forecast Horizons ---

export const FORECAST_HORIZONS = [5, 10, 20] as const
export type ForecastHorizon = (typeof FORECAST_HORIZONS)[number]

// --- Abstention Thresholds ---

export const ABSTENTION_THRESHOLDS = {
  /** analog_support >= 5 */
  minAnalogSupport: 5,
  /** candidate concentration Gini <= 0.60 */
  maxCandidateConcentrationGini: 0.60,
  /** top-1 analog weight <= 0.35 */
  maxTop1AnalogWeight: 0.35,
} as const

// --- Serving Status ---

export const SERVING_STATUSES = ['shadow', 'canary', 'production', 'rolled_back', 'disabled'] as const
export type ServingStatus = (typeof SERVING_STATUSES)[number]

// --- Gate Pass Result ---

export const GATE_PASS_RESULTS = ['pass', 'fail', 'pending', 'pending_not_materialized'] as const
export type GatePassResult = (typeof GATE_PASS_RESULTS)[number]

export const isGatePassResult = (value: unknown): value is GatePassResult =>
  typeof value === 'string' && GATE_PASS_RESULTS.includes(value as GatePassResult)

// --- Bridge Row Names ---

export const BRIDGE_ROW_NAMES = [
  'episode_registry',
  'query_snapshot_label',
  'analog_candidates_evidence',
  'forecast_control',
] as const

export type BridgeRowName = (typeof BRIDGE_ROW_NAMES)[number]

export const isBridgeRowName = (value: unknown): value is BridgeRowName =>
  typeof value === 'string' && BRIDGE_ROW_NAMES.includes(value as BridgeRowName)

// --- Bridge Contracts ---

export interface BridgeParity {
  metric_name: string
  metric_value: number
  threshold: number
  passed: boolean
}

export type BridgeRowVerdict = GatePassResult

export interface BridgeRunAuditV1 {
  id: string
  artifact_version: 'bridge_run_audits_v1'
  run_date: string
  bridge_row: BridgeRowName
  parity: BridgeParity
  verdict: BridgeRowVerdict
  cutover_eligible: boolean
  rollback_triggered: boolean
  details: Record<string, unknown> | null
  created_at: string
}

// --- Forecast Control ---

export interface ForecastControlV1 {
  id: string
  artifact_version: 'forecast_control_v1'
  production_version: string
  serving_status: ServingStatus
  cutover_ready: boolean
  rollback_target_version: string | null
  rollback_drill_count: number
  rollback_drill_last_success: string | null
  fail_closed_verified: boolean
  ship_verdict_artifact_id: string | null
  policy_versions: PolicyVersionSet
  created_at: string
  updated_at: string
}
