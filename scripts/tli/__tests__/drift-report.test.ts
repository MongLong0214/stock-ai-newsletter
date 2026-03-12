import { describe, expect, it } from 'vitest'
import { evaluateAutoHoldDecision } from '../level4/auto-hold'
import { assessDriftBaselineMaturity } from '../level4/drift-baseline'
import {
  aggregateRollingDriftBaseline,
  buildDriftReportArtifact,
  buildDriftReportMarkdown,
  fetchLatestDriftArtifact,
  upsertDriftReportArtifact,
} from '../level4/drift-report'

const driftRows = [
  {
    runId: 'run-1',
    evaluatedAt: '2026-03-01',
    binaryRelevant: true,
    censoredReason: null,
    relevanceProbability: 0.72,
    supportCount: 240,
    probabilityCiLower: 0.68,
    probabilityCiUpper: 0.76,
    firstSpikeInferred: false,
  },
  {
    runId: 'run-1',
    evaluatedAt: '2026-03-01',
    binaryRelevant: false,
    censoredReason: null,
    relevanceProbability: 0.18,
    supportCount: 80,
    probabilityCiLower: 0.08,
    probabilityCiUpper: 0.26,
    firstSpikeInferred: true,
  },
  {
    runId: 'run-2',
    evaluatedAt: '2026-03-02',
    binaryRelevant: false,
    censoredReason: 'run_horizon_immature',
    relevanceProbability: 0.06,
    supportCount: 20,
    probabilityCiLower: 0.01,
    probabilityCiUpper: 0.29,
    firstSpikeInferred: true,
  },
]

describe('level4 drift report', () => {
  it('builds a monthly artifact with support-bucket precision using serving confidence rules', () => {
    const artifact = buildDriftReportArtifact({
      driftVersion: 'drift-2026-03',
      reportDate: '2026-03-31',
      sourceSurface: 'v2_certification',
      rows: driftRows,
      baselineWindowMonths: 3,
      baselineRowCount: 3600,
      autoHoldEnabled: true,
    })

    expect(artifact.relevance_base_rate).toBeCloseTo(1 / 3)
    expect(artifact.censoring_ratio).toBeCloseTo(1 / 3)
    expect(artifact.first_spike_inference_rate).toBeCloseTo(2 / 3)
    expect(artifact.support_bucket_precision.high).toBe(1)
    expect(artifact.support_bucket_precision.medium).toBe(0)
    expect(artifact.support_bucket_precision.low).toBe(0)
    expect(artifact.baseline_candidate_concentration_gini).toBe(artifact.candidate_concentration_gini)
    expect(artifact.baseline_censoring_ratio).toBe(artifact.censoring_ratio)
    expect(artifact.low_confidence_serving_rate).toBeGreaterThanOrEqual(0)
    expect(artifact.hold_report_date).toBeNull()
    expect(artifact.drift_status).toBe('stable')

    const markdown = buildDriftReportMarkdown(artifact)
    expect(markdown).toContain('[OBJECTIVE]')
    expect(markdown).toContain('[FINDING]')
    expect(markdown).toContain('[LIMITATION]')
  })

  it('persists a drift report artifact with read-after-write validation', async () => {
    const artifact = buildDriftReportArtifact({
      driftVersion: 'drift-2026-03',
      reportDate: '2026-03-31',
      sourceSurface: 'v2_certification',
      rows: driftRows,
      baselineWindowMonths: 3,
      baselineRowCount: 3600,
      autoHoldEnabled: true,
    })

    const client = {
      from(table: string) {
        expect(table).toBe('drift_report_artifact')
        return {
          upsert(row: typeof artifact) {
            return {
              select() {
                return {
                  single: async () => ({ data: row, error: null }),
                }
              },
            }
          },
        }
      },
    }

    await expect(upsertDriftReportArtifact(client, artifact)).resolves.toEqual(artifact)
  })

  it('fetches the latest drift artifact by created_at', async () => {
    const client = {
      from(table: string) {
        expect(table).toBe('drift_report_artifact')
        return {
          select() {
            return {
              order() {
                return {
                  limit() {
                    return {
                      maybeSingle: async () => ({
                        data: {
                          drift_version: 'drift-latest',
                          created_at: '2026-03-12T00:00:00Z',
                        },
                        error: null,
                      }),
                    }
                  },
                }
              },
            }
          },
        }
      },
    }

    await expect(fetchLatestDriftArtifact(client as never)).resolves.toMatchObject({
      drift_version: 'drift-latest',
    })
  })

  it('aggregates a rolling baseline from multiple prior drift artifacts', () => {
    const baseline = aggregateRollingDriftBaseline([
      {
        drift_version: 'drift-1',
        report_date: '2026-03-01',
        source_surface: 'v2_certification',
        relevance_base_rate: 0.10,
        calibration_curve_error: 0.02,
        brier: 0.04,
        ece: 0.02,
        candidate_concentration_gini: 0.10,
        baseline_candidate_concentration_gini: 0.10,
        censoring_ratio: 0.08,
        baseline_censoring_ratio: 0.08,
        first_spike_inference_rate: 0,
        support_bucket_precision: { high: 0.8, medium: 0.6, low: 0.2 },
        low_confidence_serving_rate: 0.1,
        baseline_window_months: 3,
        baseline_row_count: 1000,
        auto_hold_enabled: true,
        drift_status: 'stable',
        triggered_rules: [],
        base_rate: 0.10,
        hold_report_date: null,
      },
      {
        drift_version: 'drift-2',
        report_date: '2026-02-01',
        source_surface: 'v2_certification',
        relevance_base_rate: 0.20,
        calibration_curve_error: 0.03,
        brier: 0.05,
        ece: 0.04,
        candidate_concentration_gini: 0.20,
        baseline_candidate_concentration_gini: 0.20,
        censoring_ratio: 0.12,
        baseline_censoring_ratio: 0.12,
        first_spike_inference_rate: 0,
        support_bucket_precision: { high: 0.9, medium: 0.7, low: 0.4 },
        low_confidence_serving_rate: 0.2,
        baseline_window_months: 3,
        baseline_row_count: 3000,
        auto_hold_enabled: true,
        drift_status: 'stable',
        triggered_rules: [],
        base_rate: 0.20,
        hold_report_date: null,
      },
    ])

    expect(baseline?.relevanceBaseRate).toBeCloseTo(0.175)
    expect(baseline?.ece).toBeCloseTo(0.035)
    expect(baseline?.supportBucketPrecision.low).toBeCloseTo(0.35)
  })
})

