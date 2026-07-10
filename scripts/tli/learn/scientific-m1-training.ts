import { predictM1Probability, type M1ModelArtifactV2 } from '../../../lib/tli/model/m1'
import {
  defaultScientificM1Trainer,
  trainScientificM1Fit,
  type ScientificM1TrainedFit,
  type ScientificM1Trainer,
} from './scientific-m1-fit'
import type { ScientificM1EvaluationPlan, ScientificM1JoinedRow } from './offline-eval-scientific-m1'

export { ScientificM1TrainingError } from './scientific-m1-fit'
export type {
  ScientificM1PythonParity,
  ScientificM1TrainedFit,
  ScientificM1Trainer,
} from './scientific-m1-fit'

export type ScientificM1PredictionRow = {
  readonly rowId: string
  readonly id: string
  readonly themeId: string
  readonly baseDate: string
  readonly probability: number | null
  readonly y: boolean
  readonly gLogRatio: number
}

export type ScientificM1TrainedOuterFold = ScientificM1TrainedFit & {
  readonly testOrigin: string
  readonly predictions: readonly ScientificM1PredictionRow[]
}

export type ScientificM1TrainingResult = {
  readonly studyContractId: string
  readonly studyContractSha256: string
  readonly datasetManifestSha256: string
  readonly walkForwardSplitSha256: string
  readonly outerFolds: readonly ScientificM1TrainedOuterFold[]
  readonly prospective: ScientificM1TrainedFit
  readonly predictions: readonly ScientificM1PredictionRow[]
}

const predictRows = (
  rows: readonly ScientificM1JoinedRow[],
  artifact: M1ModelArtifactV2,
): ScientificM1PredictionRow[] => rows.map((row) => ({
  rowId: row.id,
  id: `${row.themeId}|${row.baseDate}`,
  themeId: row.themeId,
  baseDate: row.baseDate,
  probability: predictM1Probability(artifact, {
    values: row.features,
    missingFlags: row.missingFlags,
    abstain: row.abstain,
  }),
  y: row.y,
  gLogRatio: row.gLogRatio,
}))

export function runScientificM1Training(input: {
  readonly plan: ScientificM1EvaluationPlan
  readonly workDir: string
  readonly trainedAt: string
  readonly trainer?: ScientificM1Trainer
}): ScientificM1TrainingResult {
  const trainer = input.trainer ?? defaultScientificM1Trainer
  const outerFolds = input.plan.outerFolds.map((fold): ScientificM1TrainedOuterFold => {
    const fit = trainScientificM1Fit({
      fitId: fold.foldId,
      dataset: fold.trainingDataset,
      joinedRows: input.plan.rows,
      studyOrigins: input.plan.studyOrigins,
      trainingOrigins: fold.trainingOrigins,
      innerOof: fold.innerOof,
      workDir: input.workDir,
      trainedAt: input.trainedAt,
      trainer,
    })
    return {
      ...fit,
      testOrigin: fold.testOrigin.originDate,
      predictions: predictRows(fold.testRows, fit.artifact),
    }
  })
  const prospective = trainScientificM1Fit({
    fitId: 'prospective',
    dataset: input.plan.prospective.trainingDataset,
    joinedRows: input.plan.rows,
    studyOrigins: input.plan.studyOrigins,
    trainingOrigins: input.plan.prospective.trainingOrigins,
    innerOof: input.plan.prospective.innerOof,
    workDir: input.workDir,
    trainedAt: input.trainedAt,
    trainer,
  })
  return {
    studyContractId: input.plan.studyContractId,
    studyContractSha256: input.plan.studyContractSha256,
    datasetManifestSha256: input.plan.datasetManifestSha256,
    walkForwardSplitSha256: input.plan.walkForwardSplitSha256,
    outerFolds,
    prospective,
    predictions: outerFolds.flatMap((fold) => fold.predictions),
  }
}
