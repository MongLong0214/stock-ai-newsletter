import { finalDecisionArtifactSchema, safetyReportArtifactSchema } from './prospective-gate-evidence-contract'
import type { ProspectiveFinalDataset, ProspectiveGateIncident } from './prospective-gate-input-contract'
import type { evaluateFinalPromotionGate } from './prospective-gate-final'
import type { evaluateSafetyCheckpoint } from './prospective-gate-metrics'
import type { ProspectiveGateBootstrapReceipt } from './prospective-gate-statistics-contract'

type SafetyEvaluation = ReturnType<typeof evaluateSafetyCheckpoint>
type FinalEvaluation = ReturnType<typeof evaluateFinalPromotionGate>

const frozenHashesArtifact = (hashes: SafetyEvaluation['frozenHashes']) => ({
  study_contract_sha256: hashes.studyContractSha256,
  candidate_model_sha256: hashes.candidateModelSha256,
  comparator_artifact_sha256: hashes.comparatorArtifactSha256,
  dataset_manifest_sha256: hashes.datasetManifestSha256,
  feature_contract_sha256: hashes.featureContractSha256,
  label_contract_sha256: hashes.labelContractSha256,
  calibration_artifact_sha256: hashes.calibrationArtifactSha256,
})

const criticalIncidentsArtifact = (incidents: readonly ProspectiveGateIncident[]) => (
  incidents.map((incident) => ({ origin_id: incident.originId, reasons: [...incident.reasons] }))
)

export const buildSafetyEvidenceArtifact = (input: {
  readonly evaluation: SafetyEvaluation
  readonly incidents: readonly ProspectiveGateIncident[]
}) => safetyReportArtifactSchema.parse({
  artifact_version: 'prospective-safety-report-v1',
  cycle_id: input.evaluation.cycleId,
  sequence_start: input.evaluation.sequenceStart,
  sequence_end: input.evaluation.sequenceEnd,
  decision: input.evaluation.decision,
  reasons: input.evaluation.reasons,
  sample_status: input.evaluation.sampleStatus,
  exact_paired_count: input.evaluation.exactPairedCount,
  probabilities_valid: input.evaluation.probabilitiesValid,
  pooled_brier: input.evaluation.pooledBrier,
  fixed_bin_ece: input.evaluation.fixedBinEce,
  critical_incident_count: input.evaluation.criticalIncidentCount,
  critical_incidents: criticalIncidentsArtifact(input.incidents),
  gate_input_sha256: input.evaluation.gateInputSha256,
  frozen_hashes: frozenHashesArtifact(input.evaluation.frozenHashes),
})

