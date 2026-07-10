import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import {
  FINAL_DECISION_RPC,
  GATE_EVIDENCE_VERIFIER_REPO_PATH,
  gateEvidenceRepoPath,
  assertSupportedEvidenceGitObjectFormat,
  recordCommittedGateDecision,
  renderFinalDecisionArtifact,
  renderSafetyReportArtifact,
  SAFETY_DECISION_RPC,
  verifyCommittedGateEvidence,
  type GateDecisionRpcClient,
} from '../prospective-gate-evidence'
import { bootstrapResultSha256 } from '../prospective-gate-final'

const CYCLE_ID = '10000000-0000-4000-8000-000000000014'
const sha = (digit: string): string => digit.repeat(64)
const frozenHashes = {
  study_contract_sha256: sha('1'), candidate_model_sha256: sha('2'),
  comparator_artifact_sha256: sha('3'), dataset_manifest_sha256: sha('4'),
  feature_contract_sha256: sha('5'), label_contract_sha256: sha('6'),
  calibration_artifact_sha256: sha('7'),
}

const safety = (decision: 'pass' | 'safety_hold' = 'pass') => ({
  artifact_version: 'prospective-safety-report-v1' as const,
  cycle_id: CYCLE_ID, sequence_start: 1 as const, sequence_end: 8 as const,
  decision,
  reasons: [decision === 'pass' ? 'all_safety_checks_passed' : 'critical_incident'],
  sample_status: 'evaluated' as const, exact_paired_count: 80,
  probabilities_valid: true, pooled_brier: 0.1, fixed_bin_ece: 0.05,
  critical_incident_count: decision === 'pass' ? 0 : 1,
  critical_incidents: decision === 'pass' ? [] : [{
    origin_id: 'cycle:incident', reasons: ['critical_incident'],
  }],
  gate_input_sha256: sha('a'), frozen_hashes: frozenHashes,
})

const finalReject = () => {
  const regimes = (['risk_off', 'neutral', 'risk_on'] as const).map((regime) => ({
    regime, origin_count: 3, paired_row_count: 75,
    candidate_brier: 0.18, comparator_brier: 0.2, delta_lower_95: null,
  }))
  const bootstrapCore = {
    contractVersion: 'bootstrap-v1', method: 'theme_x_two_week_moving_block',
    replicates: 10_000, movingBlockLength: 2, eceBinCount: 10, inputSha256: sha('a'),
    deltaBrier: { seed: 1, point: -0.02, upper99: -0.001, replicateSha256: sha('b') },
    ece: { seed: 2, point: 0.05, upper95: 0.08, replicateSha256: sha('c') },
    regimeLower95: { risk_off: null, neutral: null, risk_on: null },
  } as const
  return {
    artifact_version: 'prospective-final-decision-v1' as const,
    cycle_id: CYCLE_ID, planned_origins: 16, sequence_start: 1 as const, sequence_end: 16,
    decision_origin_date: '2026-10-19', decision: 'reject' as const,
    promotion_action: 'keep_champion' as const, reasons: ['coverage_below_70pct'],
    relative_brier_improvement: 1 - 0.18 / 0.2,
    completeness: {
      expected_pair_count: 160, terminal_pair_count: 160, exact_paired_count: 160,
      pooled_ratio: 1, minimum_origin_ratio: 1, terminal_accounting_ratio: 1,
      maximum_origin_source_gap_ratio: 0, pooled_coverage: 0.69,
      excluded_reason_counts: [],
    },
    metrics: {
      candidate_brier: 0.18, comparator_brier: 0.2,
      p_at_10_candidate: 0.6, p_at_10_comparator: 0.58,
      p_at_10_valid_origins: 16, p_at_10_required_origins: 13,
      p_at_10_tie_break: 'probability_desc_theme_id_asc' as const,
      regimes,
    },
    regimes: regimes.map((metric) => ({
      ...metric, gate_eligible: false as const,
      status: 'insufficient_regime_sample' as const, relative_brier_worsening: null,
    })),
    critical_incident_count: 0, gate_input_sha256: sha('a'),
    critical_incidents: [],
    frozen_hashes: frozenHashes, expected_frozen_hashes: frozenHashes,
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
  }
}

const writeEvidence = (repositoryPath: string, kind: 'safety' | 'final', bytes: Buffer): void => {
  const path = join(repositoryPath, ...gateEvidenceRepoPath(CYCLE_ID, kind).split('/'))
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, bytes)
}

const git = (repositoryPath: string, args: readonly string[]): string => execFileSync(
  'git', [...args], { cwd: repositoryPath, encoding: 'utf8' },
).trim()

