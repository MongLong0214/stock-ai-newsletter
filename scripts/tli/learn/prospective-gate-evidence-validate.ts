import { canonicalJsonV1 } from '../../../lib/tli/canonical-json-v1'
import { PROSPECTIVE_GATE_LIMITS, sortedUnique, type FrozenHashes } from './prospective-gate-contract'
import { evaluateFinalPromotionGate, type BootstrapResult } from './prospective-gate-final'
import type {
  FinalDecisionArtifact,
  GateEvidenceArtifact,
  SafetyReportArtifact,
} from './prospective-gate-evidence-contract'

const hashesFromArtifact = (hashes: FinalDecisionArtifact['frozen_hashes']): FrozenHashes => ({
  studyContractSha256: hashes.study_contract_sha256,
  candidateModelSha256: hashes.candidate_model_sha256,
  comparatorArtifactSha256: hashes.comparator_artifact_sha256,
  datasetManifestSha256: hashes.dataset_manifest_sha256,
  featureContractSha256: hashes.feature_contract_sha256,
  labelContractSha256: hashes.label_contract_sha256,
  calibrationArtifactSha256: hashes.calibration_artifact_sha256,
})

const bootstrapFromArtifact = (artifact: FinalDecisionArtifact): BootstrapResult => {
  const lower = (regime: 'risk_off' | 'neutral' | 'risk_on') => {
    const value = artifact.bootstrap.regime_lower_95[regime]
    return value === null ? null : {
      seed: value.seed, lower95: value.lower_95, replicateSha256: value.replicate_sha256,
    }
  }
  return {
    contractVersion: artifact.bootstrap.contract_version,
    method: artifact.bootstrap.method,
    replicates: artifact.bootstrap.replicates,
    movingBlockLength: artifact.bootstrap.moving_block_length,
    eceBinCount: artifact.bootstrap.ece_bin_count,
    inputSha256: artifact.bootstrap.input_sha256,
    deltaBrier: {
      seed: artifact.bootstrap.delta_brier.seed,
      point: artifact.bootstrap.delta_brier.point,
      upper99: artifact.bootstrap.delta_brier.upper_99,
      replicateSha256: artifact.bootstrap.delta_brier.replicate_sha256,
    },
    ece: {
      seed: artifact.bootstrap.ece.seed,
      point: artifact.bootstrap.ece.point,
      upper95: artifact.bootstrap.ece.upper_95,
      replicateSha256: artifact.bootstrap.ece.replicate_sha256,
    },
    regimeLower95: { risk_off: lower('risk_off'), neutral: lower('neutral'), risk_on: lower('risk_on') },
    resultSha256: artifact.bootstrap.result_sha256,
  }
}

const assertSafetySemantics = (artifact: SafetyReportArtifact): void => {
  const reasons: string[] = []
  if (!artifact.probabilities_valid) reasons.push('invalid_probability')
  if (artifact.pooled_brier > PROSPECTIVE_GATE_LIMITS.maximumSafetyBrier) {
    reasons.push('pooled_brier_catastrophe')
  }
  if (artifact.fixed_bin_ece > PROSPECTIVE_GATE_LIMITS.maximumSafetyEce) {
    reasons.push('fixed_bin_ece_catastrophe')
  }
  if (artifact.critical_incident_count > 0) reasons.push('critical_incident')
  const expectedReasons = reasons.length === 0 ? ['all_safety_checks_passed'] : sortedUnique(reasons)
  const expectedDecision = reasons.length === 0 ? 'pass' : 'safety_hold'
  if (artifact.decision !== expectedDecision
    || canonicalJsonV1(artifact.reasons) !== canonicalJsonV1(expectedReasons)) {
    throw new TypeError('safety evidence decision is inconsistent with frozen catastrophe gates')
  }
}

const finalInputFromArtifact = (artifact: FinalDecisionArtifact) => ({
  cycleId: artifact.cycle_id,
  plannedOrigins: artifact.planned_origins,
  sequenceStart: artifact.sequence_start,
  sequenceEnd: artifact.sequence_end,
  completeness: {
    pooledRatio: artifact.completeness.pooled_ratio,
    minimumOriginRatio: artifact.completeness.minimum_origin_ratio,
    terminalAccountingRatio: artifact.completeness.terminal_accounting_ratio,
    maximumOriginSourceGapRatio: artifact.completeness.maximum_origin_source_gap_ratio,
    pooledCoverage: artifact.completeness.pooled_coverage,
  },
  metrics: {
    candidateBrier: artifact.metrics.candidate_brier,
    comparatorBrier: artifact.metrics.comparator_brier,
    pAt10Candidate: artifact.metrics.p_at_10_candidate,
    pAt10Comparator: artifact.metrics.p_at_10_comparator,
    pAt10ValidOrigins: artifact.metrics.p_at_10_valid_origins,
    pAt10RequiredOrigins: artifact.metrics.p_at_10_required_origins,
    pAt10TieBreak: artifact.metrics.p_at_10_tie_break,
    regimes: artifact.metrics.regimes.map((regime) => ({
      regime: regime.regime,
      originCount: regime.origin_count,
      pairedRowCount: regime.paired_row_count,
      candidateBrier: regime.candidate_brier,
      comparatorBrier: regime.comparator_brier,
      deltaLower95: regime.delta_lower_95,
    })),
  },
  criticalIncidentCount: artifact.critical_incident_count,
  gateInputSha256: artifact.gate_input_sha256,
  frozenHashes: hashesFromArtifact(artifact.frozen_hashes),
  expectedFrozenHashes: hashesFromArtifact(artifact.expected_frozen_hashes),
  bootstrap: bootstrapFromArtifact(artifact),
})

const assertFinalSemantics = (artifact: FinalDecisionArtifact): void => {
  const evaluated = evaluateFinalPromotionGate(finalInputFromArtifact(artifact))
  const expected = {
    decision: evaluated.decision,
    promotion_action: evaluated.action,
    reasons: evaluated.reasons,
    relative_brier_improvement: evaluated.relativeBrierImprovement,
    regimes: evaluated.regimes.map((regime) => ({
      regime: regime.regime,
      gate_eligible: regime.gateEligible,
      status: regime.status,
      relative_brier_worsening: regime.relativeBrierWorsening,
    })),
  }
  const actual = {
    decision: artifact.decision,
    promotion_action: artifact.promotion_action,
    reasons: artifact.reasons,
    relative_brier_improvement: artifact.relative_brier_improvement,
    regimes: artifact.regimes.map((regime) => ({
      regime: regime.regime,
      gate_eligible: regime.gate_eligible,
      status: regime.status,
      relative_brier_worsening: regime.relative_brier_worsening,
    })),
  }
  if (canonicalJsonV1(actual) !== canonicalJsonV1(expected)) {
    throw new TypeError('final evidence decision is inconsistent with frozen promotion gates')
  }
}

export const assertGateEvidenceSemantics = (artifact: GateEvidenceArtifact): void => {
  if (artifact.artifact_version === 'prospective-safety-report-v1') assertSafetySemantics(artifact)
  else assertFinalSemantics(artifact)
}
