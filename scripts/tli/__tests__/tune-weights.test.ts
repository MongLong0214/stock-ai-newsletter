import { describe, expect, it } from 'vitest'
import {
  computeRunEvidenceWeight,
  evaluateWeightConfigAcrossRuns,
  generateWeightGridCandidates,
  renderWeightTuningReport,
  runWeightGridSearch,
  type WeightTuningCandidateRow,
  type WeightTuningConfig,
} from '../level4/tune-weights'

const baselineConfig: WeightTuningConfig = {
  weight_version: 'baseline',
  source_surface: 'v2_certification',
  w_feature: 1,
  w_curve: 0,
  w_keyword: 0,
  sector_penalty: 0.85,
}

const curveHeavyConfig: WeightTuningConfig = {
  weight_version: 'curve-heavy',
  source_surface: 'v2_certification',
  w_feature: 0.1,
  w_curve: 0.9,
  w_keyword: 0,
  sector_penalty: 0.85,
}

const rows: WeightTuningCandidateRow[] = [
  { run_id: 'run-1', run_date: '2026-01-05', candidate_theme_id: 'p1', feature_sim: 0.90, curve_sim: 0.10, keyword_sim: 0.10, sector_match: true, binary_relevant: false, censored_reason: null },
  { run_id: 'run-1', run_date: '2026-01-05', candidate_theme_id: 'p2', feature_sim: 0.80, curve_sim: 0.12, keyword_sim: 0.10, sector_match: true, binary_relevant: false, censored_reason: null },
  { run_id: 'run-1', run_date: '2026-01-05', candidate_theme_id: 'p3', feature_sim: 0.70, curve_sim: 0.15, keyword_sim: 0.10, sector_match: true, binary_relevant: false, censored_reason: null },
  { run_id: 'run-1', run_date: '2026-01-05', candidate_theme_id: 'p4', feature_sim: 0.10, curve_sim: 0.95, keyword_sim: 0.10, sector_match: true, binary_relevant: true, censored_reason: null },
  { run_id: 'run-1', run_date: '2026-01-05', candidate_theme_id: 'p5', feature_sim: 0.20, curve_sim: 0.20, keyword_sim: 0.10, sector_match: true, binary_relevant: false, censored_reason: null },
  { run_id: 'run-2', run_date: '2026-02-10', candidate_theme_id: 'q1', feature_sim: 0.88, curve_sim: 0.08, keyword_sim: 0.10, sector_match: true, binary_relevant: false, censored_reason: null },
  { run_id: 'run-2', run_date: '2026-02-10', candidate_theme_id: 'q2', feature_sim: 0.82, curve_sim: 0.10, keyword_sim: 0.10, sector_match: true, binary_relevant: false, censored_reason: null },
  { run_id: 'run-2', run_date: '2026-02-10', candidate_theme_id: 'q3', feature_sim: 0.76, curve_sim: 0.12, keyword_sim: 0.10, sector_match: true, binary_relevant: false, censored_reason: null },
  { run_id: 'run-2', run_date: '2026-02-10', candidate_theme_id: 'q4', feature_sim: 0.15, curve_sim: 0.90, keyword_sim: 0.10, sector_match: true, binary_relevant: true, censored_reason: null },
  { run_id: 'run-2', run_date: '2026-02-10', candidate_theme_id: 'q5', feature_sim: 0.25, curve_sim: 0.18, keyword_sim: 0.10, sector_match: true, binary_relevant: false, censored_reason: null },
]

