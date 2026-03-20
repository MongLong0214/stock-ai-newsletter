import { describe, expect, it } from 'vitest'
import {
  buildEvalRowV2,
  buildCensoredEvalRowV2,
  aggregateRunEvalSummary,
  buildSensitivityAnalysisRows,
  buildCensoringSensitivity,
} from '@/scripts/tli/comparison/v4/eval-writer'

describe('comparison v4 eval writer', () => {
  describe('buildEvalRowV2', () => {
    it('builds a full eval row from evaluator output', () => {
      const row = buildEvalRowV2({
        runId: 'run-1',
        candidateThemeId: 'past-1',
        evaluationHorizonDays: 14,
        trajectoryCorrH14: 0.72,
        positionStageMatchH14: true,
        binaryRelevant: true,
        gradedGain: 3,
        censoredReason: null,
        evaluatedAt: '2026-03-11',
      })

      expect(row.run_id).toBe('run-1')
      expect(row.candidate_theme_id).toBe('past-1')
      expect(row.evaluation_horizon_days).toBe(14)
      expect(row.trajectory_corr_h14).toBe(0.72)
      expect(row.position_stage_match_h14).toBe(true)
      expect(row.binary_relevant).toBe(true)
      expect(row.graded_gain).toBe(3)
      expect(row.censored_reason).toBeNull()
      expect(row.evaluated_at).toBe('2026-03-11')
    })
  })

  describe('buildCensoredEvalRowV2', () => {
    it('builds a censored eval row with zero metrics', () => {
      const row = buildCensoredEvalRowV2({
        runId: 'run-1',
        candidateThemeId: 'past-1',
        evaluationHorizonDays: 14,
        censoredReason: 'candidate_alignment_overflow',
        evaluatedAt: '2026-03-11',
      })

      expect(row.trajectory_corr_h14).toBeNull()
      expect(row.position_stage_match_h14).toBeNull()
      expect(row.binary_relevant).toBe(false)
      expect(row.graded_gain).toBe(0)
      expect(row.censored_reason).toBe('candidate_alignment_overflow')
    })
  })

  describe('aggregateRunEvalSummary', () => {
    it('computes precision@3, mean gain, and censored counts', () => {
      const summary = aggregateRunEvalSummary([
        { run_id: 'r1', candidate_theme_id: 'p1', evaluation_horizon_days: 14, trajectory_corr_h14: 0.8, position_stage_match_h14: true, binary_relevant: true, graded_gain: 3, censored_reason: null, evaluated_at: '2026-03-11' },
        { run_id: 'r1', candidate_theme_id: 'p2', evaluation_horizon_days: 14, trajectory_corr_h14: 0.5, position_stage_match_h14: false, binary_relevant: false, graded_gain: 2, censored_reason: null, evaluated_at: '2026-03-11' },
        { run_id: 'r1', candidate_theme_id: 'p3', evaluation_horizon_days: 14, trajectory_corr_h14: null, position_stage_match_h14: null, binary_relevant: false, graded_gain: 0, censored_reason: 'candidate_short_horizon', evaluated_at: '2026-03-11' },
      ])

      expect(summary.totalCandidates).toBe(3)
      expect(summary.evaluatedCount).toBe(2)
      expect(summary.censoredCount).toBe(1)
      expect(summary.relevantCount).toBe(1)
      expect(summary.precisionAtK).toBeCloseTo(1 / 2)
      expect(summary.meanGradedGain).toBeCloseTo((3 + 2) / 2)
      expect(summary.censorReasons).toEqual({ candidate_short_horizon: 1 })
    })

    it('handles all-censored run', () => {
      const summary = aggregateRunEvalSummary([
        { run_id: 'r1', candidate_theme_id: 'p1', evaluation_horizon_days: 14, trajectory_corr_h14: null, position_stage_match_h14: null, binary_relevant: false, graded_gain: 0, censored_reason: 'run_horizon_immature', evaluated_at: '2026-03-11' },
      ])

      expect(summary.evaluatedCount).toBe(0)
      expect(summary.precisionAtK).toBe(0)
      expect(summary.meanGradedGain).toBe(0)
    })
  })

  describe('buildSensitivityAnalysisRows', () => {
    it('produces sensitivity rows across threshold sweep', () => {
      const evalRows = [
        { run_id: 'r1', candidate_theme_id: 'p1', evaluation_horizon_days: 14, trajectory_corr_h14: 0.82, position_stage_match_h14: true, binary_relevant: true, graded_gain: 3, censored_reason: null, evaluated_at: '2026-03-11' },
        { run_id: 'r1', candidate_theme_id: 'p2', evaluation_horizon_days: 14, trajectory_corr_h14: 0.35, position_stage_match_h14: false, binary_relevant: false, graded_gain: 1, censored_reason: null, evaluated_at: '2026-03-11' },
      ]
      const candidateSimilarities = new Map<string, number>([
        ['p1', 0.65],
        ['p2', 0.42],
      ])

      const rows = buildSensitivityAnalysisRows({
        evalRows,
        candidateSimilarities,
        thresholds: [0.35, 0.45, 0.55],
      })

      expect(rows).toHaveLength(3)
      // At 0.35 threshold: both pass → 1/2 relevant
      expect(rows[0].threshold).toBe(0.35)
      expect(rows[0].matchCount).toBe(2)
      expect(rows[0].relevantCount).toBe(1)
      // At 0.45 threshold: only p1 (0.65) passes → 1/1 relevant
      expect(rows[1].threshold).toBe(0.45)
      expect(rows[1].matchCount).toBe(1)
      expect(rows[1].relevantCount).toBe(1)
      // At 0.55 threshold: only p1 (0.65) passes → 1/1 relevant
      expect(rows[2].threshold).toBe(0.55)
      expect(rows[2].matchCount).toBe(1)
      expect(rows[2].relevantCount).toBe(1)
    })

    it('returns zero counts when no candidates pass threshold', () => {
      const rows = buildSensitivityAnalysisRows({
        evalRows: [],
        candidateSimilarities: new Map(),
        thresholds: [0.5],
      })

      expect(rows[0].matchCount).toBe(0)
      expect(rows[0].relevantCount).toBe(0)
      expect(rows[0].precision).toBe(0)
    })
  })

  // ── Gap 3: PRD §6.8 — Censoring sensitivity (conservative/optimistic/paired-delta) ──

  describe('buildCensoringSensitivity', () => {
    const evalRows = [
      { run_id: 'r1', candidate_theme_id: 'p1', evaluation_horizon_days: 14, trajectory_corr_h14: 0.8, position_stage_match_h14: true, binary_relevant: true, graded_gain: 3, censored_reason: null, evaluated_at: '2026-03-11' },
      { run_id: 'r1', candidate_theme_id: 'p2', evaluation_horizon_days: 14, trajectory_corr_h14: null, position_stage_match_h14: null, binary_relevant: false, graded_gain: 0, censored_reason: 'candidate_short_horizon', evaluated_at: '2026-03-11' },
      { run_id: 'r1', candidate_theme_id: 'p3', evaluation_horizon_days: 14, trajectory_corr_h14: null, position_stage_match_h14: null, binary_relevant: false, graded_gain: 0, censored_reason: 'run_horizon_immature', evaluated_at: '2026-03-11' },
    ]

    it('conservative: censored candidates counted as gain 0', () => {
      const result = buildCensoringSensitivity(evalRows)

      // conservative: all 3 candidates counted, censored = gain 0
      // relevant: 1 out of 3 total
      expect(result.conservative.totalSlots).toBe(3)
      expect(result.conservative.relevantCount).toBe(1)
      expect(result.conservative.precision).toBeCloseTo(1 / 3)
      expect(result.conservative.meanGain).toBeCloseTo((3 + 0 + 0) / 3)
    })

    it('optimistic: censored candidates excluded', () => {
      const result = buildCensoringSensitivity(evalRows)

      // optimistic: only 1 evaluated candidate
      expect(result.optimistic.totalSlots).toBe(1)
      expect(result.optimistic.relevantCount).toBe(1)
      expect(result.optimistic.precision).toBeCloseTo(1 / 1)
      expect(result.optimistic.meanGain).toBeCloseTo(3)
    })

    it('paired delta by censor reason', () => {
      const result = buildCensoringSensitivity(evalRows)

      // 2 censored candidates with 2 different reasons
      expect(result.pairedDeltaByCensorReason).toHaveLength(2)
      const shortHorizon = result.pairedDeltaByCensorReason.find((r) => r.reason === 'candidate_short_horizon')
      expect(shortHorizon).toBeDefined()
      expect(shortHorizon!.count).toBe(1)
      expect(shortHorizon!.conservativePrecision).toBeDefined()
      expect(shortHorizon!.optimisticPrecision).toBeDefined()
      expect(shortHorizon!.delta).toBeDefined()
    })

    it('handles all-evaluated rows (no censoring)', () => {
      const allEvaluated = [
        { run_id: 'r1', candidate_theme_id: 'p1', evaluation_horizon_days: 14, trajectory_corr_h14: 0.8, position_stage_match_h14: true, binary_relevant: true, graded_gain: 3, censored_reason: null, evaluated_at: '2026-03-11' },
      ]
      const result = buildCensoringSensitivity(allEvaluated)

      expect(result.conservative.precision).toBe(result.optimistic.precision)
      expect(result.pairedDeltaByCensorReason).toHaveLength(0)
    })
  })
})
