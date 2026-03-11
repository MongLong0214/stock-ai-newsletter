import { describe, expect, it } from 'vitest'
import {
  COMPARISON_PRIMARY_HORIZON_DAYS,
  COMPARISON_RUN_TYPES,
  COMPARISON_CANDIDATE_POOLS,
  COMPARISON_TIE_BREAK,
  THRESHOLD_REGIMES,
  computeBinaryRelevance,
  computeGradedGain,
  classifyRunLevelCensoring,
} from '../comparison/spec'

describe('comparison spec', () => {
  it('defines the primary horizon as 14 days', () => {
    expect(COMPARISON_PRIMARY_HORIZON_DAYS).toBe(14)
  })

  it('defines canonical run types and candidate pools', () => {
    expect(COMPARISON_RUN_TYPES).toEqual(['prod', 'shadow', 'backtest'])
    expect(COMPARISON_CANDIDATE_POOLS).toEqual(['archetype', 'peer', 'mixed_legacy'])
  })

  it('defines deterministic tie-break ordering', () => {
    expect(COMPARISON_TIE_BREAK).toEqual(['similarity_score_desc', 'candidate_theme_id_asc'])
  })

  it('defines the three threshold regimes', () => {
    expect(THRESHOLD_REGIMES).toEqual([
      { id: 'curve_len_gte_14', minCurveLength: 14, maxCurveLength: null },
      { id: 'curve_len_7_13', minCurveLength: 7, maxCurveLength: 13 },
      { id: 'curve_len_lt_7', minCurveLength: 0, maxCurveLength: 6 },
    ])
  })

  it('treats relevance as requiring both trajectory alignment and stage alignment', () => {
    expect(computeBinaryRelevance({ trajectoryCorrH14: 0.31, positionStageMatchH14: true })).toBe(true)
    expect(computeBinaryRelevance({ trajectoryCorrH14: 0.31, positionStageMatchH14: false })).toBe(false)
    expect(computeBinaryRelevance({ trajectoryCorrH14: 0.29, positionStageMatchH14: true })).toBe(false)
  })

  it('computes graded gain from the canonical thresholds', () => {
    expect(computeGradedGain({ trajectoryCorrH14: 0.61, positionStageMatchH14: true })).toBe(3)
    expect(computeGradedGain({ trajectoryCorrH14: 0.50, positionStageMatchH14: false })).toBe(2)
    expect(computeGradedGain({ trajectoryCorrH14: 0.35, positionStageMatchH14: false })).toBe(1)
    expect(computeGradedGain({ trajectoryCorrH14: 0.29, positionStageMatchH14: true })).toBe(0)
  })

  it('classifies run-level censoring explicitly', () => {
    expect(classifyRunLevelCensoring({ hasSufficientFutureWindow: false, hasPointInTimeSnapshot: true })).toBe('run_horizon_immature')
    expect(classifyRunLevelCensoring({ hasSufficientFutureWindow: true, hasPointInTimeSnapshot: false })).toBe('run_missing_point_in_time_snapshot')
    expect(classifyRunLevelCensoring({ hasSufficientFutureWindow: true, hasPointInTimeSnapshot: true })).toBe(null)
  })
})
