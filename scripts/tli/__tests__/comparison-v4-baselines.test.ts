import { existsSync, writeFileSync, unlinkSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, afterAll } from 'vitest'
import {
  BASELINE_DEFINITIONS,
  evaluateBaselinePassFail,
  requirePowerAnalysisDocument,
  buildRolloutReportWithVariance,
  MIN_ELIGIBLE_RUNS,
  MIN_UNIQUE_THEMES,
  evaluateMinimumTestCohort,
} from '../comparison-v4-baselines'

describe('CMPV4-009: baseline definitions', () => {
  it('defines all 6 PRD-required baselines', () => {
    const ids = BASELINE_DEFINITIONS.map((b) => b.id)
    expect(ids).toContain('random')
    expect(ids).toContain('sector-only')
    expect(ids).toContain('feature-only')
    expect(ids).toContain('curve-only')
    expect(ids).toContain('current-production')
    expect(ids).toContain('top3-without-threshold')
    expect(BASELINE_DEFINITIONS).toHaveLength(6)
  })

  it('each baseline has a human-readable name', () => {
    for (const baseline of BASELINE_DEFINITIONS) {
      expect(baseline.name.length).toBeGreaterThan(0)
    }
  })
})

describe('CMPV4-009: baseline pass/fail', () => {
  it('passes when candidate beats all baselines', () => {
    const result = evaluateBaselinePassFail({
      candidateMean: 0.65,
      baselines: [
        { id: 'random', mean: 0.33 },
        { id: 'current-production', mean: 0.55 },
      ],
      minimumBeatBaseline: 'random',
    })

    expect(result.passed).toBe(true)
    expect(result.failedBaselines).toEqual([])
  })

  it('fails when candidate does not beat the minimum required baseline', () => {
    const result = evaluateBaselinePassFail({
      candidateMean: 0.30,
      baselines: [
        { id: 'random', mean: 0.33 },
        { id: 'current-production', mean: 0.55 },
      ],
      minimumBeatBaseline: 'random',
    })

    expect(result.passed).toBe(false)
    expect(result.failedBaselines).toContain('random')
  })

  it('reports all baselines that beat the candidate', () => {
    const result = evaluateBaselinePassFail({
      candidateMean: 0.40,
      baselines: [
        { id: 'random', mean: 0.33 },
        { id: 'current-production', mean: 0.55 },
        { id: 'feature-only', mean: 0.42 },
      ],
      minimumBeatBaseline: 'random',
    })

    expect(result.passed).toBe(true) // beats minimum required (random)
    expect(result.failedBaselines).toContain('current-production')
    expect(result.failedBaselines).toContain('feature-only')
    expect(result.failedBaselines).not.toContain('random')
  })

  it('uses strict inequality (equal means not beaten)', () => {
    const result = evaluateBaselinePassFail({
      candidateMean: 0.33,
      baselines: [{ id: 'random', mean: 0.33 }],
      minimumBeatBaseline: 'random',
    })

    expect(result.passed).toBe(false)
    expect(result.failedBaselines).toContain('random')
  })
})

describe('CMPV4-009: power analysis document guard', () => {
  const testPath = resolve(process.cwd(), 'docs/comparison-v4-power-analysis-test-temp.md')

  afterAll(() => {
    if (existsSync(testPath)) unlinkSync(testPath)
  })

  it('fails when the document does not exist', () => {
    const result = requirePowerAnalysisDocument('/nonexistent/path.md')
    expect(result.exists).toBe(false)
  })

  it('passes when the document exists', () => {
    writeFileSync(testPath, '# Power Analysis\n')
    const result = requirePowerAnalysisDocument(testPath)
    expect(result.exists).toBe(true)
  })
})

describe('CMPV4-009: rollout report with fold variance', () => {
  it('includes fold-level mean and standard deviation', () => {
    const report = buildRolloutReportWithVariance({
      primaryMetric: 'Phase-Aligned Precision@3',
      foldResults: [
        { foldId: 'fold-1', precision: 0.60 },
        { foldId: 'fold-2', precision: 0.70 },
        { foldId: 'fold-3', precision: 0.65 },
      ],
      currentProduction: { mean: 0.55, lower: 0.50, upper: 0.60 },
      baselines: [
        { name: 'random', mean: 0.33, lower: 0.33, upper: 0.33 },
      ],
    })

    expect(report).toContain('Phase-Aligned Precision@3')
    expect(report).toContain('Fold Results')
    expect(report).toContain('fold-1')
    expect(report).toContain('Mean')
    expect(report).toContain('Std Dev')
  })

  it('computes correct mean across folds', () => {
    const report = buildRolloutReportWithVariance({
      primaryMetric: 'P@3',
      foldResults: [
        { foldId: 'f1', precision: 0.50 },
        { foldId: 'f2', precision: 0.70 },
      ],
      currentProduction: { mean: 0.40, lower: 0.35, upper: 0.45 },
      baselines: [],
    })

    // Mean of [0.50, 0.70] = 0.60
    expect(report).toContain('0.6')
  })

  it('handles single fold (zero variance)', () => {
    const report = buildRolloutReportWithVariance({
      primaryMetric: 'P@3',
      foldResults: [{ foldId: 'f1', precision: 0.55 }],
      currentProduction: { mean: 0.40, lower: 0.35, upper: 0.45 },
      baselines: [],
    })

    expect(report).toContain('0.55')
    expect(report).toContain('0') // stddev = 0
  })
})

// ── Gap 4: PRD §8.3 — minimum test cohort enforcement ──

describe('PRD §8.3: minimum test cohort enforcement', () => {
  it('defines PRD constants', () => {
    expect(MIN_ELIGIBLE_RUNS).toBe(100)
    expect(MIN_UNIQUE_THEMES).toBe(30)
  })

  it('passes when both thresholds are met', () => {
    const result = evaluateMinimumTestCohort({
      eligibleRuns: 150,
      uniqueThemes: 45,
    })

    expect(result.sufficient).toBe(true)
    expect(result.failures).toHaveLength(0)
  })

  it('fails when eligible runs are insufficient', () => {
    const result = evaluateMinimumTestCohort({
      eligibleRuns: 80,
      uniqueThemes: 45,
    })

    expect(result.sufficient).toBe(false)
    expect(result.failures).toContain('eligible_runs')
  })

  it('fails when unique themes are insufficient', () => {
    const result = evaluateMinimumTestCohort({
      eligibleRuns: 150,
      uniqueThemes: 20,
    })

    expect(result.sufficient).toBe(false)
    expect(result.failures).toContain('unique_themes')
  })

  it('fails when both are insufficient', () => {
    const result = evaluateMinimumTestCohort({
      eligibleRuns: 50,
      uniqueThemes: 10,
    })

    expect(result.sufficient).toBe(false)
    expect(result.failures).toHaveLength(2)
  })

  it('passes at exact boundary values', () => {
    const result = evaluateMinimumTestCohort({
      eligibleRuns: 100,
      uniqueThemes: 30,
    })

    expect(result.sufficient).toBe(true)
  })
})
