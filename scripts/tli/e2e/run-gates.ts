import { assembleProspectiveGateInput } from '../learn/prospective-gate-input-assembly'
import { buildFinalPromotionGateInput } from '../learn/prospective-gate-input-final'
import { evaluateFinalPromotionGate } from '../learn/prospective-gate-final'
import { evaluateSafetyCheckpoint } from '../learn/prospective-gate-metrics'
import { runProspectiveGateStatistics } from '../learn/prospective-gate-statistics'
import { executeProspectiveCheckpoint, recordProspectiveDecision } from '../learn/run-weekly-learn'
import type { CycleProbe } from './contracts'
import type { FreezeEvidenceEnvelope } from './cycle-freeze-contract'
import { buildGateSource } from './fixture-gate-source'
import { experimentOriginId, scientificPredictionId } from './fixture-identities'
import type { FixtureOriginStack } from './fixture-origins'
import type { ProspectivePanel } from './prospective-panel'

type FinalResult = ReturnType<typeof evaluateFinalPromotionGate>

export interface GateRun {
  readonly probes: readonly CycleProbe[]
  readonly final16: FinalResult
  readonly final24: FinalResult
  readonly recording16: string
  readonly recording24: string
  readonly registryMutationCount: number
  readonly primaryCycleId: string
  readonly primaryIdentityMismatchCount: number
}

interface GateFixtureContext {
  readonly stack: FixtureOriginStack
  readonly panel: ProspectivePanel
  readonly candidateModelSha256: string
  readonly calibrationArtifactSha256: string
  readonly datasetManifestSha256: string
  readonly primaryCycleId: string
  readonly primaryCycleEvidence: readonly FreezeEvidenceEnvelope[]
}

const waitingProbe = async (input: GateFixtureContext & {
  readonly plannedOrigins: 16 | 24
  readonly observedOrigins: number
  readonly safetyPassed: boolean
}): Promise<CycleProbe> => {
  const bundle = assembleProspectiveGateInput(buildGateSource(input))
  const execution = await executeProspectiveCheckpoint({
    lifecycle: bundle.lifecycle,
    safetyInput: null,
    finalInput: null,
  }, {
    evaluateSafety: () => {
      throw new Error(`safety gate ran prematurely at ${input.observedOrigins} origins`)
    },
    evaluateFinal: () => {
      throw new Error(`final gate ran prematurely at ${input.observedOrigins} origins`)
    },
  })
  if ('evaluation' in execution || execution.checkpoint.kind !== 'insufficient_origins') {
    throw new Error(`expected insufficient_origins, received ${execution.checkpoint.kind}`)
  }
  return {
    plannedOrigins: input.plannedOrigins,
    observedOrigins: input.observedOrigins,
    checkpoint: execution.checkpoint.kind,
    action: 'no_promotion',
    decision: null,
  }
}

async function safetyProbe(input: GateFixtureContext): Promise<CycleProbe> {
  const bundle = assembleProspectiveGateInput(buildGateSource({
    ...input,
    plannedOrigins: 16,
    observedOrigins: 8,
    safetyPassed: false,
  }))
  if (!('safetyInput' in bundle)) throw new Error(`expected safety_due, received ${bundle.checkpoint.kind}`)
  const execution = await executeProspectiveCheckpoint({
    lifecycle: bundle.lifecycle,
    safetyInput: bundle.safetyInput,
    finalInput: null,
  }, {
    evaluateSafety: evaluateSafetyCheckpoint,
    evaluateFinal: () => {
      throw new Error('final gate must not run at eight origins')
    },
  })
  if (!('evaluation' in execution)) throw new Error('safety evaluation was not invoked')
  return {
    plannedOrigins: 16,
    observedOrigins: 8,
    checkpoint: execution.checkpoint.kind,
    action: execution.evaluation.action,
    decision: execution.evaluation.decision,
  }
}