describe('level4 full candidate-pool weight tuning', () => {
  it('downweights runs with heavy censoring', () => {
    expect(computeRunEvidenceWeight({ totalCandidates: 10, evaluatedCandidates: 10 })).toBe(1)
    expect(computeRunEvidenceWeight({ totalCandidates: 10, evaluatedCandidates: 5 })).toBe(0.5)
    expect(computeRunEvidenceWeight({ totalCandidates: 10, evaluatedCandidates: 0 })).toBe(0)
  })

  it('evaluates full candidate pools instead of stopping at the served top3', () => {
    const baseline = evaluateWeightConfigAcrossRuns(rows, baselineConfig)
    const candidate = evaluateWeightConfigAcrossRuns(rows, curveHeavyConfig)

    expect(baseline.totalCandidates).toBe(10)
    expect(candidate.totalCandidates).toBe(10)
    expect(baseline.mrr).toBeCloseTo(0.2)
    expect(candidate.mrr).toBeCloseTo(1)
  })

  it('selects the best weight config with CI-backed evidence', () => {
    const result = runWeightGridSearch({
      rows,
      candidateConfigs: [baselineConfig, curveHeavyConfig],
      baselineConfig,
      minFolds: 1,
      bootstrapIterations: 200,
    })

    expect(result.selectedConfig.weight_version).toBe('curve-heavy')
    expect(result.selectedConfig.ci_lower).toBeDefined()
    expect(result.selectedConfig.ci_upper).toBeDefined()
    expect(result.selectedConfig.validation_metric_summary.mrr.meanDelta).toBeGreaterThan(0)
    expect(result.selectedConfig.validation_metric_summary.precisionAt3.meanDelta).toBeDefined()
    expect(renderWeightTuningReport(result)).toContain('# Level-4 Weight Tuning Report')
  })

  it('generates a broad but normalized candidate grid around the baseline', () => {
    const grid = generateWeightGridCandidates({
      sourceSurface: 'v2_certification',
      weightVersionPrefix: 'grid',
    })

    expect(grid.length).toBeGreaterThan(10)
    expect(grid.some((candidate) => candidate.weight_version !== 'grid-baseline')).toBe(true)
    for (const candidate of grid) {
      expect(candidate.w_feature + candidate.w_curve + candidate.w_keyword).toBeCloseTo(1, 5)
    }
  })

  it('uses curve bucket policy when provided instead of a single global weight triplet', () => {
    const bucketRows: WeightTuningCandidateRow[] = [
      {
        run_id: 'run-short',
        run_date: '2026-03-01',
        candidate_theme_id: 'short-a',
        feature_sim: 0.9,
        curve_sim: 0.1,
        keyword_sim: 0,
        sector_match: true,
        binary_relevant: true,
        censored_reason: null,
        curve_bucket: 'lt7',
      },
      {
        run_id: 'run-short',
        run_date: '2026-03-01',
        candidate_theme_id: 'short-b',
        feature_sim: 0.3,
        curve_sim: 0.85,
        keyword_sim: 0,
        sector_match: true,
        binary_relevant: false,
        censored_reason: null,
        curve_bucket: 'lt7',
      },
      {
        run_id: 'run-long',
        run_date: '2026-03-02',
        candidate_theme_id: 'long-a',
        feature_sim: 0.2,
        curve_sim: 0.9,
        keyword_sim: 0,
        sector_match: true,
        binary_relevant: true,
        censored_reason: null,
        curve_bucket: 'gte14',
      },
      {
        run_id: 'run-long',
        run_date: '2026-03-02',
        candidate_theme_id: 'long-b',
        feature_sim: 0.85,
        curve_sim: 0.2,
        keyword_sim: 0,
        sector_match: true,
        binary_relevant: false,
        censored_reason: null,
        curve_bucket: 'gte14',
      },
    ]

    const flat = evaluateWeightConfigAcrossRuns(bucketRows, {
      weight_version: 'flat',
      source_surface: 'v2_certification',
      w_feature: 0.5,
      w_curve: 0.5,
      w_keyword: 0,
      sector_penalty: 0.85,
    })

    const result = evaluateWeightConfigAcrossRuns(bucketRows, {
      weight_version: 'bucket-policy',
      source_surface: 'v2_certification',
      w_feature: 0.5,
      w_curve: 0.5,
      w_keyword: 0,
      sector_penalty: 0.85,
      curve_bucket_policy: {
        gte14: { w_feature: 0.1, w_curve: 0.9, w_keyword: 0 },
        gte7: { w_feature: 0.5, w_curve: 0.5, w_keyword: 0 },
        lt7: { w_feature: 0.9, w_curve: 0.1, w_keyword: 0 },
      },
    })

    expect(flat.mrr).toBeLessThan(1)
    expect(result.mrr).toBe(1)
    expect(result.precisionAt3).toBeCloseTo(0.5)
  })

  it('reduces the influence of censoring-heavy runs on aggregate MRR', () => {
    const censoringRows: WeightTuningCandidateRow[] = [
      { run_id: 'clean', run_date: '2026-03-01', candidate_theme_id: 'a', feature_sim: 0.2, curve_sim: 0.9, keyword_sim: 0, sector_match: true, binary_relevant: true, censored_reason: null },
      { run_id: 'clean', run_date: '2026-03-01', candidate_theme_id: 'b', feature_sim: 0.9, curve_sim: 0.2, keyword_sim: 0, sector_match: true, binary_relevant: false, censored_reason: null },
      { run_id: 'censored', run_date: '2026-03-02', candidate_theme_id: 'c1', feature_sim: 0.2, curve_sim: 0.9, keyword_sim: 0, sector_match: true, binary_relevant: true, censored_reason: null },
      { run_id: 'censored', run_date: '2026-03-02', candidate_theme_id: 'c2', feature_sim: 0.9, curve_sim: 0.2, keyword_sim: 0, sector_match: true, binary_relevant: false, censored_reason: 'run_horizon_immature' },
      { run_id: 'censored', run_date: '2026-03-02', candidate_theme_id: 'c3', feature_sim: 0.9, curve_sim: 0.2, keyword_sim: 0, sector_match: true, binary_relevant: false, censored_reason: 'run_horizon_immature' },
      { run_id: 'censored', run_date: '2026-03-02', candidate_theme_id: 'c4', feature_sim: 0.9, curve_sim: 0.2, keyword_sim: 0, sector_match: true, binary_relevant: false, censored_reason: 'run_horizon_immature' },
      { run_id: 'censored', run_date: '2026-03-02', candidate_theme_id: 'c5', feature_sim: 0.9, curve_sim: 0.2, keyword_sim: 0, sector_match: true, binary_relevant: false, censored_reason: 'run_horizon_immature' },
    ]

    const result = evaluateWeightConfigAcrossRuns(censoringRows, curveHeavyConfig)

    expect(result.perRunMetrics.find((run) => run.runId === 'censored')?.evidenceWeight).toBeCloseTo(0.2)
    expect(result.mrr).toBeCloseTo((1 * 1 + 1 * 0.2) / 1.2)
  })
})
