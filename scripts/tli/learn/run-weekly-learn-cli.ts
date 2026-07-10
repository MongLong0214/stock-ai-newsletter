import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { canonicalJsonV1 } from '../../../lib/tli/canonical-json-v1'
import { parseProspectiveGateCli, PROSPECTIVE_GATE_CLI_USAGE } from './prospective-gate-cli-contract'
import { buildFinalEvidenceArtifact, buildSafetyEvidenceArtifact } from './prospective-gate-evidence-build'
import { verifyCommittedGateEvidence } from './prospective-gate-evidence-git'
import {
  recordCommittedFinalDecision,
  recordCommittedSafetyDecision,
  type GateDecisionRpc,
} from './prospective-gate-evidence-record'
import {
  renderFinalDecisionArtifact,
  renderSafetyReportArtifact,
  writeRenderedGateEvidence,
} from './prospective-gate-evidence-render'
import { buildFinalPromotionGateInput } from './prospective-gate-input-final'
import { evaluateFinalPromotionGate } from './prospective-gate-final'
import { evaluateSafetyCheckpoint } from './prospective-gate-metrics'
import { runProspectiveGateStatistics } from './prospective-gate-statistics'
import { executeProspectiveCheckpoint, recordProspectiveDecision } from './run-weekly-learn'

const emit = (value: unknown, outputPath: string | null): void => {
  const json = canonicalJsonV1(value)
  if (outputPath !== null) {
    mkdirSync(dirname(outputPath), { recursive: true })
    writeFileSync(outputPath, json, { encoding: 'utf8' })
  }
  console.log(json)
}

const loadBundle = async (cycleId: string) => {
  const { loadProspectiveGateInputFromDb } = await import('./prospective-gate-input-db')
  return loadProspectiveGateInputFromDb({ cycleId })
}

const inspect = async (cycleId: string | null) => {
  const resolvedCycleId = cycleId ?? await (async () => {
    const { loadRunningProspectiveCycleIdFromDb } = await import('./prospective-gate-input-db')
    return loadRunningProspectiveCycleIdFromDb()
  })()
  if (resolvedCycleId === null) return { command: 'inspect', cycle_id: null, checkpoint: { kind: 'no_running_cycle' } }
  const bundle = await loadBundle(resolvedCycleId)
  return {
    command: 'inspect', cycle_id: resolvedCycleId, checkpoint: bundle.checkpoint,
    critical_incident_count: bundle.incidents.length,
  }
}

const renderSafety = async (cycleId: string) => {
  const bundle = await loadBundle(cycleId)
  if (bundle.checkpoint.kind !== 'safety_due' || !('safetyInput' in bundle)) {
    throw new TypeError(`safety decision is not due: ${bundle.checkpoint.kind}`)
  }
  const execution = await executeProspectiveCheckpoint(
    { lifecycle: bundle.lifecycle, safetyInput: bundle.safetyInput, finalInput: null },
    {
      evaluateSafety: evaluateSafetyCheckpoint,
      evaluateFinal: () => { throw new TypeError('final evaluator reached from safety checkpoint') },
    },
  )
  if (execution.checkpoint.kind !== 'safety_due' || !('evaluation' in execution)) {
    throw new TypeError('safety checkpoint changed during evaluation')
  }
  const rendered = renderSafetyReportArtifact(buildSafetyEvidenceArtifact({
    evaluation: execution.evaluation,
    incidents: bundle.incidents,
  }))
  writeRenderedGateEvidence(rendered)
  return {
    command: 'render-decision', kind: 'safety', cycle_id: cycleId,
    decision: rendered.artifact.decision, action: execution.evaluation.action,
    repo_relative_path: rendered.repoRelativePath, content_sha256: rendered.contentSha256,
  }
}

