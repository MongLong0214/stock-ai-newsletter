import { describe, expect, it } from 'vitest'
import {
  buildScientificPromotionGateInputFromRows,
  ScientificGateInputBlockedError,
} from '../gate-input-from-db'

const CYCLE_ID = '10000000-0000-4000-8000-000000000001'
const ORIGIN_ID = '20000000-0000-4000-8000-000000000001'
const ORIGIN_B_ID = '20000000-0000-4000-8000-000000000002'
const OTHER_CYCLE_ID = '10000000-0000-4000-8000-000000000002'
const LABEL_ID = '70000000-0000-4000-8000-000000000001'

const expected = (themeId: string, index = 0, originId = ORIGIN_ID) => ({
  originId,
  themeId,
  predictionDate: index === 0 ? '2026-07-06' : '2026-07-13',
  horizonDays: 5,
  labelerVersion: 'gta-v2',
})

const prediction = (input: {
  readonly themeId: string
  readonly role: 'candidate' | 'comparator'
  readonly index?: number
  readonly cycleId?: string
  readonly scoreStatus?: 'scored' | 'excluded'
  readonly abstain?: boolean
  readonly actualY?: boolean | null
  readonly originId?: string
  readonly ciLower?: number | null
  readonly ciUpper?: number | null
  readonly exclusionReason?: string | null
}) => ({
  id: `${input.themeId}-${input.role}-${input.cycleId ?? CYCLE_ID}`,
  experiment_cycle_id: input.cycleId ?? CYCLE_ID,
  experiment_origin_manifest_id: input.originId ?? ORIGIN_ID,
  theme_id: input.themeId,
  prediction_date: input.index === 0 || input.index === undefined ? '2026-07-06' : '2026-07-13',
  horizon_days: 5,
  labeler_version: 'gta-v2',
  scientific_prediction_role: input.role,
  p_rise: input.role === 'candidate' ? 0.8 : 0.6,
  ci_lower: input.ciLower === undefined ? (input.role === 'candidate' ? 0.7 : 0.5) : input.ciLower,
  ci_upper: input.ciUpper === undefined ? (input.role === 'candidate' ? 0.9 : 0.7) : input.ciUpper,
  abstain: input.abstain ?? false,
  actual_y: input.actualY === undefined ? true : input.actualY,
  actual_label_id: LABEL_ID,
  score_status: input.scoreStatus ?? 'scored',
  score_exclusion_reason: input.exclusionReason === undefined
    ? input.scoreStatus === 'excluded' ? 'zero_denominator' : null
    : input.exclusionReason,
})

const registryHistory = [
  { model_version: 'public-v1', status: 'champion', promoted_at: '2026-05-01T00:00:00.000Z' },
  { model_version: 'candidate-v2', status: 'challenger', promoted_at: null },
]

const build = (input?: {
  readonly expectedThemes?: readonly ReturnType<typeof expected>[]
  readonly predictions?: readonly ReturnType<typeof prediction>[]
}) => {
  const expectedThemes = input?.expectedThemes ?? [expected('theme-a'), expected('theme-b', 1)]
  const predictions = input?.predictions ?? expectedThemes.flatMap((row, index) => [
    prediction({ themeId: row.themeId, role: 'candidate', index }),
    prediction({ themeId: row.themeId, role: 'comparator', index }),
  ])
  return buildScientificPromotionGateInputFromRows({
    cycleId: CYCLE_ID,
    asOfDate: '2026-07-20',
    expectedThemes,
    predictions,
    registryHistory,
  })
}

