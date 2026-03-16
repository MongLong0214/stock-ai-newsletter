/**
 * TCAR-002 + TCAR-004: Forecast Control helpers
 *
 * Pure functions for building, validating, and evaluating forecast_control_v1 records.
 * Includes rollback drill simulation, fail-open detection, and cutover readiness.
 * No Supabase client calls — these are composable building blocks.
 */

import { GATE_THRESHOLDS } from '../../lib/tli/forecast/types'
import type { ForecastControlRow } from '../../lib/tli/types/bridge-schema'

type ServingStatus = ForecastControlRow['serving_status']

// --- Valid state transitions ---
// shadow → canary (pre-production testing), production (direct cutover), rolled_back, disabled
// canary → production (promote), rolled_back, disabled
// production → rolled_back, disabled
// rolled_back → shadow (re-attempt after fix)
// disabled is terminal (emergency off, no further transitions)
const VALID_TRANSITIONS: Record<ServingStatus, ServingStatus[]> = {
  shadow: ['shadow', 'canary', 'production', 'rolled_back', 'disabled'],
  canary: ['canary', 'production', 'rolled_back', 'disabled'],
  production: ['production', 'rolled_back', 'disabled'],
  rolled_back: ['rolled_back', 'shadow', 'disabled'],
  disabled: ['disabled'],
}

const hasRollbackTargetVersion = (value: string | null): boolean =>
  value !== null && value.trim() !== ''

// --- Build a new forecast control record ---

export const buildForecastControlRecord = (params: {
  productionVersion: string
  policyVersions: Record<string, unknown>
}): Omit<ForecastControlRow, 'id' | 'created_at' | 'updated_at'> => ({
  artifact_version: 'forecast_control_v1',
  production_version: params.productionVersion,
  serving_status: 'shadow',
  cutover_ready: false,
  rollback_target_version: null,
  rollback_drill_count: 0,
  rollback_drill_last_success: null,
  fail_closed_verified: false,
  ship_verdict_artifact_id: null,
  policy_versions: params.policyVersions,
})

// --- Validate serving status transition ---

export const validateServingStatusTransition = (
  from: ServingStatus,
  to: ServingStatus,
): boolean => {
  const allowed = VALID_TRANSITIONS[from]
  if (!allowed) return false
  return allowed.includes(to)
}

// --- Build rollback drill patch ---

export const buildRollbackDrillPatch = (
  current: ForecastControlRow,
  success: boolean,
): { rollback_drill_count: number; rollback_drill_last_success?: string } => {
  const patch: { rollback_drill_count: number; rollback_drill_last_success?: string } = {
    rollback_drill_count: success ? current.rollback_drill_count + 1 : current.rollback_drill_count,
  }
  if (success) {
    patch.rollback_drill_last_success = new Date().toISOString()
  }
  return patch
}

// --- Check cutover eligibility ---

export const checkCutoverEligibility = (
  row: ForecastControlRow,
): { eligible: boolean; reasons: string[] } => {
  const reasons: string[] = []

  if (row.rollback_drill_count < GATE_THRESHOLDS.bridge.rollbackDrillsBeforeCutover) {
    reasons.push('rollback_drill_count_insufficient')
  }

  if (row.rollback_drill_last_success === null) {
    reasons.push('no_successful_drill')
  }

  if (!row.fail_closed_verified) {
    reasons.push('fail_closed_not_verified')
  }

  if (!hasRollbackTargetVersion(row.rollback_target_version)) {
    reasons.push('no_rollback_target')
  }

  if (row.serving_status !== 'shadow' && row.serving_status !== 'canary') {
    reasons.push('invalid_serving_status')
  }

  return {
    eligible: reasons.length === 0,
    reasons,
  }
}

// --- TCAR-004 Types ---

interface RollbackDrillResult {
  success: boolean
  reason?: string
  drillNumber: number
  patch: { rollback_drill_count: number; rollback_drill_last_success?: string }
  evidence: {
    timestamp: string
    from_version: string
    rollback_target: string | null
    drill_number: number
  }
}

interface FailOpenDetection {
  failOpenDetected: boolean
  reasons: string[]
}

interface CutoverReadinessResult {
  ready: boolean
  eligible: boolean
  failOpenDetected: boolean
  drillsComplete: boolean
  failClosedVerified: boolean
  reasons: string[]
}

// --- TCAR-004: Rollback Drill ---

export const runRollbackDrill = (control: ForecastControlRow): RollbackDrillResult => {
  const drillNumber = control.rollback_drill_count + 1

  if (!hasRollbackTargetVersion(control.rollback_target_version)) {
    return {
      success: false,
      reason: 'no_rollback_target',
      drillNumber,
      patch: buildRollbackDrillPatch(control, false),
      evidence: {
        timestamp: new Date().toISOString(),
        from_version: control.production_version,
        rollback_target: null,
        drill_number: drillNumber,
      },
    }
  }

  return {
    success: true,
    drillNumber,
    patch: buildRollbackDrillPatch(control, true),
    evidence: {
      timestamp: new Date().toISOString(),
      from_version: control.production_version,
      rollback_target: control.rollback_target_version,
      drill_number: drillNumber,
    },
  }
}

// --- TCAR-004: Fail-Open Detection ---

export const detectFailOpen = (control: ForecastControlRow): FailOpenDetection => {
  const reasons: string[] = []

  if (control.serving_status === 'production' && !control.fail_closed_verified) {
    reasons.push('serving_without_fail_closed')
  }

  if (control.cutover_ready && control.rollback_drill_count < GATE_THRESHOLDS.bridge.rollbackDrillsBeforeCutover) {
    reasons.push('cutover_ready_without_drills')
  }

  if (control.cutover_ready && !control.fail_closed_verified) {
    reasons.push('cutover_ready_without_fail_closed')
  }

  if ((control.serving_status === 'production' || control.serving_status === 'canary')
    && !hasRollbackTargetVersion(control.rollback_target_version)) {
    reasons.push('serving_without_rollback_target')
  }

  return {
    failOpenDetected: reasons.length > 0,
    reasons,
  }
}

// --- TCAR-004: Cutover Readiness Evaluation ---

export const evaluateCutoverReadiness = (control: ForecastControlRow): CutoverReadinessResult => {
  const eligibility = checkCutoverEligibility(control)
  const failOpen = detectFailOpen(control)

  const drillsComplete = control.rollback_drill_count >= GATE_THRESHOLDS.bridge.rollbackDrillsBeforeCutover
  const failClosedVerified = control.fail_closed_verified

  const allReasons = [...eligibility.reasons, ...failOpen.reasons]
  // Deduplicate reasons
  const uniqueReasons = [...new Set(allReasons)]

  return {
    ready: eligibility.eligible && !failOpen.failOpenDetected,
    eligible: eligibility.eligible,
    failOpenDetected: failOpen.failOpenDetected,
    drillsComplete,
    failClosedVerified,
    reasons: uniqueReasons,
  }
}
