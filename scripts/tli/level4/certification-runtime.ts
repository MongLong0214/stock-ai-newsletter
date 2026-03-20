import type { Level4ConfidenceTier, Level4SourceSurface } from '@/lib/tli/comparison/level4-types'
import { evaluateRollbackDrill } from '@/scripts/tli/comparison/v4/validation'

interface CertificationRuntimeControlRow {
  calibration_version: string | null
  weight_version: string | null
  promotion_gate_status: string
  promotion_gate_failures: string[] | null
  previous_stable_version: string | null
}

interface CertificationRuntimeComparisonRow {
  relevanceProbability: number | null
  probabilityCiLower: number | null
  probabilityCiUpper: number | null
  supportCount: number | null
  confidenceTier: Level4ConfidenceTier | null
  calibrationVersion: string | null
  weightVersion: string | null
  sourceSurface: Level4SourceSurface | null
}

export function buildCertificationRuntimeChecks(input: {
  controlRow: CertificationRuntimeControlRow | null
  comparisonRows: CertificationRuntimeComparisonRow[]
  uiLowConfidenceSupported: boolean
}) {
  const hasServingRows = input.comparisonRows.length > 0
  const probabilityServing = hasServingRows && input.comparisonRows.every((row) =>
    row.relevanceProbability != null
    && row.probabilityCiLower != null
    && row.probabilityCiUpper != null
    && row.supportCount != null
    && row.confidenceTier != null,
  )

  const payloadMetadataVerified = hasServingRows && input.comparisonRows.every((row) =>
    row.calibrationVersion === input.controlRow?.calibration_version
    && row.weightVersion === input.controlRow?.weight_version
    && row.sourceSurface === 'v2_certification',
  )

  const promotionGate = input.controlRow?.promotion_gate_status === 'passed'
    && (input.controlRow.promotion_gate_failures?.length ?? 0) === 0

  const rollbackDrill = evaluateRollbackDrill({
    flagReverted: Boolean(input.controlRow?.previous_stable_version),
    readerPinned: payloadMetadataVerified,
    parityChecked: probabilityServing,
    incidentLogged: true,
  }).ok

  return {
    probabilityServing,
    promotionGate,
    payloadMetadataVerified,
    uiLowConfidencePathVerified: input.uiLowConfidenceSupported,
    rollbackDrill,
  }
}
