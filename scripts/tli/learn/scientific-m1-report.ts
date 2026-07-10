import type { EvalPredictionRow } from '../../../lib/tli/eval/types'

import { evaluateScientificM1Predictions } from './continuous-ic'
import type { OfflineEvalReport } from './offline-eval'
import type { ScientificM1EvaluationPlan } from './offline-eval-scientific-m1'
import type { ScientificM1StudyInput } from './scientific-m1-input'
import type { ScientificM1TrainingResult, ScientificM1PredictionRow } from './scientific-m1-training'
import type { ScientificStudyBridgeResult } from './scientific-study-bridge'
import type { ScientificStudyBridgePairedRow } from './scientific-study-bridge-contract'

export const SCIENTIFIC_M1_REPORT_VERSION = 'tli-scientific-m1-offline-eval-v1'

export class ScientificM1ReportError extends Error {
  readonly name = 'ScientificM1ReportError'

  constructor(readonly code: string, readonly detail: string) {
    super(`${code}: ${detail}`)
  }
}

export function buildScientificM1PairedRows(input: {
  readonly candidates: readonly ScientificM1PredictionRow[]
  readonly comparators: readonly EvalPredictionRow[]
}): ScientificStudyBridgePairedRow[] {
  const comparatorById = new Map<string, EvalPredictionRow>()
  for (const comparator of input.comparators) {
    if (comparatorById.has(comparator.id)) {
      throw new ScientificM1ReportError('duplicate_primary_comparator', comparator.id)
    }
    comparatorById.set(comparator.id, comparator)
  }
  return input.candidates.flatMap((candidate) => {
    if (candidate.probability === null) return []
    const comparator = comparatorById.get(candidate.id)
    if (comparator === undefined) {
      throw new ScientificM1ReportError('missing_primary_comparator', candidate.id)
    }
    if (comparator.probability === null || !Number.isFinite(comparator.probability)) {
      throw new ScientificM1ReportError('invalid_primary_comparator', candidate.id)
    }
    if (
      comparator.themeId !== candidate.themeId
      || comparator.baseDate !== candidate.baseDate
      || comparator.y !== candidate.y
    ) throw new ScientificM1ReportError('mismatched_primary_comparator', candidate.id)
    return [{
      themeId: candidate.themeId,
      originDate: candidate.baseDate,
      candidateProbability: candidate.probability,
      comparatorProbability: comparator.probability,
      y: candidate.y,
    }]
  })
}

