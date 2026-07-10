import { execFileSync } from 'node:child_process'

import { buildConfirmatoryFeatureVector } from '../../../lib/tli/features/build-confirmatory-features'
import type { DryRunCliArgs } from './cli-args'
import {
  emptyLeakageAudit,
  TLI_E2E_CONTAINER_NAME,
  type DryRunReport,
  type DryRunStage,
  type ExactFiveAudit,
  type LeakageAudit,
} from './contracts'
import { buildCycleFreezeContract, buildStudyLockContract } from './cycle-freeze-contract'
import { buildFixtureOriginStack } from './fixture-origins'
import { buildTrainingFixtureData } from './fixture-study-data'
import {
  auditDataset,
  mergeDatasetAudit,
  mergeProspectiveAudit,
} from './pipeline-audit'
import {
  completedStages,
  CONTRACT_DEFECTS,
  DRY_RUN_RISKS,
} from './pipeline-report'
import {
  buildMetrics,
  cycleContractsSatisfied,
  cycleFreezeStage,
  datasetStage,
  gateExpected,
  gateStage,
  gtaStage,
  originsStage,
  panelStages,
  studyLockStage,
  trainingStage,
  featuresStage,
} from './pipeline-stages'
import { buildAndScoreProspectivePanel } from './prospective-panel'
import { runFrozenGateFixtures } from './run-gates'
import { ScratchPostgres } from './scratch-postgres'
import { trainAndEvaluate } from './train-evaluate'

class ExpectedFailClosed extends Error {
  readonly name = 'ExpectedFailClosed'
}

export interface DryRunPipelineDependencies {
  readonly scratchPostgres?: ScratchPostgres
}

