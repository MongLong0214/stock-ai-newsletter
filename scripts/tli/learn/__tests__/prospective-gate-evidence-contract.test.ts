import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import {
  finalDecisionArtifactSchema,
  renderFinalDecisionArtifact,
  renderSafetyReportArtifact,
  safetyReportArtifactSchema,
} from '../prospective-gate-evidence'
import { bootstrapResultSha256 } from '../prospective-gate-final'

const CYCLE_ID = '10000000-0000-4000-8000-000000000014'
const SHA = (digit: string): string => digit.repeat(64)
const FROZEN_HASHES = {
  study_contract_sha256: SHA('1'),
  candidate_model_sha256: SHA('2'),
  comparator_artifact_sha256: SHA('3'),
  dataset_manifest_sha256: SHA('4'),
  feature_contract_sha256: SHA('5'),
  label_contract_sha256: SHA('6'),
  calibration_artifact_sha256: SHA('7'),
}

const safetyArtifact = () => ({
  artifact_version: 'prospective-safety-report-v1' as const,
  cycle_id: CYCLE_ID,
  sequence_start: 1 as const,
  sequence_end: 8 as const,
  decision: 'pass' as const,
  reasons: ['all_safety_checks_passed'],
  sample_status: 'evaluated' as const,
  exact_paired_count: 80,
  probabilities_valid: true,
  pooled_brier: 0.1,
  fixed_bin_ece: 0.05,
  critical_incident_count: 0,
  critical_incidents: [],
  gate_input_sha256: SHA('a'),
  frozen_hashes: FROZEN_HASHES,
})

const regimeMetric = (regime: 'risk_off' | 'neutral' | 'risk_on') => ({
  regime,
  origin_count: 3,
  paired_row_count: 90,
  candidate_brier: 0.18,
  comparator_brier: 0.2,
  delta_lower_95: null,
})

const BOOTSTRAP_CORE = {
  contractVersion: 'bootstrap-v1',
  method: 'theme_x_two_week_moving_block',
  replicates: 10_000,
  movingBlockLength: 2,
  eceBinCount: 10,
  inputSha256: SHA('a'),
  deltaBrier: { seed: 14, point: -0.02, upper99: -0.001, replicateSha256: SHA('b') },
  ece: { seed: 15, point: 0.05, upper95: 0.08, replicateSha256: SHA('c') },
  regimeLower95: { risk_off: null, neutral: null, risk_on: null },
} as const

const finalArtifact = () => ({
  artifact_version: 'prospective-final-decision-v1' as const,
  cycle_id: CYCLE_ID,
  planned_origins: 16,
  sequence_start: 1 as const,
  sequence_end: 16,
  decision_origin_date: '2026-10-19',
  decision: 'pass' as const,
  promotion_action: 'would_promote' as const,
  reasons: ['all_gates_passed'],
  relative_brier_improvement: 1 - 0.18 / 0.2,
  completeness: {
    expected_pair_count: 160,
    terminal_pair_count: 160,
    exact_paired_count: 160,
    pooled_ratio: 1,
    minimum_origin_ratio: 0.99,
    terminal_accounting_ratio: 1,
    maximum_origin_source_gap_ratio: 0.01,
    pooled_coverage: 0.8,
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
  gate_input_sha256: SHA('a'),
  frozen_hashes: FROZEN_HASHES,
  expected_frozen_hashes: FROZEN_HASHES,
  bootstrap: {
    contract_version: BOOTSTRAP_CORE.contractVersion,
    method: BOOTSTRAP_CORE.method,
    replicates: BOOTSTRAP_CORE.replicates,
    moving_block_length: BOOTSTRAP_CORE.movingBlockLength,
    ece_bin_count: BOOTSTRAP_CORE.eceBinCount,
    input_sha256: BOOTSTRAP_CORE.inputSha256,
    delta_brier: {
      seed: BOOTSTRAP_CORE.deltaBrier.seed,
      point: BOOTSTRAP_CORE.deltaBrier.point,
      upper_99: BOOTSTRAP_CORE.deltaBrier.upper99,
      replicate_sha256: BOOTSTRAP_CORE.deltaBrier.replicateSha256,
    },
    ece: {
      seed: BOOTSTRAP_CORE.ece.seed,
      point: BOOTSTRAP_CORE.ece.point,
      upper_95: BOOTSTRAP_CORE.ece.upper95,
      replicate_sha256: BOOTSTRAP_CORE.ece.replicateSha256,
    },
    regime_lower_95: { risk_off: null, neutral: null, risk_on: null },
    result_sha256: bootstrapResultSha256(BOOTSTRAP_CORE),
  },
  bootstrap_receipt: { request_sha256: SHA('e'), bridge_result_sha256: SHA('f') },
})

describe('prospective gate evidence contract', () => {
  it('renders safety as strict canonical safety-only bytes with no efficacy surface', () => {
    const rendered = renderSafetyReportArtifact(safetyArtifact())

    expect(rendered.repoRelativePath).toBe(
      `docs/evidence/tli-v3-scientific-rebuild/${CYCLE_ID}/safety-report.json`,
    )
    expect(rendered.canonicalJson.endsWith('\n')).toBe(false)
    expect(rendered.canonicalBytes).toEqual(Buffer.from(rendered.canonicalJson, 'utf8'))
    expect(rendered.contentSha256).toBe(
      createHash('sha256').update(rendered.canonicalBytes).digest('hex'),
    )
    for (const forbidden of ['baseline_delta', 'comparator_brier', 'p_at_10', 'confidence', 'verdict', 'promotion']) {
      expect(rendered.canonicalJson).not.toContain(forbidden)
    }
  })

  it.each([
    'baseline_delta', 'comparator_brier', 'p_at_10', 'information_coefficient',
    'confidence_interval', 'promotion_verdict',
  ])('structurally rejects the safety efficacy field %s', (field) => {
    expect(() => safetyReportArtifactSchema.parse({ ...safetyArtifact(), [field]: 0 })).toThrow()
  })

  it('renders the full final gate input, bootstrap hashes, and reasons canonically', () => {
    const artifact = finalArtifact()
    const rendered = renderFinalDecisionArtifact(artifact)

    expect(finalDecisionArtifactSchema.parse(JSON.parse(rendered.canonicalJson))).toEqual(artifact)
    expect(rendered.repoRelativePath).toBe(
      `docs/evidence/tli-v3-scientific-rebuild/${CYCLE_ID}/final-decision.json`,
    )
    expect(rendered.canonicalJson).toContain('theme_x_two_week_moving_block')
    expect(rendered.canonicalJson).toContain('bridge_result_sha256')
    expect(rendered.canonicalJson.endsWith('\n')).toBe(false)
  })

  it('rejects theme-only bootstrap, unknown fields, and mismatched planned sequence/action', () => {
    const artifact = finalArtifact()

    expect(() => finalDecisionArtifactSchema.parse({
      ...artifact,
      bootstrap: { ...artifact.bootstrap, method: 'theme_only' },
    })).toThrow()
    expect(() => finalDecisionArtifactSchema.parse({ ...artifact, hidden_override: true })).toThrow()
    expect(() => finalDecisionArtifactSchema.parse({ ...artifact, sequence_end: 15 })).toThrow()
    expect(() => finalDecisionArtifactSchema.parse({
      ...artifact,
      decision: 'reject',
      promotion_action: 'would_promote',
    })).toThrow()
  })
})
