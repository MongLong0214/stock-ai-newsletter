import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  assertSupportedEvidenceGitObjectFormat,
  evidenceEnvelopeSchema,
  GATE_EVIDENCE_VERIFIER_VERSION,
  RECORD_TLI_FINAL_DECISION_RPC,
  RECORD_TLI_SAFETY_DECISION_RPC,
  recordCommittedFinalDecision,
  recordCommittedSafetyDecision,
  renderFinalDecisionArtifact,
  renderSafetyReportArtifact,
  verifyCommittedGateEvidence,
  type GateDecisionRpc,
  type GateEvidenceArtifact,
  type RenderedGateEvidence,
} from '../prospective-gate-evidence'
import {
  CYCLE_ID,
  finalEvidenceFixture,
  safetyEvidenceFixture,
} from './prospective-gate-evidence.fixture'

const repositories: string[] = []
const git = (repositoryPath: string, args: readonly string[]): string => (
  execFileSync('git', [...args], { cwd: repositoryPath, encoding: 'utf8' }).trim()
)

const commitEvidence = (
  rendered: RenderedGateEvidence<GateEvidenceArtifact>,
  rawCanonicalJson = rendered.canonicalJson,
) => {
  const repositoryPath = mkdtempSync(join(tmpdir(), 'tli-gate-evidence-'))
  repositories.push(repositoryPath)
  git(repositoryPath, ['init', '--quiet'])
  git(repositoryPath, ['config', 'user.email', 'gate@example.invalid'])
  git(repositoryPath, ['config', 'user.name', 'Gate Test'])

  const evidencePath = join(repositoryPath, ...rendered.repoRelativePath.split('/'))
  const verifierPath = join(repositoryPath, 'scripts/tli/learn/prospective-gate-evidence-git.ts')
  mkdirSync(dirname(evidencePath), { recursive: true })
  mkdirSync(dirname(verifierPath), { recursive: true })
  writeFileSync(evidencePath, rawCanonicalJson, 'utf8')
  writeFileSync(
    verifierPath,
    readFileSync(new URL('../prospective-gate-evidence-git.ts', import.meta.url)),
  )
  git(repositoryPath, ['add', '.'])
  git(repositoryPath, ['commit', '--quiet', '-m', 'test evidence'])
  return {
    repositoryPath,
    evidencePath,
    verifierPath,
    commitSha: git(repositoryPath, ['rev-parse', 'HEAD']),
  }
}

afterEach(() => {
  for (const repositoryPath of repositories.splice(0)) rmSync(repositoryPath, { recursive: true, force: true })
})

