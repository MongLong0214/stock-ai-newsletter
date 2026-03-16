/**
 * TCAR-020: Runbooks and Enterprise Certification Pack
 *
 * Validators and template generators for enterprise certification.
 * Ensures all gates pass before cutover is recommended.
 * Pure functions — no DB calls.
 */

import { GATE_THRESHOLDS } from '../../lib/tli/forecast/types'

// --- Types ---

export interface CertificationPackInput {
  bridgeCertification: {
    allPassed: boolean
    consecutivePasses: number
  }
  retrievalGate: {
    passed: boolean
  }
  forecastShipGate: {
    cutoverRecommended: boolean
    failedCriteria: string[]
  }
  rollbackDrills: {
    count: number
    allSucceeded: boolean
  }
  labelAudit: {
    overlappingEpisodes: number
    inferredBoundaryRatio: number
    inferredBoundarySliceRatio: number
    rightCensoredAsNegatives: number
    futureInformedBoundaryChanges: number
  }
}

export interface CertificationPackResult {
  valid: boolean
  missingItems: string[]
}

export interface RunbookChecklist {
  sections: string[]
  thresholdReferences: {
    consecutivePassesForCutover: number
    rollbackDrillsBeforeCutover: number
    consecutiveFailuresForRollback: number
  }
}

export interface ShipMemo {
  recommendation: 'approve' | 'reject'
  gateResults: {
    bridge: boolean
    retrieval: boolean
    forecastShip: boolean
    rollback: boolean
    labelAudit: boolean
  }
  thresholds: {
    globalEceCeiling: number
    worstSliceEceCeiling: number
    ibsRelativeImprovement: number
    futurePathCorrLowerBound: number
  }
  generatedAt: string
}

// --- Certification Pack Validator ---

export const validateCertificationPack = (
  input: CertificationPackInput,
): CertificationPackResult => {
  const missingItems: string[] = []

  if (!input.bridgeCertification.allPassed
    || input.bridgeCertification.consecutivePasses < GATE_THRESHOLDS.bridge.consecutivePassesForCutover) {
    missingItems.push('bridge_certification')
  }

  if (!input.retrievalGate.passed) {
    missingItems.push('retrieval_gate')
  }

  if (!input.forecastShipGate.cutoverRecommended) {
    missingItems.push('forecast_ship_gate')
  }

  if (input.rollbackDrills.count < GATE_THRESHOLDS.bridge.rollbackDrillsBeforeCutover
    || !input.rollbackDrills.allSucceeded) {
    missingItems.push('rollback_drills')
  }

  const labelAuditFailed =
    input.labelAudit.overlappingEpisodes > GATE_THRESHOLDS.labelAudit.overlappingEpisodesCeiling
    || input.labelAudit.inferredBoundaryRatio > GATE_THRESHOLDS.labelAudit.inferredBoundaryOverallCeiling
    || input.labelAudit.inferredBoundarySliceRatio > GATE_THRESHOLDS.labelAudit.inferredBoundarySliceCeiling
    || input.labelAudit.rightCensoredAsNegatives > GATE_THRESHOLDS.labelAudit.rightCensoredAsNegativesCeiling
    || input.labelAudit.futureInformedBoundaryChanges > GATE_THRESHOLDS.labelAudit.futureInformedBoundaryChangesCeiling

  if (labelAuditFailed) {
    missingItems.push('label_audit')
  }

  return { valid: missingItems.length === 0, missingItems }
}

// --- Runbook Checklist ---

export const buildRunbookChecklist = (): RunbookChecklist => ({
  sections: [
    'phase0_bridge',
    'rollback_drill',
    'retrieval_gate',
    'forecast_ship',
    'cutover',
    'rollback_procedure',
  ],
  thresholdReferences: {
    consecutivePassesForCutover: GATE_THRESHOLDS.bridge.consecutivePassesForCutover,
    rollbackDrillsBeforeCutover: GATE_THRESHOLDS.bridge.rollbackDrillsBeforeCutover,
    consecutiveFailuresForRollback: GATE_THRESHOLDS.bridge.consecutiveFailuresForRollback,
  },
})

// --- Ship Memo ---

export const buildShipMemo = (input: CertificationPackInput): ShipMemo => {
  const packResult = validateCertificationPack(input)

  return {
    recommendation: packResult.valid ? 'approve' : 'reject',
    gateResults: {
      bridge: input.bridgeCertification.allPassed,
      retrieval: input.retrievalGate.passed,
      forecastShip: input.forecastShipGate.cutoverRecommended,
      rollback: input.rollbackDrills.count >= GATE_THRESHOLDS.bridge.rollbackDrillsBeforeCutover
        && input.rollbackDrills.allSucceeded,
      labelAudit: input.labelAudit.overlappingEpisodes <= GATE_THRESHOLDS.labelAudit.overlappingEpisodesCeiling
        && input.labelAudit.inferredBoundaryRatio <= GATE_THRESHOLDS.labelAudit.inferredBoundaryOverallCeiling
        && input.labelAudit.inferredBoundarySliceRatio <= GATE_THRESHOLDS.labelAudit.inferredBoundarySliceCeiling
        && input.labelAudit.rightCensoredAsNegatives <= GATE_THRESHOLDS.labelAudit.rightCensoredAsNegativesCeiling
        && input.labelAudit.futureInformedBoundaryChanges <= GATE_THRESHOLDS.labelAudit.futureInformedBoundaryChangesCeiling,
    },
    thresholds: {
      globalEceCeiling: GATE_THRESHOLDS.forecastShip.globalEceCeiling,
      worstSliceEceCeiling: GATE_THRESHOLDS.forecastShip.worstSliceEceCeiling,
      ibsRelativeImprovement: GATE_THRESHOLDS.forecastShip.ibsRelativeImprovement,
      futurePathCorrLowerBound: GATE_THRESHOLDS.retrieval.futurePathCorrLowerBound,
    },
    generatedAt: new Date().toISOString(),
  }
}