const commitEvidence = (kind: 'safety' | 'final', bytes: Buffer) => {
  const repositoryPath = mkdtempSync(join(tmpdir(), 'tli-gate-evidence-'))
  git(repositoryPath, ['init', '--quiet'])
  git(repositoryPath, ['config', 'user.email', 'gate@example.invalid'])
  git(repositoryPath, ['config', 'user.name', 'Gate Test'])
  writeEvidence(repositoryPath, kind, bytes)
  const verifierPath = join(repositoryPath, ...GATE_EVIDENCE_VERIFIER_REPO_PATH.split('/'))
  mkdirSync(dirname(verifierPath), { recursive: true })
  writeFileSync(verifierPath, readFileSync(join(process.cwd(), GATE_EVIDENCE_VERIFIER_REPO_PATH)))
  git(repositoryPath, ['add', '.'])
  git(repositoryPath, ['commit', '--quiet', '-m', 'gate evidence'])
  return { repositoryPath, commitSha: git(repositoryPath, ['rev-parse', 'HEAD']) }
}

describe('committed prospective gate evidence', () => {
  it('verifies exact commit/blob/worktree bytes and builds the migration 049 ten-key envelope', () => {
    const rendered = renderSafetyReportArtifact(safety())
    const repository = commitEvidence('safety', rendered.canonicalBytes)
    try {
      const verified = verifyCommittedGateEvidence({
        cycleId: CYCLE_ID, kind: 'safety', commitSha: repository.commitSha,
        repositoryPath: repository.repositoryPath,
      })

      expect(Object.keys(verified.envelope).sort()).toEqual([
        'artifact_key', 'artifact_type', 'canonical_json', 'content_sha256',
        'git_blob_sha', 'git_commit_sha', 'repo_relative_path', 'verified_at',
        'verifier_code_sha', 'verifier_version',
      ])
      expect(verified.envelope).toMatchObject({
        artifact_type: 'safety_report', artifact_key: 'singleton',
        git_commit_sha: repository.commitSha, canonical_json: rendered.canonicalJson,
      })
      expect(verified.envelope.verified_at).toBe(new Date(verified.envelope.verified_at).toISOString())
    } finally {
      rmSync(repository.repositoryPath, { recursive: true, force: true })
    }
  })

  it('fails before recording on dirty bytes, noncanonical bytes, and object-format mismatch', () => {
    const rendered = renderSafetyReportArtifact(safety())
    const dirty = commitEvidence('safety', rendered.canonicalBytes)
    const noncanonical = commitEvidence('safety', Buffer.from(`${rendered.canonicalJson}\n`))
    try {
      writeEvidence(dirty.repositoryPath, 'safety', Buffer.from('{}'))
      expect(() => verifyCommittedGateEvidence({
        cycleId: CYCLE_ID, kind: 'safety', commitSha: dirty.commitSha,
        repositoryPath: dirty.repositoryPath,
      })).toThrow(/worktree evidence bytes differ/)
      expect(() => verifyCommittedGateEvidence({
        cycleId: CYCLE_ID, kind: 'safety', commitSha: noncanonical.commitSha,
        repositoryPath: noncanonical.repositoryPath,
      })).toThrow(/unique RFC 8785/)
      expect(() => assertSupportedEvidenceGitObjectFormat('sha512')).toThrow(/object format/)
    } finally {
      rmSync(dirty.repositoryPath, { recursive: true, force: true })
      rmSync(noncanonical.repositoryPath, { recursive: true, force: true })
    }
  })

  it.each([
    ['safety', SAFETY_DECISION_RPC, renderSafetyReportArtifact(safety('safety_hold')), false],
    ['final', FINAL_DECISION_RPC, renderFinalDecisionArtifact(finalReject()), false],
  ] as const)('derives the %s RPC pass flag only from committed artifact bytes', async (
    kind, expectedRpc, rendered, expectedPass,
  ) => {
    const repository = commitEvidence(kind, rendered.canonicalBytes)
    const rpc = vi.fn<GateDecisionRpcClient['rpc']>().mockResolvedValue({ data: CYCLE_ID, error: null })
    try {
      const result = await recordCommittedGateDecision({
        cycleId: CYCLE_ID, kind, commitSha: repository.commitSha,
        repositoryPath: repository.repositoryPath,
      }, { rpc })

      expect(rpc).toHaveBeenCalledTimes(1)
      expect(rpc).toHaveBeenCalledWith(expectedRpc, expect.objectContaining({
        p_cycle_id: CYCLE_ID, p_pass: expectedPass,
      }))
      expect(result.rpc).toBe(expectedRpc)
      expect(result.decision).not.toBe('pass')
    } finally {
      rmSync(repository.repositoryPath, { recursive: true, force: true })
    }
  })
})