async function finalProbe(input: GateFixtureContext & {
  readonly plannedOrigins: 16 | 24
  readonly workDir: string
}): Promise<{
  readonly probe: CycleProbe
  readonly result: FinalResult
  readonly recording: string
  readonly registryMutationCount: number
}> {
  const bundle = assembleProspectiveGateInput(buildGateSource({
    ...input,
    observedOrigins: input.plannedOrigins,
    safetyPassed: true,
  }))
  if (!('finalDataset' in bundle)) throw new Error(`expected final_due, received ${bundle.checkpoint.kind}`)
  let finalInvocationCount = 0
  const execution = await executeProspectiveCheckpoint({
    lifecycle: bundle.lifecycle,
    safetyInput: null,
    finalInput: bundle.finalDataset,
  }, {
    evaluateSafety: () => {
      throw new Error('safety gate must not rerun at final')
    },
    evaluateFinal: (dataset) => {
      finalInvocationCount += 1
      const receipt = runProspectiveGateStatistics({
        cycleId: dataset.cycleId,
        gateInputSha256: dataset.gateInputSha256,
        eligibleOrigins: dataset.eligibleOrigins.map((origin) => ({
          originDate: origin.originDate,
          regime: origin.regime,
        })),
        rows: dataset.rows,
        workDir: input.workDir,
      })
      return evaluateFinalPromotionGate(buildFinalPromotionGateInput(dataset, receipt.bootstrap))
    },
  })
  if (!('evaluation' in execution) || finalInvocationCount !== 1) {
    throw new Error(`final gate invocation count must be one, received ${finalInvocationCount}`)
  }
  const result = execution.evaluation
  const decision = result.decision === 'pass' ? {
    kind: 'final' as const,
    cycleId: result.cycleId,
    decision: 'pass' as const,
    action: 'would_promote' as const,
  } : {
    kind: 'final' as const,
    cycleId: result.cycleId,
    decision: 'reject' as const,
    action: 'keep_champion' as const,
  }
  let registryMutationCount = 0
  const recording = await recordProspectiveDecision({
    dryRun: true,
    decision,
  }, async () => {
    registryMutationCount += 1
    return { recorded: true }
  })
  return {
    probe: {
      plannedOrigins: input.plannedOrigins,
      observedOrigins: input.plannedOrigins,
      checkpoint: execution.checkpoint.kind,
      action: result.action,
      decision: result.decision,
    },
    result,
    recording: recording.action,
    registryMutationCount,
  }
}

export async function runFrozenGateFixtures(input: {
  readonly stack: FixtureOriginStack
  readonly panel: ProspectivePanel
  readonly candidateModelSha256: string
  readonly calibrationArtifactSha256: string
  readonly datasetManifestSha256: string
  readonly primaryCycleId: string
  readonly primaryCycleEvidence: readonly FreezeEvidenceEnvelope[]
  readonly workDir: string
}): Promise<GateRun> {
  const safety = await safetyProbe(input)
  const at15 = await waitingProbe({ ...input, plannedOrigins: 16, observedOrigins: 15, safetyPassed: true })
  const at23 = await waitingProbe({ ...input, plannedOrigins: 24, observedOrigins: 23, safetyPassed: true })
  const at16 = await finalProbe({ ...input, plannedOrigins: 16, workDir: `${input.workDir}/planned-16` })
  const at24 = await finalProbe({ ...input, plannedOrigins: 24, workDir: `${input.workDir}/planned-24` })
  const primarySource = buildGateSource({
    ...input,
    plannedOrigins: 24,
    observedOrigins: 24,
    safetyPassed: true,
  })
  const primaryIdentityMismatchCount = primarySource.predictions.filter((prediction) => {
    const origin = primarySource.origins.find((row) => row.id === prediction.experiment_origin_manifest_id)
    if (origin === undefined || prediction.experiment_cycle_id !== input.primaryCycleId) return true
    const expectedOriginId = experimentOriginId(input.primaryCycleId, prediction.prediction_date)
    return origin.id !== expectedOriginId
      || prediction.id !== scientificPredictionId(expectedOriginId, prediction.theme_id, prediction.scientific_prediction_role)
  }).length
  return {
    probes: [safety, at15, at16.probe, at23, at24.probe],
    final16: at16.result,
    final24: at24.result,
    recording16: at16.recording,
    recording24: at24.recording,
    registryMutationCount: at16.registryMutationCount + at24.registryMutationCount,
    primaryCycleId: input.primaryCycleId,
    primaryIdentityMismatchCount,
  }
}
