import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { canonicalJsonV1 } from '../../../lib/tli/canonical-json-v1'
import {
  finalDecisionArtifactSchema,
  safetyReportArtifactSchema,
  type FinalDecisionArtifact,
  type SafetyReportArtifact,
} from './prospective-gate-evidence-contract'
import { assertGateEvidenceSemantics } from './prospective-gate-evidence-validate'

export type GateEvidenceKind = 'safety' | 'final'

export type RenderedGateEvidence<Artifact> = {
  readonly artifactType: 'safety_report' | 'final_decision'
  readonly artifactKey: 'singleton'
  readonly repoRelativePath: string
  readonly artifact: Artifact
  readonly canonicalJson: string
  readonly canonicalBytes: Buffer
  readonly contentSha256: string
}

export const gateEvidenceRepoPath = (cycleId: string, kind: GateEvidenceKind): string => (
  `docs/evidence/tli-v3-scientific-rebuild/${cycleId}/${kind === 'safety' ? 'safety-report' : 'final-decision'}.json`
)

const render = <Artifact extends SafetyReportArtifact | FinalDecisionArtifact>(input: {
  readonly artifact: Artifact
  readonly kind: GateEvidenceKind
}): RenderedGateEvidence<Artifact> => {
  assertGateEvidenceSemantics(input.artifact)
  const canonicalJson = canonicalJsonV1(input.artifact)
  const canonicalBytes = Buffer.from(canonicalJson, 'utf8')
  return {
    artifactType: input.kind === 'safety' ? 'safety_report' : 'final_decision',
    artifactKey: 'singleton',
    repoRelativePath: gateEvidenceRepoPath(input.artifact.cycle_id, input.kind),
    artifact: input.artifact,
    canonicalJson,
    canonicalBytes,
    contentSha256: createHash('sha256').update(canonicalBytes).digest('hex'),
  }
}

export const renderSafetyReportArtifact = (value: unknown): RenderedGateEvidence<SafetyReportArtifact> => (
  render({ artifact: safetyReportArtifactSchema.parse(value), kind: 'safety' })
)

export const renderFinalDecisionArtifact = (value: unknown): RenderedGateEvidence<FinalDecisionArtifact> => (
  render({ artifact: finalDecisionArtifactSchema.parse(value), kind: 'final' })
)

export const writeRenderedGateEvidence = (
  rendered: RenderedGateEvidence<SafetyReportArtifact | FinalDecisionArtifact>,
  repositoryPath = process.cwd(),
): string => {
  const target = join(repositoryPath, ...rendered.repoRelativePath.split('/'))
  mkdirSync(dirname(target), { recursive: true })
  if (existsSync(target)) {
    if (!readFileSync(target).equals(rendered.canonicalBytes)) {
      throw new Error(`existing gate evidence differs from immutable canonical bytes: ${rendered.repoRelativePath}`)
    }
    return target
  }
  writeFileSync(target, rendered.canonicalBytes, { flag: 'wx' })
  return target
}
