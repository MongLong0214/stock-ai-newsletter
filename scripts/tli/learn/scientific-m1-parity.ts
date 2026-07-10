import type { ScientificM1EvaluationPlan } from './offline-eval-scientific-m1'
import type { ScientificM1StudyInput } from './scientific-m1-input'
import type { ScientificM1TrainingResult } from './scientific-m1-training'
import type { ScientificStudyBridgeResult } from './scientific-study-bridge'

export const SCIENTIFIC_M1_PARITY_VERSION = 'tli-python-ts-parity-golden-v1'

export class ScientificM1ParityError extends Error {
  readonly name = 'ScientificM1ParityError'

  constructor(readonly code: string, readonly detail: string) {
    super(`${code}: ${detail}`)
  }
}

export function buildScientificM1ParityGolden(input: {
  readonly study: ScientificM1StudyInput
  readonly plan: ScientificM1EvaluationPlan
  readonly training: ScientificM1TrainingResult
  readonly bridge: ScientificStudyBridgeResult
}) {
  const pythonByFold = new Map(input.bridge.output.training_parity.map((row) => [row.fold_id, row]))
  const outerFolds = input.plan.outerFolds.map((fold) => {
    const trained = input.training.outerFolds.find((item) => item.foldId === fold.foldId)
    const python = pythonByFold.get(fold.foldId)
    if (trained === undefined || python === undefined) {
      throw new ScientificM1ParityError('missing_fold_parity', fold.foldId)
    }
    return {
      foldId: fold.foldId,
      sequence: fold.sequence,
      testOrigin: fold.testOrigin.originDate,
      splitOriginsSha256: fold.splitOriginsSha256,
      candidateTrainOrigins: fold.candidateTrainOrigins,
      survivingTrainOrigins: fold.trainOrigins,
      trainingOrigins: fold.trainingOrigins,
      trainingRowKeys: fold.trainingDataset.rows.map((row) => `${row.theme_id}|${row.base_date}`),
      purgedRows: fold.purgedRows,
      testRowIds: fold.testRows.map((row) => row.id),
      ts: {
        trainingInputSha256: trained.trainingInputSha256,
        availabilitySidecarSha256: trained.availabilitySidecarSha256,
        innerPurgeReceiptSha256: trained.innerPurgeReceiptSha256,
        innerPurgeReceipt: trained.innerPurgeReceipt,
        artifactSha256: trained.artifactSha256,
        featureSchema: fold.trainingDataset.feature_schema,
        innerOof: fold.innerOof,
      },
      python: {
        expectedSha256: python.expected_sha256,
        actualSha256: python.actual_sha256,
        canonicalDatasetSha256: python.canonical_dataset_sha256,
        rowCount: python.row_count,
        featureSchema: python.feature_schema,
        innerOofSplitSha256: trained.pythonParity.innerOofSplitSha256,
        availabilitySidecarSha256: trained.pythonParity.availabilitySidecarSha256,
        innerPurgeReceiptSha256: trained.pythonParity.innerPurgeReceiptSha256,
      },
      matches: {
        trainingBytes: python.expected_sha256 === trained.trainingInputSha256
          && python.actual_sha256 === trained.trainingInputSha256,
        featureSchema: JSON.stringify(python.feature_schema) === JSON.stringify(fold.trainingDataset.feature_schema),
        rowCount: python.row_count === fold.trainingDataset.rows.length,
        innerOof: trained.pythonParity.innerOofMatch,
        innerPointInTime: trained.pythonParity.innerPointInTimeMatch,
      },
    }
  })
  return {
    parityVersion: SCIENTIFIC_M1_PARITY_VERSION,
    study: {
      cycleId: input.study.cycleId,
      studyContractId: input.plan.studyContractId,
      studyContractSha256: input.plan.studyContractSha256,
      datasetManifestSha256: input.plan.datasetManifestSha256,
      featureContractVersion: input.plan.featureContractVersion,
      featureContractSha256: input.plan.featureContractSha256,
      walkForwardSplitSha256: input.plan.walkForwardSplitSha256,
    },
    originCount: input.plan.originCount,
    testOriginCount: input.plan.testOriginCount,
    rows: input.plan.rows.map((row) => ({
      rowId: row.id,
      themeId: row.themeId,
      baseDate: row.baseDate,
      featureSnapshotSha256: row.featureSnapshotSha256,
      features: row.features,
      missingFlags: row.missingFlags,
      abstain: row.abstain,
      y: row.y,
      gLogRatio: row.gLogRatio,
    })),
    outerFolds,
    prospective: {
      trainingOrigins: input.plan.prospective.trainingOrigins,
      trainingRowKeys: input.plan.prospective.trainingDataset.rows.map(
        (row) => `${row.theme_id}|${row.base_date}`,
      ),
      trainingInputSha256: input.training.prospective.trainingInputSha256,
      availabilitySidecarSha256: input.training.prospective.availabilitySidecarSha256,
      innerPurgeReceiptSha256: input.training.prospective.innerPurgeReceiptSha256,
      innerPurgeReceipt: input.training.prospective.innerPurgeReceipt,
      artifactSha256: input.training.prospective.artifactSha256,
      innerOof: input.plan.prospective.innerOof,
      trainingInputMatch: input.training.prospective.pythonParity.trainingInputMatch,
      innerOofMatch: input.training.prospective.pythonParity.innerOofMatch,
      innerPointInTimeMatch: input.training.prospective.pythonParity.innerPointInTimeMatch,
    },
  }
}

export type ScientificM1ParityGolden = ReturnType<typeof buildScientificM1ParityGolden>