export async function runDryRunPipeline(
  args: DryRunCliArgs,
  dependencies: DryRunPipelineDependencies = {},
): Promise<DryRunReport> {
  const startedAt = new Date().toISOString()
  const stages: DryRunStage[] = []
  const errors: string[] = []
  let audit: LeakageAudit = emptyLeakageAudit()
  let exactFive: ExactFiveAudit = { eligible: 0, total: 0, rate: 0 }
  let cycleProbes: DryRunReport['cycleProbes'] = []
  let metrics: Readonly<Record<string, unknown>> = {}
  let status: DryRunReport['status'] = 'failed'
  let expectedSatisfied = false
  let exitCode = 1
  const scratch = dependencies.scratchPostgres ?? new ScratchPostgres()

  try {
    const stack = await buildFixtureOriginStack()
    const scratchReceipt = scratch.start(args.prodSchemaPath)
    stages.push({ name: 'scratch_postgres', status: 'pass', summary: { ...scratchReceipt } })
    const gitCommitSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
    const verifiedAt = new Date(execFileSync(
      'git', ['show', '-s', '--format=%cI', 'HEAD'], { encoding: 'utf8' },
    ).trim()).toISOString()
    const studyContract = buildStudyLockContract({ stack, gitCommitSha })
    const studyReceipt = scratch.seedStudyLock(studyContract)
    const lockStage = studyLockStage(stack, studyReceipt)
    stages.push(lockStage)
    if (lockStage.status !== 'pass') throw new Error('study contract was not locked before the first origin')
    stages.push(originsStage(stack))

    const mode = args.fixture === 'no-signal' ? 'no_signal' : 'known_signal'
    const data = await buildTrainingFixtureData({
      stack,
      mode,
      omitSourceCompletion: args.fixture === 'missing-source',
    })
    const datasetAudit = auditDataset(data, stack)
    exactFive = datasetAudit.exactFive
    audit = mergeDatasetAudit(audit, datasetAudit)
    stages.push(gtaStage(exactFive), datasetStage({ fixture: args.fixture, data, audit: datasetAudit }))
    if (args.fixture === 'missing-source') {
      if (datasetAudit.missing !== 1) {
        throw new Error(`missing-source fixture expected exactly one missing row, received ${datasetAudit.missing}`)
      }
      throw new ExpectedFailClosed('missing immutable label-source snapshot excluded one confirmatory row')
    }
    if (datasetAudit.missing !== 0
      || datasetAudit.duplicate !== 0
      || !datasetAudit.repeatBytesEqual
      || !datasetAudit.repeatManifestHashEqual
      || datasetAudit.mixedStudy !== 0
      || exactFive.rate !== 1) {
      throw new Error('confirmatory dataset did not satisfy deterministic single-study cardinality')
    }

    const featureSnapshots = data.featureInputs.map(buildConfirmatoryFeatureVector)
    const featureStage = featuresStage(featureSnapshots, datasetAudit)
    stages.push(featureStage)
    if (featureStage.status !== 'pass') throw new Error('fixture feature snapshots failed PIT source checks')

    const training = await trainAndEvaluate({
      stack,
      data,
      workDir: `.omo/evidence/tli-v3-scientific-rebuild/task-15/runtime/${args.fixture}/m1`,
    })
    audit = { ...audit, futureLeakage: training.futureLeakageCount }
    stages.push(trainingStage(training))
    if (training.futureLeakageCount !== 0) throw new Error('future-window leakage reached a training origin')
    const freezeContract = buildCycleFreezeContract({ stack, data, training, gitCommitSha, verifiedAt })
    const freezeReceipt = scratch.freezeCycle(freezeContract)
    const freezeStage = cycleFreezeStage({ stack, data, training, contract: freezeContract, receipt: freezeReceipt })
    stages.push(freezeStage)
    if (freezeStage.status !== 'pass') throw new Error('scratch PostgreSQL rejected the frozen cycle hash bundle')

    const panel = await buildAndScoreProspectivePanel({
      stack,
      mode,
      artifact: training.artifact,
      artifactSha256: training.artifactSha256,
      intervalEnsembleSha256: training.intervalEnsembleSha256,
    })
    const panelStagePair = panelStages(panel)
    stages.push(...panelStagePair)
    if (panelStagePair.some((stage) => stage.status !== 'pass')) {
      throw new Error('prospective role-scoped prediction or exact-label scoring audit failed')
    }

    const gates = await runFrozenGateFixtures({
      stack,
      panel,
      candidateModelSha256: training.artifactSha256,
      calibrationArtifactSha256: training.calibrationArtifactSha256,
      datasetManifestSha256: freezeContract.datasetManifestSha256,
      primaryCycleId: freezeContract.cycleId,
      primaryCycleEvidence: freezeContract.evidenceEnvelopes,
      workDir: `.omo/evidence/tli-v3-scientific-rebuild/task-15/runtime/${args.fixture}/gate`,
    })
    cycleProbes = gates.probes
    audit = mergeProspectiveAudit(audit, panel, gates)
    stages.push(gateStage(args.fixture, gates))
    const zeroAudit = Object.values(audit).every((count) => count === 0)
    expectedSatisfied = gateExpected(args.fixture, gates)
      && zeroAudit
      && exactFive.rate === 1
      && gates.primaryIdentityMismatchCount === 0
      && cycleContractsSatisfied(args.fixture, cycleProbes)
    if (!expectedSatisfied) throw new Error('fixture did not satisfy the frozen end-to-end verdict')
    status = args.fixture === 'happy' ? 'pass' : 'no_promotion'
    exitCode = 0
    metrics = buildMetrics(training, gates)
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error))
    if (error instanceof ExpectedFailClosed && args.fixture === 'missing-source') {
      status = 'fail_closed'
      expectedSatisfied = true
      exitCode = 1
    } else {
      status = 'failed'
      expectedSatisfied = false
      exitCode = 1
    }
  } finally {
    const cleanup = scratch.cleanup()
    if (!cleanup.containerAbsent) {
      errors.push(`scratch container ${TLI_E2E_CONTAINER_NAME} absence could not be verified`)
      status = 'failed'
      expectedSatisfied = false
      exitCode = 1
    }
    stages.push({
      name: 'cleanup',
      status: cleanup.containerAbsent ? 'pass' : 'fail_closed',
      summary: { containerName: TLI_E2E_CONTAINER_NAME, ...cleanup },
    })
  }

  return {
    reportVersion: 'tli-scientific-e2e-dry-run-v1',
    fixture: args.fixture,
    status,
    expectedSatisfied,
    exitCode,
    containerName: TLI_E2E_CONTAINER_NAME,
    startedAt,
    completedAt: new Date().toISOString(),
    stages: completedStages(stages),
    audit,
    exactFive,
    cycleProbes,
    metrics,
    contractDefects: CONTRACT_DEFECTS,
    risks: DRY_RUN_RISKS,
    errors,
  }
}