describe('Todo 13 scientific gate input — completeness', () => {
  it('returns an explicit complete report and metrics from exact final non-abstain pairs', () => {
    const result = build()

    expect(result.completeness).toMatchObject({
      partial: false,
      expectedPairCount: 2,
      terminalPairCount: 2,
      exactPairedScoredCount: 2,
      ratio: 1,
      candidateNonAbstainCount: 2,
      coverage: 1,
      excludedReasonCounts: [],
      issues: [],
    })
    expect(result.gateInput.nEff).toBe(2)
    expect(Number.isFinite(result.gateInput.deltaBrierPoint)).toBe(true)
  })

  it('marks a one-theme error partial and blocks gate input below 99 percent', () => {
    const predictions = [
      prediction({ themeId: 'theme-a', role: 'candidate' }),
      prediction({ themeId: 'theme-a', role: 'comparator' }),
      prediction({ themeId: 'theme-b', role: 'candidate', index: 1 }),
    ]

    expect(() => build({ predictions })).toThrow(ScientificGateInputBlockedError)
    try {
      build({ predictions })
    } catch (error) {
      expect(error).toMatchObject({
        report: {
          partial: true,
          expectedPairCount: 2,
          terminalPairCount: 1,
          ratio: 0.5,
          issues: [expect.objectContaining({ themeId: 'theme-b', code: 'ROLE_CARDINALITY' })],
        },
      })
    }
  })

  it('counts excluded and abstained terminal pairs for completeness but not the exact metric sample', () => {
    const predictions = [
      prediction({ themeId: 'theme-a', role: 'candidate' }),
      prediction({ themeId: 'theme-a', role: 'comparator' }),
      prediction({ themeId: 'theme-b', role: 'candidate', index: 1, scoreStatus: 'excluded', abstain: true, actualY: null }),
      prediction({ themeId: 'theme-b', role: 'comparator', index: 1, scoreStatus: 'excluded', abstain: true, actualY: null }),
    ]

    const result = build({ predictions })
    expect(result.completeness).toMatchObject({
      ratio: 1,
      terminalPairCount: 2,
      exactPairedScoredCount: 1,
      candidateNonAbstainCount: 1,
      coverage: 0.5,
      excludedReasonCounts: [{ reason: 'zero_denominator', count: 1 }],
    })
    expect(result.gateInput.nEff).toBe(1)
  })

  it('blocks an excluded non-abstain pair whose frozen interval is incomplete', () => {
    const predictions = [
      prediction({
        themeId: 'theme-a', role: 'candidate', scoreStatus: 'excluded',
        actualY: null, ciLower: null,
      }),
      prediction({
        themeId: 'theme-a', role: 'comparator', scoreStatus: 'excluded', actualY: null,
      }),
    ]

    expect(() => build({ expectedThemes: [expected('theme-a')], predictions }))
      .toThrow(ScientificGateInputBlockedError)
    try {
      build({ expectedThemes: [expected('theme-a')], predictions })
    } catch (error) {
      expect(error).toMatchObject({
        report: {
          ratio: 0,
          excludedReasonCounts: [{ reason: 'zero_denominator', count: 1 }],
          issues: [expect.objectContaining({ code: 'INVALID_INTERVAL' })],
        },
      })
    }
  })

  it('blocks an excluded pair whose two role rows disagree on the exact reason', () => {
    const predictions = [
      prediction({
        themeId: 'theme-a', role: 'candidate', scoreStatus: 'excluded',
        abstain: true, actualY: null, exclusionReason: 'zero_denominator',
      }),
      prediction({
        themeId: 'theme-a', role: 'comparator', scoreStatus: 'excluded',
        abstain: true, actualY: null, exclusionReason: 'spec_mismatch',
      }),
    ]

    expect(() => build({ expectedThemes: [expected('theme-a')], predictions }))
      .toThrow(ScientificGateInputBlockedError)
    try {
      build({ expectedThemes: [expected('theme-a')], predictions })
    } catch (error) {
      expect(error).toMatchObject({
        report: {
          ratio: 0,
          issues: [expect.objectContaining({ code: 'EXCLUSION_REASON_MISMATCH' })],
        },
      })
    }
  })

  it('publishes every excluded reason count and enforces source_gap_sla at one percent per origin', () => {
    const expectedThemes = Array.from({ length: 100 }, (_, index) => expected(`theme-${index}`))
    const predictions = expectedThemes.flatMap((row, index) => {
      const excluded = index < 1
      return [
        prediction({
          themeId: row.themeId, role: 'candidate', scoreStatus: excluded ? 'excluded' : 'scored',
          abstain: excluded, actualY: excluded ? null : true,
          exclusionReason: excluded ? 'source_gap_sla' : null,
        }),
        prediction({
          themeId: row.themeId, role: 'comparator', scoreStatus: excluded ? 'excluded' : 'scored',
          abstain: excluded, actualY: excluded ? null : true,
          exclusionReason: excluded ? 'source_gap_sla' : null,
        }),
      ]
    })

    const allowed = build({ expectedThemes, predictions })
    expect(allowed.completeness).toMatchObject({
      ratio: 1,
      coverage: 0.99,
      excludedReasonCounts: [{ reason: 'source_gap_sla', count: 1 }],
      originCompleteness: [expect.objectContaining({
        originId: ORIGIN_ID,
        sourceGapSlaCount: 1,
        sourceGapSlaRatio: 0.01,
      })],
    })

    const overLimit = predictions.map((row) => row.theme_id === 'theme-1'
      ? {
          ...row,
          score_status: 'excluded' as const,
          abstain: true,
          actual_y: null,
          score_exclusion_reason: 'source_gap_sla',
        }
      : row)
    expect(() => build({ expectedThemes, predictions: overLimit }))
      .toThrow(ScientificGateInputBlockedError)
    try {
      build({ expectedThemes, predictions: overLimit })
    } catch (error) {
      expect(error).toMatchObject({
        report: {
          partial: true,
          ratio: 1,
          excludedReasonCounts: [{ reason: 'source_gap_sla', count: 2 }],
          originCompleteness: [expect.objectContaining({ sourceGapSlaRatio: 0.02 })],
        },
      })
    }
  })

  it('ignores rows from another cycle even when theme, date, role, and model lane coexist', () => {
    const base = [
      prediction({ themeId: 'theme-a', role: 'candidate' }),
      prediction({ themeId: 'theme-a', role: 'comparator' }),
      prediction({ themeId: 'theme-b', role: 'candidate', index: 1 }),
      prediction({ themeId: 'theme-b', role: 'comparator', index: 1 }),
    ]
    const foreign = base.map((row) => ({ ...row, id: `${row.id}-foreign`, experiment_cycle_id: OTHER_CYCLE_ID, p_rise: 0 }))

    const result = build({ predictions: [...base, ...foreign] })
    expect(result.completeness.ratio).toBe(1)
    expect(result.completeness.issues).toEqual([])
  })

  it('marks an unexpected requested-cycle row partial instead of silently dropping it', () => {
    const base = [
      prediction({ themeId: 'theme-a', role: 'candidate' }),
      prediction({ themeId: 'theme-a', role: 'comparator' }),
      prediction({ themeId: 'theme-b', role: 'candidate', index: 1 }),
      prediction({ themeId: 'theme-b', role: 'comparator', index: 1 }),
    ]
    const unexpected = {
      ...prediction({ themeId: 'theme-extra', role: 'candidate' }),
      id: 'theme-extra-candidate-unexpected',
    }

    const result = build({ predictions: [...base, unexpected] })
    expect(result.completeness).toMatchObject({
      partial: true,
      ratio: 1,
      issues: [expect.objectContaining({ themeId: 'theme-extra', code: 'UNEXPECTED_PREDICTION' })],
    })
  })

  it('never converts a null scored outcome into a negative observation', () => {
    const predictions = [
      prediction({ themeId: 'theme-a', role: 'candidate', actualY: null }),
      prediction({ themeId: 'theme-a', role: 'comparator', actualY: null }),
    ]

    expect(() => build({ expectedThemes: [expected('theme-a')], predictions }))
      .toThrow(ScientificGateInputBlockedError)
    try {
      build({ expectedThemes: [expected('theme-a')], predictions })
    } catch (error) {
      expect(error).toMatchObject({
        report: {
          ratio: 0,
          exactPairedScoredCount: 0,
          issues: [expect.objectContaining({ code: 'NULL_SCORED_OUTCOME' })],
        },
      })
    }
  })

  it('allows the exact 99 percent boundary but keeps partial and issue accounting explicit', () => {
    const expectedThemes = Array.from({ length: 100 }, (_, index) => expected(`theme-${index}`, index % 2))
    const predictions = expectedThemes.slice(0, 99).flatMap((row, index) => [
      prediction({ themeId: row.themeId, role: 'candidate', index: index % 2 }),
      prediction({ themeId: row.themeId, role: 'comparator', index: index % 2 }),
    ])

    const result = build({ expectedThemes, predictions })
    expect(result.completeness).toMatchObject({ partial: true, ratio: 0.99, terminalPairCount: 99 })
    expect(result.completeness.issues).toHaveLength(1)
    expect(result.gateInput.nEff).toBe(99)
  })

  it('blocks when one origin is below 99 percent even if the pooled ratio is 99 percent', () => {
    const originA = Array.from({ length: 100 }, (_, index) => expected(`a-${index}`, 0, ORIGIN_ID))
    const originB = Array.from({ length: 100 }, (_, index) => expected(`b-${index}`, 1, ORIGIN_B_ID))
    const completeRows = [...originA, ...originB.slice(0, 98)].flatMap((row) => [
      prediction({ themeId: row.themeId, role: 'candidate', index: row.predictionDate === '2026-07-06' ? 0 : 1, originId: row.originId }),
      prediction({ themeId: row.themeId, role: 'comparator', index: row.predictionDate === '2026-07-06' ? 0 : 1, originId: row.originId }),
    ])

    expect(() => build({ expectedThemes: [...originA, ...originB], predictions: completeRows }))
      .toThrow(ScientificGateInputBlockedError)
    try {
      build({ expectedThemes: [...originA, ...originB], predictions: completeRows })
    } catch (error) {
      expect(error).toMatchObject({
        report: {
          ratio: 0.99,
          originCompleteness: expect.arrayContaining([
            expect.objectContaining({ originId: ORIGIN_B_ID, ratio: 0.98 }),
          ]),
        },
      })
    }
  })

  it('blocks a terminal non-abstain pair with an incomplete interval', () => {
    const predictions = [
      prediction({ themeId: 'theme-a', role: 'candidate', ciLower: null }),
      prediction({ themeId: 'theme-a', role: 'comparator' }),
    ]

    expect(() => build({ expectedThemes: [expected('theme-a')], predictions }))
      .toThrow(ScientificGateInputBlockedError)
    try {
      build({ expectedThemes: [expected('theme-a')], predictions })
    } catch (error) {
      expect(error).toMatchObject({
        report: {
          ratio: 0,
          issues: [expect.objectContaining({ code: 'INVALID_INTERVAL' })],
        },
      })
    }
  })
})
