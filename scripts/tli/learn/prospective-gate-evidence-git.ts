import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { z } from 'zod'

import { parseCanonicalJsonV1 } from '../../../lib/tli/canonical-json-v1'
import {
  finalDecisionArtifactSchema,
  safetyReportArtifactSchema,
  type GateEvidenceArtifact,
} from './prospective-gate-evidence-contract'
import { gateEvidenceRepoPath, type GateEvidenceKind } from './prospective-gate-evidence-render'
import { assertGateEvidenceSemantics } from './prospective-gate-evidence-validate'

export const GATE_EVIDENCE_VERIFIER_VERSION = 'tli-git-gate-evidence-verifier-v1'
export const GATE_EVIDENCE_VERIFIER_REPO_PATH = 'scripts/tli/learn/prospective-gate-evidence-git.ts'

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/)
const gitObjectIdSchema = z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/)
const canonicalUuidSchema = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
)

export const evidenceEnvelopeSchema = z.object({
  artifact_type: z.enum(['safety_report', 'final_decision']),
  artifact_key: z.literal('singleton'),
  content_sha256: sha256Schema,
  canonical_json: z.string().min(2),
  git_commit_sha: gitObjectIdSchema,
  git_blob_sha: gitObjectIdSchema,
  repo_relative_path: z.string().min(1).max(512),
  verifier_version: z.literal(GATE_EVIDENCE_VERIFIER_VERSION),
  verifier_code_sha: sha256Schema,
  verified_at: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
}).strict()

export type GateEvidenceEnvelope = z.infer<typeof evidenceEnvelopeSchema>

const git = (repositoryPath: string, args: readonly string[]): Buffer => execFileSync(
  'git', [...args], { cwd: repositoryPath, maxBuffer: 16 * 1024 * 1024 },
)
const text = (value: Buffer): string => value.toString('utf8').trim()
const sha256 = (value: Buffer): string => createHash('sha256').update(value).digest('hex')

export const assertSupportedEvidenceGitObjectFormat = (objectFormat: string): void => {
  if (objectFormat !== 'sha1' && objectFormat !== 'sha256') {
    throw new TypeError(`unsupported Git object format: ${objectFormat}`)
  }
}

const readExactCommittedBytes = (input: {
  readonly repositoryPath: string
  readonly commitSha: string
  readonly repoRelativePath: string
  readonly label: string
}): { readonly bytes: Buffer; readonly blobSha: string } => {
  const objectSpec = `${input.commitSha}:${input.repoRelativePath}`
  const bytes = git(input.repositoryPath, ['cat-file', 'blob', objectSpec])
  const worktreeBytes = readFileSync(join(input.repositoryPath, ...input.repoRelativePath.split('/')))
  if (!worktreeBytes.equals(bytes)) throw new TypeError(`worktree ${input.label} bytes differ from committed bytes`)
  return { bytes, blobSha: text(git(input.repositoryPath, ['rev-parse', objectSpec])) }
}

export function verifyCommittedGateEvidence(input: {
  readonly cycleId: string
  readonly kind: GateEvidenceKind
  readonly commitSha: string
  readonly repositoryPath?: string
}): { readonly artifact: GateEvidenceArtifact; readonly envelope: GateEvidenceEnvelope } {
  canonicalUuidSchema.parse(input.cycleId)
  gitObjectIdSchema.parse(input.commitSha)
  const repositoryPath = input.repositoryPath ?? process.cwd()
  const objectFormat = text(git(repositoryPath, ['rev-parse', '--show-object-format']))
  assertSupportedEvidenceGitObjectFormat(objectFormat)
  const commitSha = text(git(repositoryPath, ['rev-parse', `${input.commitSha}^{commit}`]))
  if (commitSha !== input.commitSha) throw new TypeError('evidence commit did not resolve exactly')
  const repoRelativePath = gateEvidenceRepoPath(input.cycleId, input.kind)
  const evidence = readExactCommittedBytes({
    repositoryPath, commitSha, repoRelativePath, label: 'evidence',
  })
  const expectedObjectLength = objectFormat === 'sha1' ? 40 : 64
  if (evidence.blobSha.length !== expectedObjectLength) {
    throw new TypeError('evidence blob id does not match the repository object format')
  }
  const verifier = readExactCommittedBytes({
    repositoryPath,
    commitSha,
    repoRelativePath: GATE_EVIDENCE_VERIFIER_REPO_PATH,
    label: 'verifier source',
  })
  const runningVerifierBytes = readFileSync(new URL(import.meta.url))
  if (!runningVerifierBytes.equals(verifier.bytes)) {
    throw new TypeError('running verifier source bytes differ from committed bytes')
  }
  const canonicalJson = evidence.bytes.toString('utf8')
  const parsed = parseCanonicalJsonV1(canonicalJson)
  const artifact = input.kind === 'safety'
    ? safetyReportArtifactSchema.parse(parsed)
    : finalDecisionArtifactSchema.parse(parsed)
  assertGateEvidenceSemantics(artifact)
  if (artifact.cycle_id !== input.cycleId) throw new TypeError('committed evidence cycle id mismatch')
  const envelope = evidenceEnvelopeSchema.parse({
    artifact_type: input.kind === 'safety' ? 'safety_report' : 'final_decision',
    artifact_key: 'singleton',
    content_sha256: sha256(evidence.bytes),
    canonical_json: canonicalJson,
    git_commit_sha: commitSha,
    git_blob_sha: evidence.blobSha,
    repo_relative_path: repoRelativePath,
    verifier_version: GATE_EVIDENCE_VERIFIER_VERSION,
    verifier_code_sha: sha256(verifier.bytes),
    verified_at: new Date().toISOString(),
  })
  if (envelope.repo_relative_path !== repoRelativePath) throw new TypeError('evidence repository path mismatch')
  return { artifact, envelope }
}
