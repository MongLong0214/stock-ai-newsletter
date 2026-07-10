import { describe, expect, it } from 'vitest'
import goldenVector from '../../../../lib/tli/__tests__/fixtures/m1-golden-vector.json'
import { CONFIRMATORY_FEATURE_NAMES } from '../../../../lib/tli/features/build-confirmatory-features'
import type { BaselineFeatureRow, BaselineGtLabelRow, BaselineSnapshotRow } from '../../../../lib/tli/model/baselines'
import { predictM1Probability } from '../../../../lib/tli/model/m1'
import { parseM1ModelArtifact } from '../../../../lib/tli/model/predict'
import {
  buildM1Predictions,
  buildM1TrainingDatasetDump,
  buildOfflineEvalReport,
} from '../offline-eval'

const artifact = parseM1ModelArtifact(goldenVector.artifact)

const labels = [
  { themeId: 'theme-a', baseDate: '2026-07-06', y: true },
  { themeId: 'theme-b', baseDate: '2026-07-06', y: false },
  { themeId: 'theme-c', baseDate: '2026-07-07', y: true },
  { themeId: 'theme-d', baseDate: '2026-07-07', y: false },
] satisfies readonly BaselineGtLabelRow[]

const snapshots = [
  { themeId: 'theme-a', snapshotDate: '2026-07-06', phase: 'rising' },
  { themeId: 'theme-b', snapshotDate: '2026-07-06', phase: 'cooling' },
  { themeId: 'theme-c', snapshotDate: '2026-07-07', phase: 'cooling' },
] satisfies readonly BaselineSnapshotRow[]

const featureRows = labels.map((label, index) => ({
  themeId: label.themeId,
  baseDate: label.baseDate,
  values: label.y ? goldenVector.inputRow.values : goldenVector.inputRow.values.map((value) => -value),
  missingFlags: Array.from({ length: CONFIRMATORY_FEATURE_NAMES.length }, () => false),
  abstain: index === 3,
  y: label.y,
})) satisfies readonly BaselineFeatureRow[]

const lowRecentRateLabels = Array.from({ length: 300 }, (_, index) => ({
  themeId: `history-${index}`,
  baseDate: '2026-06-15',
  y: index < 75,
})) satisfies readonly BaselineGtLabelRow[]

const STUDY_LOCK = {
  studyContractId: 'study-todo-10',
  studyContractSha256: 'a'.repeat(64),
  studyOriginScheduleSha256: 'b'.repeat(64),
}

describe('T-205 offline eval report', () => {
  it('builds M1 predictions from the parsed v2 artifact using sklearn Platt semantics', () => {
    const predictions = buildM1Predictions(featureRows, artifact)

    expect(predictions[0].probability).toBeCloseTo(goldenVector.expectedProbability, 9)
    expect(predictions[1].probability).toBe(predictM1Probability(artifact, featureRows[1]))
    expect(predictions[3].probability).toBeNull()
  })

  it('applies per-baseDate prior correction from already-loaded final labels', () => {
    const predictions = buildM1Predictions(featureRows, artifact, lowRecentRateLabels)

    const raw = predictM1Probability(artifact, featureRows[0])
    expect(raw).not.toBeNull()
    expect(predictions[0].probability).toBeLessThan(raw ?? 0)
    expect(predictions[3].probability).toBeNull()
  })

  it('dumps non-abstain rows in the Python v2 confirmatory contract', () => {
    const dataset = buildM1TrainingDatasetDump({ rows: featureRows, labelerVersion: 'gta-v2' })

    expect(dataset.dataset_version).toBe('tli-m1-training-dataset-v2')
    expect(dataset.feature_schema).toEqual(CONFIRMATORY_FEATURE_NAMES)
    expect(dataset.train_range).toEqual(['2026-07-06', '2026-07-07'])
    expect(dataset.rows).toHaveLength(3)
    expect(dataset.rows[0].theme_id).toBe('theme-a')
  })

  it('fails closed instead of falling back to retired baselines without immutable study input', () => {
    expect(() => buildOfflineEvalReport({
      startDate: '2026-07-06',
      endDate: '2026-07-07',
      labels,
      snapshots,
      featureRows,
      labelStatusCounts: { final: 4, censored: 1, excluded: 1, pending: 0 },
      m1Predictions: buildM1Predictions(featureRows, artifact),
    }, STUDY_LOCK)).toThrow(/requires an immutable scientificBaseline study contract/)
  })

  it('rejects a malformed immutable study identity before evaluation', () => {
    expect(() => buildOfflineEvalReport({
      startDate: '2026-07-06',
      endDate: '2026-07-07',
      labels,
      snapshots,
      featureRows,
      labelStatusCounts: { final: 4, censored: 1, excluded: 1, pending: 0 },
      m1Predictions: buildM1Predictions(featureRows, artifact),
      scientificBaseline: {
        datasetManifest: {
          study_contract_id: 'study-invalid',
          study_contract_sha256: 'not-a-sha',
        },
        origins: [],
        rows: [],
      },
    }, STUDY_LOCK)).toThrow(/64-hex study_contract_sha256/)
  })
})