export function buildScientificM1OfflineReport(input: {
  readonly study: ScientificM1StudyInput
  readonly plan: ScientificM1EvaluationPlan
  readonly training: ScientificM1TrainingResult
  readonly bridge: ScientificStudyBridgeResult
  readonly baselineEvaluation: OfflineEvalReport
  readonly parityGoldenSha256: string
}) {
  const predictedIds = new Set(input.training.predictions.map((row) => row.rowId))
  const outcomeRows = input.plan.rows.filter((row) => predictedIds.has(row.id))
  const evaluated = evaluateScientificM1Predictions({
    rows: outcomeRows,
    predictions: input.training.predictions.map((row) => ({
      rowId: row.rowId,
      probability: row.probability,
    })),
  })
  const statistics = input.bridge.output.statistics
  return {
    reportVersion: SCIENTIFIC_M1_REPORT_VERSION,
    study: {
      cycleId: input.study.cycleId,
      studyContractId: input.plan.studyContractId,
      studyContractSha256: input.plan.studyContractSha256,
      datasetManifestSha256: input.plan.datasetManifestSha256,
      featureContractVersion: input.plan.featureContractVersion,
      featureContractSha256: input.plan.featureContractSha256,
      walkForwardSplitSha256: input.plan.walkForwardSplitSha256,
    },
    modelArtifactVersion: 'tli-model-artifact-v2' as const,
    pipeline: [
      'dataset-manifest', 'confirmatory-features', 'study-walk-forward-purge',
      'python-train-inner-oof-platt', 'typescript-predict', 'binary-and-continuous-metrics',
      'python-two-way-bootstrap-and-interval-ensemble',
    ] as const,
    originCount: input.plan.originCount,
    outerFoldCount: input.training.outerFolds.length,
    folds: input.plan.outerFolds.map((fold) => {
      const trained = input.training.outerFolds.find((item) => item.foldId === fold.foldId)
      if (trained === undefined) throw new ScientificM1ReportError('missing_trained_fold', fold.foldId)
      return {
        foldId: fold.foldId,
        testOrigin: fold.testOrigin.originDate,
        candidateTrainOrigins: fold.candidateTrainOrigins,
        survivingTrainOrigins: fold.trainOrigins,
        trainingOrigins: fold.trainingOrigins,
        trainingRowCount: fold.trainingDataset.rows.length,
        testRowCount: fold.testRows.length,
        purgedRows: fold.purgedRows,
        splitOriginsSha256: fold.splitOriginsSha256,
        innerOofSplitSha256: fold.innerOof.splitOriginsSha256,
        trainingInputSha256: trained.trainingInputSha256,
        availabilitySidecarSha256: trained.availabilitySidecarSha256,
        innerPurgeReceiptSha256: trained.innerPurgeReceiptSha256,
        innerPointInTimeMatch: trained.pythonParity.innerPointInTimeMatch,
        innerPurgeFacts: trained.innerPurgeReceipt.folds.flatMap((inner) => (
          inner.purged_rows.map((row) => ({
            foldId: inner.fold_id,
            validationOrigin: inner.validation_origin,
            validationForecastCutoff: inner.validation_forecast_cutoff,
            rowId: row.row_id,
            reasons: row.reasons,
          }))
        )),
        artifactSha256: trained.artifactSha256,
      }
    }),
    prospective: {
      trainingOrigins: input.plan.prospective.trainingOrigins,
      trainingRowCount: input.plan.prospective.trainingDataset.rows.length,
      innerOofSplitSha256: input.plan.prospective.innerOof.splitOriginsSha256,
      trainingInputSha256: input.training.prospective.trainingInputSha256,
      availabilitySidecarSha256: input.training.prospective.availabilitySidecarSha256,
      innerPurgeReceiptSha256: input.training.prospective.innerPurgeReceiptSha256,
      innerPointInTimeMatch: input.training.prospective.pythonParity.innerPointInTimeMatch,
      innerPurgeFacts: input.training.prospective.innerPurgeReceipt.folds.flatMap((inner) => (
        inner.purged_rows.map((row) => ({
          foldId: inner.fold_id,
          validationOrigin: inner.validation_origin,
          validationForecastCutoff: inner.validation_forecast_cutoff,
          rowId: row.row_id,
          reasons: row.reasons,
        }))
      )),
      artifactSha256: input.training.prospective.artifactSha256,
    },
    predictions: input.training.predictions,
    binaryMetrics: evaluated.binary,
    continuousMetrics: {
      target: 'g_log_ratio' as const,
      dailySpearmanIc: evaluated.continuousGLogRatioIc,
    },
    pairedInference: statistics,
    promotionDecision: {
      positiveSkill: statistics.delta_brier.positive_skill,
      rule: 'delta_brier_point_lt_0_and_upper_99_lt_0' as const,
    },
    intervalEnsemble: input.bridge.output.interval_ensemble,
    pythonBridge: {
      bridgeVersion: input.bridge.output.bridge_version,
      requestContractSha256: input.bridge.requestContractSha256,
      outputContractSha256: input.bridge.outputContractSha256,
      runtime: input.bridge.output.runtime,
      trainingParity: input.bridge.output.training_parity.map((parity) => ({
        foldId: parity.fold_id,
        expectedSha256: parity.expected_sha256,
        actualSha256: parity.actual_sha256,
        canonicalDatasetSha256: parity.canonical_dataset_sha256,
        rowCount: parity.row_count,
        featureSchema: parity.feature_schema,
      })),
    },
    parityGoldenSha256: input.parityGoldenSha256,
    baselineEvaluation: input.baselineEvaluation,
  }
}

export type ScientificM1OfflineReport = ReturnType<typeof buildScientificM1OfflineReport>

export function renderScientificM1OfflineMarkdown(report: ScientificM1OfflineReport): string {
  const delta = report.pairedInference.delta_brier
  return [
    '# TLI Scientific M1 Offline Evaluation',
    '',
    `Study: ${report.study.studyContractId} (${report.study.studyContractSha256})`,
    `Origins / outer folds: ${report.originCount} / ${report.outerFoldCount}`,
    `OOF predictions: ${report.predictions.length}`,
    `Binary Brier: ${String(report.binaryMetrics.raw.brier)}`,
    `Continuous g_log_ratio IC: ${String(report.continuousMetrics.dailySpearmanIc.raw)}`,
    `Paired delta Brier: ${delta.point} (upper99 ${delta.upper_99})`,
    `Positive skill: ${String(report.promotionDecision.positiveSkill)}`,
    `Interval accepted / rejected attempts: ${report.intervalEnsemble.accepted.length} / ${report.intervalEnsemble.rejected.length}`,
    `Parity golden SHA-256: ${report.parityGoldenSha256}`,
    '',
  ].join('\n')
}
