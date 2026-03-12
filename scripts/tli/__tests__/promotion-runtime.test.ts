import { describe, expect, it } from 'vitest'
import {
  buildArtifactBackedPromotionContext,
  extractPromotionMetricsFromArtifacts,
  resolveRequiredWeightArtifact,
} from '../level4/promotion-runtime'

describe('promotion runtime', () => {
  it('derives promotion gate inputs from real artifacts instead of env booleans', () => {
    const metrics = extractPromotionMetricsFromArtifacts({
      calibrationArtifact: {
        source_surface: 'v2_certification',
        calibration_version: 'cal-2026-03-12',
        ci_method: 'cluster_bootstrap',
        bootstrap_iterations: 1000,
        brier_score_before: 0.10,
        brier_score_after: 0.08,
        ece_before: 0.12,
        ece_after: 0.10,
      },
      weightArtifact: {
        source_surface: 'v2_certification',
        weight_version: 'w-2026-03-12',
        validation_metric_summary: {
          mrr: { meanDelta: 0.01, lower: 0.001, upper: 0.02 },
          ndcg: { meanDelta: 0.01, lower: 0.001, upper: 0.02 },
          precisionAt3: { meanDelta: 0.02, lower: 0.001, upper: 0.03 },
        },
      },
      driftArtifact: {
        drift_status: 'stable',
        candidate_concentration_gini: 0.21,
        baseline_candidate_concentration_gini: 0.20,
        censoring_ratio: 0.11,
        baseline_censoring_ratio: 0.10,
        low_confidence_serving_rate: 0.20,
        auto_hold_enabled: true,
      },
    })

    expect(metrics.deltaPrecision.lower).toBe(0.001)
    expect(metrics.deltaMrr.lower).toBe(0.001)
    expect(metrics.deltaNdcg.lower).toBe(0.001)
    expect(metrics.baselineGini).toBe(0.20)
    expect(metrics.candidateGini).toBe(0.21)
  })

  it('fails closed when required weight artifact metric summaries are missing', () => {
    expect(() => extractPromotionMetricsFromArtifacts({
      calibrationArtifact: {
        source_surface: 'v2_certification',
        calibration_version: 'cal-2026-03-12',
        ci_method: 'cluster_bootstrap',
        bootstrap_iterations: 1000,
        brier_score_before: 0.10,
        brier_score_after: 0.08,
        ece_before: 0.12,
        ece_after: 0.10,
      },
      weightArtifact: {
        source_surface: 'v2_certification',
        weight_version: 'w-2026-03-12',
        validation_metric_summary: {},
      },
      driftArtifact: {
        drift_status: 'stable',
        candidate_concentration_gini: 0.21,
        baseline_candidate_concentration_gini: 0.20,
        censoring_ratio: 0.11,
        baseline_censoring_ratio: 0.10,
        low_confidence_serving_rate: 0.20,
        auto_hold_enabled: true,
      },
    })).toThrow(/validation_metric_summary\.(mrr|ndcg|precisionAt3)/i)
  })

  it('builds promotion context with gate verdict and auto-hold state from artifacts', () => {
    const context = buildArtifactBackedPromotionContext({
      calibrationArtifact: {
        source_surface: 'v2_certification',
        calibration_version: 'cal-2026-03-12',
        ci_method: 'cluster_bootstrap',
        bootstrap_iterations: 1000,
        brier_score_before: 0.10,
        brier_score_after: 0.08,
        ece_before: 0.12,
        ece_after: 0.10,
      },
      weightArtifact: {
        source_surface: 'v2_certification',
        weight_version: 'w-2026-03-12',
        validation_metric_summary: {
          mrr: { meanDelta: 0.01, lower: 0.001, upper: 0.02 },
          ndcg: { meanDelta: 0.01, lower: 0.001, upper: 0.02 },
          precisionAt3: { meanDelta: 0.02, lower: 0.001, upper: 0.03 },
        },
      },
      driftArtifact: {
        drift_version: 'drift-2026-03-12',
        drift_status: 'hold',
        candidate_concentration_gini: 0.21,
        baseline_candidate_concentration_gini: 0.20,
        censoring_ratio: 0.11,
        baseline_censoring_ratio: 0.10,
        low_confidence_serving_rate: 0.20,
        auto_hold_enabled: true,
        hold_report_date: '2026-03-12',
      },
    })

    expect(context.gateVerdict.passed).toBe(false)
    expect(context.gateVerdict.status).toBe('held')
    expect(context.autoHold.holdState).toBe('active')
  })

  it('fails closed when no certification-grade weight artifact is provided', () => {
    expect(() => resolveRequiredWeightArtifact(null)).toThrow(/weight artifact/i)
  })
})
