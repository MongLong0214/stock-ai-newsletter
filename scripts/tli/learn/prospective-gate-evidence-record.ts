import type { GateEvidenceKind } from './prospective-gate-evidence-render'
import {
  verifyCommittedGateEvidence,
  type GateEvidenceEnvelope,
} from './prospective-gate-evidence-attestation'

export const SAFETY_DECISION_RPC = 'record_tli_safety_decision'
export const FINAL_DECISION_RPC = 'record_tli_final_decision'
export const RECORD_TLI_SAFETY_DECISION_RPC = SAFETY_DECISION_RPC
export const RECORD_TLI_FINAL_DECISION_RPC = FINAL_DECISION_RPC

type GateDecisionRpcParams = {
  readonly p_cycle_id: string
  readonly p_pass: boolean
  readonly p_evidence_envelope: GateEvidenceEnvelope
}

export type GateDecisionRpc = (
  name: typeof SAFETY_DECISION_RPC | typeof FINAL_DECISION_RPC,
  args: GateDecisionRpcParams,
) => PromiseLike<{ readonly data: unknown; readonly error: { readonly message: string } | null }>

export type GateDecisionRpcClient = { readonly rpc: GateDecisionRpc }

type CommittedGateDecisionInput = {
  readonly cycleId: string
  readonly commitSha: string
  readonly repositoryPath?: string
}

export async function recordCommittedGateDecision(input: {
  readonly cycleId: string
  readonly kind: GateEvidenceKind
  readonly commitSha: string
  readonly repositoryPath?: string
}, client: GateDecisionRpcClient): Promise<{
  readonly cycleId: string
  readonly kind: GateEvidenceKind
  readonly decision: 'pass' | 'safety_hold' | 'reject'
  readonly pass: boolean
  readonly rpc: typeof SAFETY_DECISION_RPC | typeof FINAL_DECISION_RPC
  readonly result: unknown
}> {
  const verified = verifyCommittedGateEvidence(input)
  const rpc = input.kind === 'safety' ? SAFETY_DECISION_RPC : FINAL_DECISION_RPC
  const decision = verified.artifact.decision
  const pass = decision === 'pass'
  const { data, error } = await client.rpc(rpc, {
    p_cycle_id: input.cycleId,
    p_pass: pass,
    p_evidence_envelope: verified.envelope,
  })
  if (error) throw new Error(`${rpc} failed: ${error.message}`)
  if (typeof data !== 'string' || data !== input.cycleId) {
    throw new Error(`${rpc} returned a mismatched cycle id`)
  }
  return { cycleId: input.cycleId, kind: input.kind, decision, pass, rpc, result: data }
}

export const recordCommittedSafetyDecision = (
  input: CommittedGateDecisionInput,
  rpc: GateDecisionRpc,
) => recordCommittedGateDecision({ ...input, kind: 'safety' }, { rpc })

export const recordCommittedFinalDecision = (
  input: CommittedGateDecisionInput,
  rpc: GateDecisionRpc,
) => recordCommittedGateDecision({ ...input, kind: 'final' }, { rpc })