export const buildFinalEvidenceArtifact = (input: {
  readonly evaluation: FinalEvaluation
  readonly dataset: ProspectiveFinalDataset
  readonly bootstrapReceipt: ProspectiveGateBootstrapReceipt
}) => {
  const evaluatedRegimes = input.evaluation.metrics.regimes.map((metric) => {
    const evaluation = input.evaluation.regimes.find((row) => row.regime === metric.regime)
    if (evaluation === undefined) throw new TypeError(`missing evaluated regime: ${metric.regime}`)
    return {
      regime: metric.regime,
      origin_count: metric.originCount,
      paired_row_count: metric.pairedRowCount,
      candidate_brier: metric.candidateBrier,
      comparator_brier: metric.comparatorBrier,
      delta_lower_95: metric.deltaLower95,
      gate_eligible: evaluation.gateEligible,
      status: evaluation.status,
      relative_brier_worsening: evaluation.relativeBrierWorsening,
    }
  })
  const metricRegimes = input.evaluation.metrics.regimes.map((metric) => ({
    regime: metric.regime,
    origin_count: metric.originCount,
    paired_row_count: metric.pairedRowCount,
    candidate_brier: metric.candidateBrier,
    comparator_brier: metric.comparatorBrier,
    delta_lower_95: metric.deltaLower95,
  }))
  const bootstrapRegime = (regime: 'risk_off' | 'neutral' | 'risk_on') => {
    const value = input.evaluation.bootstrap.regimeLower95[regime]
    return value === null ? null : {
      seed: value.seed,
      lower_95: value.lower95,
      replicate_sha256: value.replicateSha256,
    }
  }
  return finalDecisionArtifactSchema.parse({
    artifact_version: 'prospective-final-decision-v1',
    cycle_id: input.evaluation.cycleId,
    planned_origins: input.evaluation.plannedOrigins,
    sequence_start: input.evaluation.sequenceStart,
    sequence_end: input.evaluation.sequenceEnd,
    decision_origin_date: input.dataset.decisionOriginDate,
    decision: input.evaluation.decision,
    promotion_action: input.evaluation.action,
    reasons: input.evaluation.reasons,
    relative_brier_improvement: input.evaluation.relativeBrierImprovement,
    completeness: {
      expected_pair_count: input.dataset.completeness.expectedPairCount,
      terminal_pair_count: input.dataset.completeness.terminalPairCount,
      exact_paired_count: input.dataset.completeness.exactPairedCount,
      pooled_ratio: input.evaluation.completeness.pooledRatio,
      minimum_origin_ratio: input.evaluation.completeness.minimumOriginRatio,
      terminal_accounting_ratio: input.evaluation.completeness.terminalAccountingRatio,
      maximum_origin_source_gap_ratio: input.evaluation.completeness.maximumOriginSourceGapRatio,
      pooled_coverage: input.evaluation.completeness.pooledCoverage,
      excluded_reason_counts: input.dataset.completeness.excludedReasonCounts,
    },
    metrics: {
      candidate_brier: input.evaluation.metrics.candidateBrier,
      comparator_brier: input.evaluation.metrics.comparatorBrier,
      p_at_10_candidate: input.evaluation.metrics.pAt10Candidate,
      p_at_10_comparator: input.evaluation.metrics.pAt10Comparator,
      p_at_10_valid_origins: input.evaluation.metrics.pAt10ValidOrigins,
      p_at_10_required_origins: input.evaluation.metrics.pAt10RequiredOrigins,
      p_at_10_tie_break: input.evaluation.metrics.pAt10TieBreak,
      regimes: metricRegimes,
    },
    regimes: evaluatedRegimes,
    critical_incident_count: input.evaluation.criticalIncidentCount,
    critical_incidents: criticalIncidentsArtifact(input.dataset.incidents),
    gate_input_sha256: input.evaluation.gateInputSha256,
    frozen_hashes: frozenHashesArtifact(input.evaluation.frozenHashes),
    expected_frozen_hashes: frozenHashesArtifact(input.evaluation.expectedFrozenHashes),
    bootstrap: {
      contract_version: input.evaluation.bootstrap.contractVersion,
      method: input.evaluation.bootstrap.method,
      replicates: input.evaluation.bootstrap.replicates,
      moving_block_length: input.evaluation.bootstrap.movingBlockLength,
      ece_bin_count: input.evaluation.bootstrap.eceBinCount,
      input_sha256: input.evaluation.bootstrap.inputSha256,
      delta_brier: {
        seed: input.evaluation.bootstrap.deltaBrier.seed,
        point: input.evaluation.bootstrap.deltaBrier.point,
        upper_99: input.evaluation.bootstrap.deltaBrier.upper99,
        replicate_sha256: input.evaluation.bootstrap.deltaBrier.replicateSha256,
      },
      ece: {
        seed: input.evaluation.bootstrap.ece.seed,
        point: input.evaluation.bootstrap.ece.point,
        upper_95: input.evaluation.bootstrap.ece.upper95,
        replicate_sha256: input.evaluation.bootstrap.ece.replicateSha256,
      },
      regime_lower_95: {
        risk_off: bootstrapRegime('risk_off'),
        neutral: bootstrapRegime('neutral'),
        risk_on: bootstrapRegime('risk_on'),
      },
      result_sha256: input.evaluation.bootstrap.resultSha256,
    },
    bootstrap_receipt: {
      request_sha256: input.bootstrapReceipt.requestSha256,
      bridge_result_sha256: input.bootstrapReceipt.bridgeResultSha256,
    },
  })
}
