import { createHash } from 'node:crypto'
import { join } from 'node:path'

import { buildOfflineEvalReport } from './offline-eval'
import { buildScientificM1EvaluationPlan } from './offline-eval-scientific-m1'
import type { ScientificBaselineStudyLock } from './offline-eval-study-lock'
import type { ScientificM1StudyInput } from './scientific-m1-input'
import { buildOfflineEvalInputFromScientificPlan } from './scientific-m1-offline-input'
import { buildScientificM1ParityGolden } from './scientific-m1-parity'
import {
  buildScientificM1OfflineReport,
  buildScientificM1PairedRows,
} from './scientific-m1-report'
import {
  runScientificM1Training,
  type ScientificM1Trainer,
} from './scientific-m1-training'
import {
  runScientificStudyBridge,
  type StudyEvalBridgeRunner,
} from './scientific-study-bridge'

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex')

export function runScientificM1OfflineEvaluation(input: {
  readonly study: ScientificM1StudyInput
  readonly studyLock: ScientificBaselineStudyLock
  readonly workDir: string
  readonly trainedAt: string
  readonly trainer?: ScientificM1Trainer
  readonly bridgeRunner?: StudyEvalBridgeRunner
}) {
  const plan = buildScientificM1EvaluationPlan(input.study)
  const offlineInput = buildOfflineEvalInputFromScientificPlan({ study: input.study, plan })
  const training = runScientificM1Training({
    plan,
    workDir: join(input.workDir, 'training'),
    trainedAt: input.trainedAt,
    trainer: input.trainer,
  })
  const baselineEvaluation = buildOfflineEvalReport({
    ...offlineInput,
    m1Predictions: training.predictions,
    m1TrainingFailures: [],
  }, input.studyLock)
  const pairedRows = buildScientificM1PairedRows({
    candidates: training.predictions,
    comparators: baselineEvaluation.baselines.primaryPredictions,
  })
  const bridge = runScientificStudyBridge({
    study: input.study,
    plan,
    training,
    pairedRows,
    workDir: join(input.workDir, 'bridge'),
    runner: input.bridgeRunner,
  })
  const parityGolden = buildScientificM1ParityGolden({
    study: input.study,
    plan,
    training,
    bridge,
  })
  const parityGoldenBytes = `${JSON.stringify(parityGolden, null, 2)}\n`
  const parityGoldenSha256 = sha256(parityGoldenBytes)
  return {
    report: buildScientificM1OfflineReport({
      study: input.study,
      plan,
      training,
      bridge,
      baselineEvaluation,
      parityGoldenSha256,
    }),
    parityGolden,
    parityGoldenBytes,
    parityGoldenSha256,
  }
}

export type ScientificM1OfflineEvaluationResult = ReturnType<typeof runScientificM1OfflineEvaluation>
