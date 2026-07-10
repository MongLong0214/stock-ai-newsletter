import { describe, expect, it } from 'vitest'
import {
  buildThemePredictionV3ScoringPlan,
  type GtALabelScoreRow,
  type ThemePredictionV3PendingRow,
} from '../comparison/theme-predictions-v3-scoring'

const predictions = [
  {
    id: 'p1',
    theme_id: 'theme-a',
    prediction_date: '2026-07-06',
    model_version: 'b-abl-v1',
    labeler_version: 'gta-v1',
    p_rise: 0.8,
    abstain: false,
  },
  {
    id: 'p2',
    theme_id: 'theme-b',
    prediction_date: '2026-07-06',
    model_version: 'b-abl-v1',
    labeler_version: 'gta-v1',
    p_rise: 0.2,
    abstain: false,
  },
  {
    id: 'p3',
    theme_id: 'theme-c',
    prediction_date: '2026-07-06',
    model_version: 'b-abl-v1',
    labeler_version: 'gta-v1',
    p_rise: null,
    abstain: true,
  },
  {
    id: 'p4',
    theme_id: 'theme-d',
    prediction_date: '2026-07-06',
    model_version: 'm1-shadow',
    labeler_version: 'gta-v1',
    p_rise: 0.9,
    abstain: false,
  },
  {
    id: 'p5',
    theme_id: 'theme-e',
    prediction_date: '2026-07-06',
    model_version: 'b-abl-v1',
    labeler_version: 'gta-v1',
    p_rise: 0.6,
    abstain: false,
  },
  {
    id: 'p6',
    theme_id: 'theme-f',
    prediction_date: '2026-07-06',
    model_version: 'b-abl-v1',
    labeler_version: 'gta-v1',
    p_rise: 0.5,
    abstain: false,
  },
] satisfies readonly ThemePredictionV3PendingRow[]

const labels = [
  {
    theme_id: 'theme-a',
    base_date: '2026-07-06',
    labeler_version: 'gta-v1',
    label_status: 'final',
    g_log_ratio: 0.12,
    y_binary: true,
  },
  {
    theme_id: 'theme-b',
    base_date: '2026-07-06',
    labeler_version: 'gta-v1',
    label_status: 'final',
    g_log_ratio: -0.08,
    y_binary: false,
  },
  {
    theme_id: 'theme-c',
    base_date: '2026-07-06',
    labeler_version: 'gta-v1',
    label_status: 'final',
    g_log_ratio: 0.2,
    y_binary: true,
  },
  {
    theme_id: 'theme-d',
    base_date: '2026-07-06',
    labeler_version: 'gta-v1',
    label_status: 'censored',
    g_log_ratio: null,
    y_binary: null,
  },
  {
    theme_id: 'theme-e',
    base_date: '2026-07-06',
    labeler_version: 'gta-v1',
    label_status: 'excluded',
    g_log_ratio: null,
    y_binary: null,
  },
  {
    theme_id: 'theme-f',
    base_date: '2026-07-06',
    labeler_version: 'gta-v1',
    label_status: 'pending',
    g_log_ratio: null,
    y_binary: null,
  },
] satisfies readonly GtALabelScoreRow[]

describe('T-303 theme_predictions_v3 scoring', () => {
  it('builds score updates from final, censored, and excluded GT-A labels', () => {
    const plan = buildThemePredictionV3ScoringPlan({
      predictions,
      labels,
      scoredAt: '2026-07-13T00:00:00.000Z',
    })

    expect(plan.updates).toEqual([
      {
        id: 'p1',
        actual_g: 0.12,
        actual_y: true,
        scored_at: '2026-07-13T00:00:00.000Z',
        score_status: 'scored',
      },
      {
        id: 'p2',
        actual_g: -0.08,
        actual_y: false,
        scored_at: '2026-07-13T00:00:00.000Z',
        score_status: 'scored',
      },
      {
        id: 'p3',
        actual_g: 0.2,
        actual_y: true,
        scored_at: '2026-07-13T00:00:00.000Z',
        score_status: 'scored',
      },
      {
        id: 'p4',
        actual_g: null,
        actual_y: null,
        scored_at: '2026-07-13T00:00:00.000Z',
        score_status: 'censored',
      },
      {
        id: 'p5',
        actual_g: null,
        actual_y: null,
        scored_at: '2026-07-13T00:00:00.000Z',
        score_status: 'excluded',
      },
    ])
    expect(plan.skippedPending).toBe(1)
  })

  it('reports only the (metric_date, model_version) keys touched by newly scored rows (C2)', () => {
    // Metric aggregation itself is computed by a full re-query in evaluateThemePredictionsV3 —
    // this plan only identifies which keys need to be recomputed, so a partial batch never
    // writes a partial/incremental aggregate.
    const plan = buildThemePredictionV3ScoringPlan({
      predictions,
      labels,
      scoredAt: '2026-07-13T00:00:00.000Z',
    })

    expect(plan.touchedMetricKeys).toEqual([
      { metricDate: '2026-07-06', modelVersion: 'b-abl-v1' },
    ])
  })

  it('matches coexisting labels by the prediction labeler version', () => {
    const plan = buildThemePredictionV3ScoringPlan({
      predictions: [predictions[0]],
      labels: [
        { ...labels[0], labeler_version: 'gta-v2', g_log_ratio: -0.4, y_binary: false },
        { ...labels[0], label_status: 'pending', g_log_ratio: null, y_binary: null },
      ],
      scoredAt: '2026-07-13T00:00:00.000Z',
    })

    expect(plan.updates).toEqual([])
    expect(plan.skippedPending).toBe(1)
  })
})