const renderFinal = async (cycleId: string, workDir: string | null) => {
  const bundle = await loadBundle(cycleId)
  if (bundle.checkpoint.kind !== 'final_due' || !('finalDataset' in bundle)) {
    throw new TypeError(`final decision is not due: ${bundle.checkpoint.kind}`)
  }
  const receipt = runProspectiveGateStatistics({
    cycleId,
    gateInputSha256: bundle.finalDataset.gateInputSha256,
    eligibleOrigins: bundle.finalDataset.eligibleOrigins,
    rows: bundle.finalDataset.rows,
    workDir: workDir ?? join(process.env.RUNNER_TEMP ?? '.omo/prospective-gate', cycleId),
  })
  const finalInput = buildFinalPromotionGateInput(bundle.finalDataset, receipt.bootstrap)
  const execution = await executeProspectiveCheckpoint(
    { lifecycle: bundle.lifecycle, safetyInput: null, finalInput },
    {
      evaluateSafety: () => { throw new TypeError('safety evaluator reached from final checkpoint') },
      evaluateFinal: evaluateFinalPromotionGate,
    },
  )
  if (execution.checkpoint.kind !== 'final_due' || !('evaluation' in execution)) {
    throw new TypeError('final checkpoint changed during evaluation')
  }
  const rendered = renderFinalDecisionArtifact(buildFinalEvidenceArtifact({
    evaluation: execution.evaluation,
    dataset: bundle.finalDataset,
    bootstrapReceipt: receipt,
  }))
  writeRenderedGateEvidence(rendered)
  return {
    command: 'render-decision', kind: 'final', cycle_id: cycleId,
    decision: rendered.artifact.decision, action: execution.evaluation.action,
    repo_relative_path: rendered.repoRelativePath, content_sha256: rendered.contentSha256,
  }
}

const rpcClient = async (): Promise<GateDecisionRpc> => {
  const { supabaseAdmin } = await import('../shared/supabase-admin')
  return async (name, args) => {
    const { data, error } = await supabaseAdmin.rpc(name, args)
    return { data, error: error === null ? null : { message: error.message } }
  }
}

const record = async (input: {
  readonly cycleId: string
  readonly kind: 'safety' | 'final'
  readonly evidenceCommit: string
  readonly dryRun: boolean
}) => {
  const verified = verifyCommittedGateEvidence({
    cycleId: input.cycleId, kind: input.kind, commitSha: input.evidenceCommit,
  })
  const decision = input.kind === 'safety'
    ? verified.artifact.decision === 'pass'
      ? { kind: 'safety' as const, cycleId: input.cycleId, decision: 'pass' as const, action: 'safety_only' as const }
      : { kind: 'safety' as const, cycleId: input.cycleId, decision: 'safety_hold' as const, action: 'safety_hold' as const }
    : verified.artifact.decision === 'pass'
      ? { kind: 'final' as const, cycleId: input.cycleId, decision: 'pass' as const, action: 'would_promote' as const }
      : { kind: 'final' as const, cycleId: input.cycleId, decision: 'reject' as const, action: 'keep_champion' as const }
  const result = await recordProspectiveDecision({ dryRun: input.dryRun, decision }, async () => {
    const rpc = await rpcClient()
    return input.kind === 'safety'
      ? recordCommittedSafetyDecision({ cycleId: input.cycleId, commitSha: input.evidenceCommit }, rpc)
      : recordCommittedFinalDecision({ cycleId: input.cycleId, commitSha: input.evidenceCommit }, rpc)
  })
  return {
    command: 'record-decision', kind: input.kind, cycle_id: input.cycleId,
    evidence_commit: input.evidenceCommit, decision: decision.decision, action: result.action,
  }
}

export async function runWeeklyLearnCli(args: readonly string[] = process.argv.slice(2)): Promise<void> {
  const parsed = parseProspectiveGateCli(args)
  if (parsed.command === 'help') {
    console.log(PROSPECTIVE_GATE_CLI_USAGE)
    return
  }
  if (parsed.command === 'inspect') {
    emit(await inspect(parsed.cycleId), parsed.jsonOutput)
    return
  }
  if (parsed.command === 'render-decision') {
    emit(parsed.kind === 'safety'
      ? await renderSafety(parsed.cycleId)
      : await renderFinal(parsed.cycleId, parsed.workDir), parsed.jsonOutput)
    return
  }
  emit(await record(parsed), parsed.jsonOutput)
}