describe('level4 drift baseline maturity', () => {
  it('keeps the system in observation-only mode before baseline maturity is reached', () => {
    const result = assessDriftBaselineMaturity({
      distinctCalendarMonths: 2,
      baselineRowCount: 2800,
      distinctEvaluatedRunDates: 18,
    })

    expect(result.mature).toBe(false)
    expect(result.autoHoldEnabled).toBe(false)
    expect(result.mode).toBe('observation_only')
    expect(result.unmetCriteria).toEqual([
      'distinct_calendar_months',
      'baseline_row_count',
      'distinct_evaluated_run_dates',
    ])
  })

  it('enables auto-hold once the baseline maturity thresholds are met', () => {
    const result = assessDriftBaselineMaturity({
      distinctCalendarMonths: 3,
      baselineRowCount: 3000,
      distinctEvaluatedRunDates: 30,
    })

    expect(result.mature).toBe(true)
    expect(result.autoHoldEnabled).toBe(true)
    expect(result.mode).toBe('active')
    expect(result.unmetCriteria).toEqual([])
  })
})

describe('level4 auto-hold engine', () => {
  it('triggers hold when low-bucket precision drops beyond the configured threshold', () => {
    const decision = evaluateAutoHoldDecision({
      baselineMaturity: assessDriftBaselineMaturity({
        distinctCalendarMonths: 3,
        baselineRowCount: 3200,
        distinctEvaluatedRunDates: 31,
      }),
      calibrationArtifactPresent: true,
      current: {
        relevanceBaseRate: 0.05,
        ece: 0.03,
        censoringRatio: 0.11,
        candidateConcentrationGini: 0.20,
        supportBucketPrecision: { high: 0.82, medium: 0.56, low: 0.09 },
      },
      baseline: {
        relevanceBaseRate: 0.05,
        ece: 0.02,
        censoringRatio: 0.07,
        candidateConcentrationGini: 0.17,
        supportBucketPrecision: { high: 0.83, medium: 0.58, low: 0.17 },
      },
      reportDate: '2026-03-31',
    })

    expect(decision.shouldHold).toBe(true)
    expect(decision.holdState).toBe('active')
    expect(decision.triggeredRules).toContain('low_support_bucket_precision')
  })

  it('does not activate hold when the baseline is immature', () => {
    const decision = evaluateAutoHoldDecision({
      baselineMaturity: assessDriftBaselineMaturity({
        distinctCalendarMonths: 2,
        baselineRowCount: 1400,
        distinctEvaluatedRunDates: 12,
      }),
      calibrationArtifactPresent: true,
      current: {
        relevanceBaseRate: 0.10,
        ece: 0.09,
        censoringRatio: 0.20,
        candidateConcentrationGini: 0.35,
        supportBucketPrecision: { high: 0.80, medium: 0.40, low: 0.05 },
      },
      baseline: {
        relevanceBaseRate: 0.04,
        ece: 0.02,
        censoringRatio: 0.07,
        candidateConcentrationGini: 0.18,
        supportBucketPrecision: { high: 0.84, medium: 0.56, low: 0.16 },
      },
      reportDate: '2026-03-31',
    })

    expect(decision.shouldHold).toBe(false)
    expect(decision.holdState).toBe('observation_only')
    expect(decision.triggeredRules).toEqual([])
  })

  it('triggers hold when the certification calibration artifact is missing', () => {
    const decision = evaluateAutoHoldDecision({
      baselineMaturity: assessDriftBaselineMaturity({
        distinctCalendarMonths: 3,
        baselineRowCount: 3200,
        distinctEvaluatedRunDates: 31,
      }),
      calibrationArtifactPresent: false,
      current: {
        relevanceBaseRate: 0.05,
        ece: 0.03,
        censoringRatio: 0.11,
        candidateConcentrationGini: 0.20,
        supportBucketPrecision: { high: 0.82, medium: 0.56, low: 0.12 },
      },
      baseline: {
        relevanceBaseRate: 0.05,
        ece: 0.02,
        censoringRatio: 0.07,
        candidateConcentrationGini: 0.17,
        supportBucketPrecision: { high: 0.83, medium: 0.58, low: 0.17 },
      },
      reportDate: '2026-03-31',
    })

    expect(decision.shouldHold).toBe(true)
    expect(decision.triggeredRules).toContain('missing_calibration_artifact')
  })
})
