/**
 * TCAR-018: Forecast Control Plane and Fail-Closed Serving Reader
 *
 * Pure functions for reading serving versions, writing ship verdicts,
 * and enforcing fail-closed serving policy. No DB calls.
 *
 * Key invariant: serving is NEVER allowed without:
 * 1. Production status + cutover ready
 * 2. Fail-closed verification
 * 3. Rollback target available
 */

import type { ServingStatus } from '../../lib/tli/forecast/types'
import { getServerSupabaseClient } from '@/lib/supabase/server-client'

// --- Types ---

export interface ControlPlaneState {
  productionVersion: string
  servingStatus: ServingStatus
  cutoverReady: boolean
  rollbackTargetVersion: string | null
  failClosedVerified: boolean
  shipVerdictArtifactId: string | null
}

interface ServingVersionResult {
  version: string | null
  serving: boolean
  reason?: string
}

interface ShipVerdictPatch {
  cutover_ready: boolean
  ship_verdict_artifact_id: string
}

interface RollbackTargetResult {
  version: string | null
  available: boolean
}

// --- Serving Version Reader ---

export const readServingVersion = (state: ControlPlaneState): ServingVersionResult => {
  if (state.servingStatus !== 'production') {
    return { version: null, serving: false, reason: 'not_production' }
  }

  if (!state.failClosedVerified) {
    return { version: null, serving: false, reason: 'fail_closed_not_verified' }
  }

  if (!state.cutoverReady) {
    return { version: null, serving: false, reason: 'cutover_not_ready' }
  }

  if (state.rollbackTargetVersion === null || state.rollbackTargetVersion.trim() === '') {
    return { version: null, serving: false, reason: 'no_rollback_target' }
  }

  return { version: state.productionVersion, serving: true }
}

// --- Ship Verdict Writer ---

export const writeShipVerdictToControl = (input: {
  verdictArtifactId: string
  cutoverRecommended: boolean
}): ShipVerdictPatch => ({
  cutover_ready: input.cutoverRecommended,
  ship_verdict_artifact_id: input.verdictArtifactId,
})

export const resolveShipVerdictCutoverReady = (input: {
  cutoverRecommended: boolean
  bridgeCertified: boolean
}): boolean => input.cutoverRecommended && input.bridgeCertified

export async function persistShipVerdictToControl(input: {
  verdictArtifactId: string
  cutoverRecommended: boolean
  bridgeCertified: boolean
  productionVersion: string
  rollbackTargetVersion: string | null
  failClosedVerified: boolean
  policyVersions?: Record<string, unknown>
  servingStatus?: ServingStatus
}) {
  const supabase = getServerSupabaseClient()
  const cutoverReady = resolveShipVerdictCutoverReady({
    cutoverRecommended: input.cutoverRecommended,
    bridgeCertified: input.bridgeCertified,
  })
  const patch = writeShipVerdictToControl({
    verdictArtifactId: input.verdictArtifactId,
    cutoverRecommended: cutoverReady,
  })

  const { data: existing } = await supabase
    .from('forecast_control_v1')
    .select('id, policy_versions')
    .eq('production_version', input.productionVersion)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing?.id) {
    const { error } = await supabase
      .from('forecast_control_v1')
      .update({
        ...patch,
        rollback_target_version: input.rollbackTargetVersion,
        fail_closed_verified: input.failClosedVerified,
        serving_status: input.servingStatus ?? 'shadow',
        policy_versions: input.policyVersions ?? existing.policy_versions,
      })
      .eq('id', existing.id)

    if (error) {
      throw new Error(`failed to update forecast control: ${error.message}`)
    }

    return { ...patch, id: existing.id }
  }

  const { data, error } = await supabase
    .from('forecast_control_v1')
    .insert({
      artifact_version: 'forecast_control_v1',
      production_version: input.productionVersion,
      serving_status: input.servingStatus ?? 'shadow',
      rollback_target_version: input.rollbackTargetVersion,
      rollback_drill_count: 0,
      rollback_drill_last_success: null,
      fail_closed_verified: input.failClosedVerified,
      ship_verdict_artifact_id: patch.ship_verdict_artifact_id,
      cutover_ready: patch.cutover_ready,
      policy_versions: input.policyVersions ?? {},
    })
    .select('id')
    .maybeSingle()

  if (error) {
    throw new Error(`failed to insert forecast control: ${error.message}`)
  }

  return { ...patch, id: data?.id ?? null }
}

// --- Serving Allowed Check ---

export const isServingAllowed = (input: {
  servingStatus: ServingStatus
  cutoverReady: boolean
  failClosedVerified: boolean
  rollbackTargetVersion: string | null
}): boolean => {
  if (input.servingStatus !== 'production') return false
  if (!input.cutoverReady) return false
  if (!input.failClosedVerified) return false
  if (input.rollbackTargetVersion === null || input.rollbackTargetVersion.trim() === '') return false
  return true
}

// --- Rollback Target Loader ---

export const loadRollbackTarget = (
  state: ControlPlaneState,
): RollbackTargetResult => ({
  version: state.rollbackTargetVersion,
  available: state.rollbackTargetVersion !== null && state.rollbackTargetVersion.trim() !== '',
})
