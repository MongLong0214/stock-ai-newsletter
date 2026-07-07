import { describe, expect, it } from 'vitest'
import {
  REPLAY_AUDIT_CRITERIA,
  buildReplayAuditReport,
  evaluateReplayAuditCriteria,
  joinReplayRowsWithFinalLabels,
  renderReplayAuditMarkdown,
  type ReplayAuditLabelRow,
  type ReplayAuditPredictionRow,
} from '../learn/replay-audit'

const predictionRows = [
  { themeId: 'theme-a', baseDate: '2026-06-08', pRiseM1: 0.8, pRiseBAbl: 1 },
  { themeId: 'theme-b', baseDate: '2026-06-08', pRiseM1: 0.2, pRiseBAbl: 0 },
  { themeId: 'theme-c', baseDate: '2026-06-09', pRiseM1: 0.7, pRiseBAbl: 0 },
  { themeId: 'theme-d', baseDate: '2026-06-09', pRiseM1: null, pRiseBAbl: 1 },
] satisfies readonly ReplayAuditPredictionRow[]

const labelRows = [
  { themeId: 'theme-a', baseDate: '2026-06-08', labelStatus: 'final', yBinary: true },
  { themeId: 'theme-b', baseDate: '2026-06-08', labelStatus: 'final', yBinary: false },
  { themeId: 'theme-c', baseDate: '2026-06-09', labelStatus: 'censored', yBinary: null },
] satisfies readonly ReplayAuditLabelRow[]

const metric = (overrides: {
  readonly brier: number | null
  readonly ece: number | null
  readonly ic: number | null
}) => ({
  totalCandidates: 40,
  nScored: 40,
  coverage: 1,
  baseRate: 0.5,
  brier: overrides.brier,
  ece: overrides.ece,
  eceBinCount: 1,
  eceUpper95: null,
  ic: overrides.ic,
  risingPAt10: 0.5,
})

describe('TLI replay audit', () => {
  it('joins predictions to final GT-A labels and counts missing or non-final labels as excluded', () => {
    const joined = joinReplayRowsWithFinalLabels({ predictionRows, labelRows })

    expect(joined.rows).toEqual([
      { themeId: 'theme-a', baseDate: '2026-06-08', pRiseM1: 0.8, pRiseBAbl: 1, label: true },
      { themeId: 'theme-b', baseDate: '2026-06-08', pRiseM1: 0.2, pRiseBAbl: 0, label: false },
    ])
    expect(joined.excludedRows).toBe(2)
  })

  it('evaluates the pre-registered pass/fail criteria fail-closed on null metrics', () => {
    expect(evaluateReplayAuditCriteria({
      m1: metric({ brier: 0.19, ece: 0.04, ic: 0.1 }),
      bAbl: metric({ brier: 0.22, ece: 0.12, ic: -0.1 }),
    })).toEqual({
      m1BrierBelowBAbl: true,
      m1BrierAbsolute: true,
      m1EceMax: true,
      m1IcPositive: true,
    })

    expect(evaluateReplayAuditCriteria({
      m1: metric({ brier: 0.21, ece: null, ic: 0 }),
      bAbl: metric({ brier: 0.20, ece: 0.12, ic: -0.1 }),
    })).toEqual({
      m1BrierBelowBAbl: false,
      m1BrierAbsolute: true,
      m1EceMax: false,
      m1IcPositive: false,
    })
    expect(REPLAY_AUDIT_CRITERIA.m1EceMax).toBe(0.08)
  })

  it('assembles a pass verdict, weekly subset, and markdown summary from scored rows', () => {
    const rows = Array.from({ length: 40 }, (_, index) => {
      const label = index % 2 === 0
      return {
        themeId: `theme-${index}`,
        baseDate: '2026-06-08',
        pRiseM1: label ? 1 : 0,
        pRiseBAbl: 0.5,
        label,
      }
    })
    const report = buildReplayAuditReport({
      trainEnd: '2026-05-29',
      replayStart: '2026-06-08',
      replayEnd: '2026-06-26',
      tradingDays: ['2026-06-08'],
      scoredRows: rows,
      excludedRows: 3,
      brierDeltaIterations: 200,
    })

    expect(report.reportVersion).toBe('tli-replay-audit-v1')
    expect(report.scoredRows).toBe(40)
    expect(report.weeklyNonOverlap.m1.nScored).toBe(40)
    expect(report.brierDeltaCi.confidenceLevel).toBe(0.99)
    expect(report.criteria).toEqual({
      m1BrierBelowBAbl: true,
      m1BrierAbsolute: true,
      m1EceMax: true,
      m1IcPositive: true,
    })
    expect(report.verdict).toBe('pass')
    expect(renderReplayAuditMarkdown(report)).toContain('| Verdict | pass |')
  })
})