describe('committed prospective gate evidence', () => {
  it('verifies exact commit:path and worktree bytes into the exact 10-key envelope', () => {
    const rendered = renderSafetyReportArtifact(safetyEvidenceFixture())
    const repository = commitEvidence(rendered)
    const verified = verifyCommittedGateEvidence({
      kind: 'safety', cycleId: CYCLE_ID, commitSha: repository.commitSha,
      repositoryPath: repository.repositoryPath,
    })

    expect(Object.keys(verified.envelope).sort()).toEqual([
      'artifact_key', 'artifact_type', 'canonical_json', 'content_sha256', 'git_blob_sha',
      'git_commit_sha', 'repo_relative_path', 'verified_at', 'verifier_code_sha', 'verifier_version',
    ])
    expect(evidenceEnvelopeSchema.parse(verified.envelope)).toEqual(verified.envelope)
    expect(verified.envelope).toMatchObject({
      artifact_type: 'safety_report', artifact_key: 'singleton',
      canonical_json: rendered.canonicalJson, content_sha256: rendered.contentSha256,
      git_commit_sha: repository.commitSha,
      git_blob_sha: git(repository.repositoryPath, ['rev-parse', `HEAD:${rendered.repoRelativePath}`]),
      verifier_version: GATE_EVIDENCE_VERIFIER_VERSION,
    })
    expect(verified.envelope.verifier_code_sha).toBe(
      createHash('sha256').update(readFileSync(repository.verifierPath)).digest('hex'),
    )
    expect(new Date(verified.envelope.verified_at).toISOString()).toBe(verified.envelope.verified_at)
    expect(verified.artifact.decision).toBe('pass')
  })

  it('rejects evidence or verifier source changed after the evidence commit', () => {
    const rendered = renderSafetyReportArtifact(safetyEvidenceFixture())
    const evidenceRepository = commitEvidence(rendered)
    writeFileSync(evidenceRepository.evidencePath, `${rendered.canonicalJson}\n`, 'utf8')
    expect(() => verifyCommittedGateEvidence({
      kind: 'safety', cycleId: CYCLE_ID, commitSha: evidenceRepository.commitSha,
      repositoryPath: evidenceRepository.repositoryPath,
    })).toThrow(/worktree evidence bytes/i)

    const verifierRepository = commitEvidence(rendered)
    writeFileSync(verifierRepository.verifierPath, 'tampered', 'utf8')
    expect(() => verifyCommittedGateEvidence({
      kind: 'safety', cycleId: CYCLE_ID, commitSha: verifierRepository.commitSha,
      repositoryPath: verifierRepository.repositoryPath,
    })).toThrow(/verifier source bytes/i)
  })

  it('rejects committed noncanonical or schema-unknown safety bytes', () => {
    const rendered = renderSafetyReportArtifact(safetyEvidenceFixture())
    const withUnknownField = `${rendered.canonicalJson.slice(0, -1)},\"baseline_delta\":0}`
    const repository = commitEvidence(rendered, withUnknownField)

    expect(() => verifyCommittedGateEvidence({
      kind: 'safety', cycleId: CYCLE_ID, commitSha: repository.commitSha,
      repositoryPath: repository.repositoryPath,
    })).toThrow()
  })

  it('derives safety p_pass only from the parsed committed decision and calls the exact RPC', async () => {
    const rendered = renderSafetyReportArtifact(safetyEvidenceFixture())
    const repository = commitEvidence(rendered)
    const calls: { readonly name: string; readonly params: Readonly<Record<string, unknown>> }[] = []
    const rpc: GateDecisionRpc = async (name, params) => {
      calls.push({ name, params })
      return { data: CYCLE_ID, error: null }
    }
    const untrustedInput = {
      cycleId: CYCLE_ID, commitSha: repository.commitSha,
      repositoryPath: repository.repositoryPath, pPass: false,
    }

    const result = await recordCommittedSafetyDecision(untrustedInput, rpc)

    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({
      name: RECORD_TLI_SAFETY_DECISION_RPC,
      params: { p_cycle_id: CYCLE_ID, p_pass: true },
    })
    expect(Object.keys(calls[0].params.p_evidence_envelope as object)).toHaveLength(10)
    expect(result).toMatchObject({ decision: 'pass', pass: true, cycleId: CYCLE_ID })
  })

  it('derives final rejection from committed bytes and calls only record_tli_final_decision', async () => {
    const rendered = renderFinalDecisionArtifact(finalEvidenceFixture('reject'))
    const repository = commitEvidence(rendered)
    const calls: { readonly name: string; readonly params: Readonly<Record<string, unknown>> }[] = []
    const rpc: GateDecisionRpc = async (name, params) => {
      calls.push({ name, params })
      return { data: CYCLE_ID, error: null }
    }

    const result = await recordCommittedFinalDecision({
      cycleId: CYCLE_ID, commitSha: repository.commitSha, repositoryPath: repository.repositoryPath,
    }, rpc)

    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({
      name: RECORD_TLI_FINAL_DECISION_RPC,
      params: { p_cycle_id: CYCLE_ID, p_pass: false },
    })
    expect(result).toMatchObject({ decision: 'reject', pass: false, cycleId: CYCLE_ID })
    expect(JSON.stringify(calls)).not.toContain('promote_tli_internal')
  })

  it('fails closed on an RPC error or a mismatched returned cycle', async () => {
    const rendered = renderSafetyReportArtifact(safetyEvidenceFixture())
    const repository = commitEvidence(rendered)
    const input = {
      cycleId: CYCLE_ID, commitSha: repository.commitSha, repositoryPath: repository.repositoryPath,
    }

    await expect(recordCommittedSafetyDecision(input, async () => ({
      data: null, error: { message: 'denied' },
    }))).rejects.toThrow(/denied/)
    await expect(recordCommittedSafetyDecision(input, async () => ({
      data: '20000000-0000-4000-8000-000000000014', error: null,
    }))).rejects.toThrow(/cycle/i)
  })

  it('accepts only sha1 and sha256 Git object formats', () => {
    expect(() => assertSupportedEvidenceGitObjectFormat('sha1')).not.toThrow()
    expect(() => assertSupportedEvidenceGitObjectFormat('sha256')).not.toThrow()
    expect(() => assertSupportedEvidenceGitObjectFormat('unknown')).toThrow(/object format/i)
  })
})
