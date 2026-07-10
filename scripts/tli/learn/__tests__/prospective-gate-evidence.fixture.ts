import { bootstrapResultSha256 } from '../prospective-gate-final'

const CYCLE_ID = '10000000-0000-4000-8000-000000000014'
const sha = (digit: string): string => digit.repeat(64)

const frozenHashes = {
  study_contract_sha256: sha('1'),
  candidate_model_sha256: sha('2'),
  comparator_artifact_sha256: sha('3'),
  dataset_manifest_sha256: sha('4'),
  feature_contract_sha256: sha('5'),
  label_contract_sha256: sha('6'),
  calibration_artifact_sha256: sha('7'),
}

export const safetyEvidenceFixture = (decision: 'pass' | 'safety_hold' = 'pass') => ({
  artifact_version: 'prospective-safety-report-v1' as const,
  cycle_id: CYCLE_ID,
  sequence_start: 1 as const,
  sequence_end: 8 as const,
  decision,
  reasons: [decision === 'pass' ? 'all_safety_checks_passed' : 'pooled_brier_catastrophe'],
  sample_status: 'evaluated' as const,
  exact_paired_count: 80,
  probabilities_valid: true,
  pooled_brier: decision === 'pass' ? 0.1 : 0.4,
  fixed_bin_ece: 0.05,
  critical_incident_count: 0,
  critical_incidents: [],
  gate_input_sha256: sha('a'),
  frozen_hashes: frozenHashes,
})

const regimeMetric = (regime: 'risk_off' | 'neutral' | 'risk_on') => ({
  regime,
  origin_count: 3,
  paired_row_count: 90,
  candidate_brier: 0.18,
  comparator_brier: 0.2,
  delta_lower_95: null,
})

const bootstrapCore = {
  contractVersion: 'bootstrap-v1',
  method: 'theme_x_two_week_moving_block',
  replicates: 10_000,
  movingBlockLength: 2,
  eceBinCount: 10,
  inputSha256: sha('a'),
  deltaBrier: { seed: 14, point: -0.02, upper99: -0.001, replicateSha256: sha('b') },
  ece: { seed: 15, point: 0.05, upper95: 0.08, replicateSha256: sha('c') },
  regimeLower95: { risk_off: null, neutral: null, risk_on: null },
} as const

export const finalEvidenceFixture = (decision: 'pass' | 'reject' = 'pass') => ({
  artifact_version: 'prospective-final-decision-v1' as const,
  cycle_id: CYCLE_ID,
  planned_origins: 16,
  sequence_start: 1 as const,
  sequence_end: 16,
  decision_origin_date: '2026-10-19',
  decision,
  promotion_action: decision === 'pass' ? 'would_promote' as const : 'keep_champion' as const,
  reasons: [decision === 'pass' ? 'all_gates_passed' : 'coverage_below_70pct'],
  relative_brier_improvement: 1 - 0.18 / 0.2,
  completeness: {
    expected_pair_count: 160,
    terminal_pair_count: 160,
    exact_paired_count: 160,
    pooled_ratio: 1,
    minimum_origin_ratio: 0.99,
    terminal_accounting_ratio: 1,
    maximum_origin_source_gap_ratio: 0.01,
    pooled_coverage: decision === 'pass' ? 0.8 : 0.6,
    excluded_reason_counts: [],
  },
  metrics: {
    candidate_brier: 0.18,
    comparator_brier: 0.2,
    p_at_10_candidate: 0.6,
    p_at_10_comparator: 0.58,
    p_at_10_valid_origins: 13,
    p_at_10_required_origins: 13,
    p_at_10_tie_break: 'probability_desc_theme_id_asc' as const,
    regimes: [regimeMetric('risk_off'), regimeMetric('neutral'), regimeMetric('risk_on')],
  },
  regimes: [
    { ...regimeMetric('risk_off'), gate_eligible: false, status: 'insufficient_regime_sample' as const, relative_brier_worsening: null },
    { ...regimeMetric('neutral'), gate_eligible: false, status: 'insufficient_regime_sample' as const, relative_brier_worsening: null },
    { ...regimeMetric('risk_on'), gate_eligible: false, status: 'insufficient_regime_sample' as const, relative_brier_worsening: null },
  ],
  critical_incident_count: 0,
  critical_incidents: [],
  gate_input_sha256: sha('a'),
  frozen_hashes: frozenHashes,
  expected_frozen_hashes: frozenHashes,
  bootstrap: {
    contract_version: bootstrapCore.contractVersion,
    method: bootstrapCore.method,
    replicates: bootstrapCore.replicates,
    moving_block_length: bootstrapCore.movingBlockLength,
    ece_bin_count: bootstrapCore.eceBinCount,
    input_sha256: bootstrapCore.inputSha256,
    delta_brier: {
      seed: bootstrapCore.deltaBrier.seed,
      point: bootstrapCore.deltaBrier.point,
      upper_99: bootstrapCore.deltaBrier.upper99,
      replicate_sha256: bootstrapCore.deltaBrier.replicateSha256,
    },
    ece: {
      seed: bootstrapCore.ece.seed,
      point: bootstrapCore.ece.point,
      upper_95: bootstrapCore.ece.upper95,
      replicate_sha256: bootstrapCore.ece.replicateSha256,
    },
    regime_lower_95: { risk_off: null, neutral: null, risk_on: null },
    result_sha256: bootstrapResultSha256(bootstrapCore),
  },
  bootstrap_receipt: { request_sha256: sha('e'), bridge_result_sha256: sha('f') },
})

export { CYCLE_ID }
