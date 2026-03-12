import type { Level4CertificationSourceSurface } from '@/lib/tli/comparison/level4-types'

export const DEFAULT_COMPARISON_V4_SERVING_VERSION = 'latest'

export type ComparisonV4PromotionGateStatus = 'passed' | 'failed' | 'held' | 'rolled_back'
export type ComparisonV4HoldState = 'inactive' | 'active' | 'observation_only'

export interface ComparisonV4GateVerdict {
  status: ComparisonV4PromotionGateStatus
  summary: string
  failureReasons: string[]
}

export interface ComparisonV4ControlRow {
  production_version: string
  serving_enabled: boolean
  promoted_by: string
  promoted_at: string
  source_surface: Level4CertificationSourceSurface
  calibration_version: string
  weight_version: string | null
  drift_version: string
  promotion_gate_status: ComparisonV4PromotionGateStatus
  promotion_gate_summary: string
  promotion_gate_failures: string[]
  previous_stable_version: string | null
  rollback_reason: string | null
  rolled_back_at: string | null
  auto_hold_enabled: boolean
  hold_state: ComparisonV4HoldState
  hold_reason: string | null
  hold_report_date: string | null
  decision_trace: Record<string, unknown>
}

export function resolveComparisonV4ServingVersion(input: {
  envVersion?: string
  controlRow: { production_version: string; serving_enabled: boolean } | null
}) {
  if (input.controlRow?.serving_enabled && input.controlRow.production_version) {
    return input.controlRow.production_version
  }
  return input.envVersion || DEFAULT_COMPARISON_V4_SERVING_VERSION
}

export function buildComparisonV4ControlRow(input: {
  productionVersion: string
  servingEnabled: boolean
  actor: string
  sourceSurface?: Level4CertificationSourceSurface
  calibrationVersion?: string
  weightVersion?: string | null
  driftVersion?: string
  gateVerdict?: ComparisonV4GateVerdict
  previousStableVersion?: string | null
  rollbackReason?: string | null
  rolledBackAt?: string | null
  autoHoldEnabled?: boolean
  holdState?: ComparisonV4HoldState
  holdReason?: string | null
  holdReportDate?: string | null
  promotedAt?: string
}): ComparisonV4ControlRow {
  const promotedAt = input.promotedAt || new Date().toISOString()
  const gateVerdict = input.gateVerdict || {
    status: 'passed' as const,
    summary: 'legacy promotion path without explicit level-4 gate context',
    failureReasons: [],
  }

  return {
    production_version: input.productionVersion,
    serving_enabled: input.servingEnabled,
    promoted_by: input.actor,
    promoted_at: promotedAt,
    source_surface: input.sourceSurface ?? 'v2_certification',
    calibration_version: input.calibrationVersion ?? 'untracked',
    weight_version: input.weightVersion ?? null,
    drift_version: input.driftVersion ?? 'untracked',
    promotion_gate_status: gateVerdict.status,
    promotion_gate_summary: gateVerdict.summary,
    promotion_gate_failures: [...gateVerdict.failureReasons],
    previous_stable_version: input.previousStableVersion ?? null,
    rollback_reason: input.rollbackReason ?? null,
    rolled_back_at: input.rolledBackAt ?? null,
    auto_hold_enabled: input.autoHoldEnabled ?? false,
    hold_state: input.holdState ?? 'inactive',
    hold_reason: input.holdReason ?? null,
    hold_report_date: input.holdReportDate ?? null,
    decision_trace: {
      source_surface: input.sourceSurface ?? 'v2_certification',
      calibration_version: input.calibrationVersion ?? 'untracked',
      weight_version: input.weightVersion ?? null,
      drift_version: input.driftVersion ?? 'untracked',
      gate_status: gateVerdict.status,
      gate_summary: gateVerdict.summary,
      gate_failures: gateVerdict.failureReasons,
      hold_state: input.holdState ?? 'inactive',
      hold_reason: input.holdReason ?? null,
      hold_report_date: input.holdReportDate ?? null,
      previous_stable_version: input.previousStableVersion ?? null,
      rollback_reason: input.rollbackReason ?? null,
    },
  }
}

export function buildRollbackControlRow(input: {
  productionVersion: string
  actor: string
  sourceSurface: Level4CertificationSourceSurface
  calibrationVersion: string
  weightVersion: string | null
  driftVersion: string
  previousStableVersion: string | null
  rollbackReason: string
  rolledBackAt?: string
}): ComparisonV4ControlRow {
  return buildComparisonV4ControlRow({
    productionVersion: input.productionVersion,
    servingEnabled: true,
    actor: input.actor,
    sourceSurface: input.sourceSurface,
    calibrationVersion: input.calibrationVersion,
    weightVersion: input.weightVersion,
    driftVersion: input.driftVersion,
    gateVerdict: {
      status: 'rolled_back',
      summary: input.rollbackReason,
      failureReasons: ['rollback'],
    },
    previousStableVersion: input.previousStableVersion,
    rollbackReason: input.rollbackReason,
    rolledBackAt: input.rolledBackAt,
    autoHoldEnabled: true,
    holdState: 'active',
    holdReason: input.rollbackReason,
  })
}

export function buildComparisonV4HoldPatch(input: {
  autoHoldEnabled: boolean
  holdState: ComparisonV4HoldState
  holdReason: string | null
  holdReportDate: string | null
  driftVersion: string
}) {
  return {
    auto_hold_enabled: input.autoHoldEnabled,
    hold_state: input.holdState,
    hold_reason: input.holdReason,
    hold_report_date: input.holdReportDate,
    drift_version: input.driftVersion,
  }
}
