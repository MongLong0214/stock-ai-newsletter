import { describe, expect, it } from 'vitest'
import { FEATURE_NAMES } from '../../../../lib/tli/features/build-features'
import type { BaselineFeatureRow, BaselineGtLabelRow, BaselineSnapshotRow } from '../../../../lib/tli/model/baselines'
import type { M1ModelArtifact } from '../../../../lib/tli/model/m1'
import {
  buildM1Predictions,
  buildM1TrainingDatasetDump,
  buildOfflineEvalReport,
  renderOfflineEvalMarkdown,
} from '../offline-eval'

const artifact = {
  artifact_version: 'tli-model-artifact-v1',
  model_type: 'm1_logistic',
  feature_schema: FEATURE_NAMES,
  scaler: {
    median: Array.from({ length: FEATURE_NAMES.length }, () => 0),
    mad: Array.from({ length: FEATURE_NAMES.length }, () => 1),
  },
  coefficients: {
    intercept: 0,
    weights: [1, ...Array.from({ length: FEATURE_NAMES.length * 2 - 1 }, () => 0)],
  },
  calibrator: {
    type: 'platt',
    a: -1,
    b: 0,
  },
  trained_at: '2026-08-02',
  train_range: ['2026-01-07', '2026-07-05'],
  labeler_version: 'gta-v1',
  seed: 42,
  sample_report: {},
} satisfies M1ModelArtifact

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
  values: [label.y ? 1.4826 : -1.4826, ...Array.from({ length: FEATURE_NAMES.length - 1 }, () => 0)],
  missingFlags: Array.from({ length: FEATURE_NAMES.length }, () => false),
  abstain: index === 3,
  y: label.y,
})) satisfies readonly BaselineFeatureRow[]

describe('T-205 offline eval report', () => {
  it('builds M1 predictions from the artifact using sklearn Platt sigmoid semantics', () => {
    const predictions = buildM1Predictions(featureRows, artifact)

    expect(predictions[0].probability).toBeCloseTo(0.7310585786, 6)
    expect(predictions[1].probability).toBeCloseTo(0.2689414214, 6)
    expect(predictions[3].probability).toBeNull()
  })

  it('dumps non-abstain M1 training rows in the T-203 JSON contract', () => {
    const dataset = buildM1TrainingDatasetDump({ rows: featureRows, labelerVersion: 'gta-v1' })

    expect(dataset.dataset_version).toBe('tli-m1-training-dataset-v1')
    expect(dataset.feature_schema).toEqual(FEATURE_NAMES)
    expect(dataset.train_range).toEqual(['2026-07-06', '2026-07-07'])
    expect(dataset.rows).toHaveLength(3)
    expect(dataset.rows[0].theme_id).toBe('theme-a')
  })

  it('reports B-abl, M0, M1 metrics, cluster CI, and censored label rate', () => {
    const report = buildOfflineEvalReport({
      startDate: '2026-07-06',
      endDate: '2026-07-07',
      labels,
      snapshots,
      featureRows,
      labelStatusCounts: { final: 4, censored: 1, excluded: 1, pending: 0 },
      m1Predictions: buildM1Predictions(featureRows, artifact),
    })

    expect(report.reportVersion).toBe('tli-offline-eval-report-v1')
    expect(report.models.bAbl.rawN).toBe(4)
    expect(report.models.m0.rawN).toBe(4)
    expect(report.models.m1.raw.nScored).toBe(3)
    expect(report.labelStatus.censoredRate).toBeCloseTo(1 / 6, 6)
    expect(report.m1TrainingFailures).toEqual([])
    expect(report.brierDeltaCi.m1VsBAbl.metric).toBe('brier')
    expect(report.brierDeltaCi.m1VsM0.confidenceLevel).toBe(0.99)
    expect(renderOfflineEvalMarkdown(report)).toContain('censored 1 (0.1667)')
  })

  it('computes the gating Brier delta CI on the non-overlapping (Monday) subset, not the full overlapping sample (B-4/N3)', () => {
    const report = buildOfflineEvalReport({
      startDate: '2026-07-06',
      endDate: '2026-07-07',
      labels,
      snapshots,
      featureRows,
      labelStatusCounts: { final: 4, censored: 1, excluded: 1, pending: 0 },
      m1Predictions: buildM1Predictions(featureRows, artifact),
    })

    // 2026-07-06 is a Monday (theme-a, theme-b); 2026-07-07 is a Tuesday (theme-c scored, theme-d abstains).
    // The gating CI must only pair the Monday rows; the overlapping-raw CI may include the Tuesday row too.
    expect(report.brierDeltaCi.m1VsBAbl.observationCount).toBe(2)
    expect(report.brierDeltaCi.m1VsBAblOverlappingRaw.observationCount).toBe(3)
    expect(report.brierDeltaCi.m1VsM0.observationCount).toBe(2)
    expect(report.brierDeltaCi.m1VsM0OverlappingRaw.observationCount).toBe(3)
  })
})
