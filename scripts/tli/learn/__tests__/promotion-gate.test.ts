import { describe, expect, it } from 'vitest'

import {
  bootstrapResultSha256,
  calculatePAt10,
  classifyKospiRegime,
  evaluateFinalPromotionGate,
  evaluateSafetyCheckpoint,
  resolveProspectiveCheckpoint,
} from '../promotion-gate'

const CYCLE_ID = '10000000-0000-4000-8000-000000000014'

type Origin = {
  readonly sequenceNo: number
  readonly originDate: string
  readonly enrollmentRole: 'confirmatory'
  readonly eligible: boolean
}

const origins = (count: number, start = 1): readonly Origin[] => Array.from(
  { length: count },
  (_, index) => ({
    sequenceNo: start + index,
    originDate: `2026-07-${String(6 + index).padStart(2, '0')}`,
    enrollmentRole: 'confirmatory' as const,
    eligible: true,
  }),
)

const lifecycleInput = (input: {
  readonly plannedOrigins?: 16 | 24
  readonly enrolledOrigins?: readonly Origin[]
  readonly safetyCheckedAt?: string | null
  readonly safetyArtifact?: {
    readonly decision: 'pass' | 'safety_hold'
    readonly attested: boolean
  } | null
  readonly decisionAt?: string | null
}) => ({
  cycleId: CYCLE_ID,
  cycleStatus: 'running' as const,
  plannedOrigins: input.plannedOrigins ?? 16,
  safetyOrigins: 8 as const,
  enrolledOrigins: input.enrolledOrigins ?? origins(7),
  safetyCheckedAt: input.safetyCheckedAt ?? null,
  safetyArtifact: input.safetyArtifact ?? null,
  decisionAt: input.decisionAt ?? null,
})

const passingSafety = {
  safetyCheckedAt: '2026-09-01T00:00:00.000Z',
  safetyArtifact: { decision: 'pass' as const, attested: true },
}

describe('frozen lifecycle', () => {
  it('observes only insufficient origins at sequence 7 and never exposes promotion', () => {
    const result = resolveProspectiveCheckpoint(lifecycleInput({ enrolledOrigins: origins(7) }))

    expect(result).toMatchObject({
      kind: 'insufficient_origins',
      checkpoint: 'safety',
      eligibleThroughSequence: 7,
    })
    expect(result).not.toHaveProperty('promotionAction')
  })

  it('opens one safety-only checkpoint at exact eligible sequences 1 through 8', () => {
    const result = resolveProspectiveCheckpoint(lifecycleInput({ enrolledOrigins: origins(8) }))

    expect(result).toEqual({
      kind: 'safety_due',
      cycleId: CYCLE_ID,
      sequenceStart: 1,
      sequenceEnd: 8,
    })
  })

  it('does not reopen safety after safety_checked_at and an attested passing artifact exist', () => {
    const result = resolveProspectiveCheckpoint(lifecycleInput({
      enrolledOrigins: origins(8),
      ...passingSafety,
    }))

    expect(result).toMatchObject({
      kind: 'insufficient_origins',
      checkpoint: 'final',
      eligibleThroughSequence: 8,
    })
  })

  it('waits at 15 and opens final only once at exact planned sequence 16', () => {
    const before = resolveProspectiveCheckpoint(lifecycleInput({
      enrolledOrigins: origins(15),
      ...passingSafety,
    }))
    const due = resolveProspectiveCheckpoint(lifecycleInput({
      enrolledOrigins: origins(16),
      ...passingSafety,
    }))
    const recorded = resolveProspectiveCheckpoint(lifecycleInput({
      enrolledOrigins: origins(16),
      decisionAt: '2026-11-01T00:00:00.000Z',
      ...passingSafety,
    }))

    expect(before).toMatchObject({ kind: 'insufficient_origins', checkpoint: 'final' })
    expect(due).toMatchObject({ kind: 'final_due', plannedOrigins: 16 })
    expect(recorded).toMatchObject({ kind: 'already_recorded', checkpoint: 'final' })
  })

  it('blocks N-label final evaluation without both passing attestation and safety_checked_at', () => {
    const missingArtifact = resolveProspectiveCheckpoint(lifecycleInput({
      enrolledOrigins: origins(16),
      safetyCheckedAt: passingSafety.safetyCheckedAt,
    }))
    const missingTimestamp = resolveProspectiveCheckpoint(lifecycleInput({
      enrolledOrigins: origins(16),
      safetyArtifact: passingSafety.safetyArtifact,
    }))
    const unattested = resolveProspectiveCheckpoint(lifecycleInput({
      enrolledOrigins: origins(16),
      safetyCheckedAt: passingSafety.safetyCheckedAt,
      safetyArtifact: { decision: 'pass', attested: false },
    }))

    for (const result of [missingArtifact, missingTimestamp, unattested]) {
      expect(result).toMatchObject({ kind: 'safety_evidence_missing' })
      expect(result).not.toHaveProperty('promotionAction')
    }
  })

  it('requires exact sequences and never substitutes N+1 for a missing planned origin', () => {
    const replacement = [...origins(7), ...origins(9, 9)]
    const result = resolveProspectiveCheckpoint(lifecycleInput({
      enrolledOrigins: replacement,
      ...passingSafety,
    }))

    expect(result).toMatchObject({
      kind: 'insufficient_origins',
      checkpoint: 'final',
      missingSequences: [8],
    })
    expect(result).not.toMatchObject({ kind: 'final_due' })
  })

  it('planned 24 waits at 23 and opens final only at sequence 24', () => {
    const before = resolveProspectiveCheckpoint(lifecycleInput({
      plannedOrigins: 24,
      enrolledOrigins: origins(23),
      ...passingSafety,
    }))
    const due = resolveProspectiveCheckpoint(lifecycleInput({
      plannedOrigins: 24,
      enrolledOrigins: origins(24),
      ...passingSafety,
    }))

    expect(before).toMatchObject({ kind: 'insufficient_origins', checkpoint: 'final' })
    expect(due).toMatchObject({ kind: 'final_due', plannedOrigins: 24 })
  })

  it('does not invent a sequence for an omitted closed Monday', () => {
    const aroundClosedMonday: readonly Origin[] = [
      { sequenceNo: 1, originDate: '2026-07-27', enrollmentRole: 'confirmatory', eligible: true },
      { sequenceNo: 2, originDate: '2026-08-10', enrollmentRole: 'confirmatory', eligible: true },
    ]
    const result = resolveProspectiveCheckpoint(lifecycleInput({ enrolledOrigins: aroundClosedMonday }))

    expect(result).toMatchObject({ eligibleThroughSequence: 2 })
    expect(aroundClosedMonday).toHaveLength(2)
    expect(aroundClosedMonday.map((origin) => origin.sequenceNo)).toEqual([1, 2])
  })
})

type SafetyRow = {
  readonly originDate: string
  readonly themeId: string
  readonly candidateProbability: number
  readonly outcome: boolean
}

const safetyRows = (probability: number, outcome: boolean): readonly SafetyRow[] => origins(8).map((origin) => ({
  originDate: origin.originDate,
  themeId: `theme-${origin.sequenceNo}`,
  candidateProbability: probability,
  outcome,
}))

const safetyInput = (rows: readonly SafetyRow[], criticalIncidentCount = 0) => ({
  cycleId: CYCLE_ID,
  sequenceStart: 1 as const,
  sequenceEnd: 8 as const,
  rows,
  criticalIncidentCount,
  gateInputSha256: 'a'.repeat(64),
  frozenHashes: {
    studyContractSha256: '1'.repeat(64),
    candidateModelSha256: '2'.repeat(64),
    comparatorArtifactSha256: '3'.repeat(64),
    datasetManifestSha256: '4'.repeat(64),
    featureContractSha256: '5'.repeat(64),
    labelContractSha256: '6'.repeat(64),
    calibrationArtifactSha256: '7'.repeat(64),
  },
})

describe('safety checkpoint', () => {
  it.each([Number.NaN, Number.POSITIVE_INFINITY, -0.001, 1.001])(
    'holds on a nonfinite or out-of-range probability %s',
    (probability) => {
      const result = evaluateSafetyCheckpoint(safetyInput(safetyRows(probability, true)))

      expect(result).toMatchObject({ decision: 'safety_hold', action: 'safety_hold' })
      expect(result.reasons).toContain('invalid_probability')
    },
  )

  it('passes pooled Brier exactly 0.35 and holds immediately above it', () => {
    const atBoundary: SafetyRow[] = [
      ...Array.from({ length: 2 }, (_, index) => ({
        originDate: '2026-07-06', themeId: `bad-${index}`, candidateProbability: 1, outcome: false,
      })),
      ...Array.from({ length: 13 }, (_, index) => ({
        originDate: '2026-07-13', themeId: `cal-${index}`, candidateProbability: 0.5, outcome: index < 6,
      })),
    ]
    const above = atBoundary.map((row) => row.themeId.startsWith('cal-')
      ? { ...row, candidateProbability: 0.51 }
      : row)

    expect(evaluateSafetyCheckpoint(safetyInput(atBoundary))).toMatchObject({ decision: 'pass' })
    const failure = evaluateSafetyCheckpoint(safetyInput(above))
    expect(failure).toMatchObject({ decision: 'safety_hold' })
    expect(failure.reasons).toContain('pooled_brier_catastrophe')
  })

  it('passes fixed-bin ECE exactly 0.20 and holds immediately above it', () => {
    expect(evaluateSafetyCheckpoint(safetyInput(safetyRows(0.8, true)))).toMatchObject({ decision: 'pass' })
    const failure = evaluateSafetyCheckpoint(safetyInput(safetyRows(0.799_999_999_999_5, true)))

    expect(failure).toMatchObject({ decision: 'safety_hold' })
    expect(failure.reasons).toContain('fixed_bin_ece_catastrophe')
  })

  it('holds on one critical incident and passes with zero', () => {
    expect(evaluateSafetyCheckpoint(safetyInput(safetyRows(0.95, true), 0))).toMatchObject({ decision: 'pass' })
    const failure = evaluateSafetyCheckpoint(safetyInput(safetyRows(0.95, true), 1))

    expect(failure).toMatchObject({ decision: 'safety_hold' })
    expect(failure.reasons).toContain('critical_incident')
  })

  it('is structurally safety-only even when the candidate is efficacy-positive', () => {
    const result = evaluateSafetyCheckpoint(safetyInput(safetyRows(0.99, true)))
    const serialized = JSON.stringify(result)

    expect(result).toMatchObject({ decision: 'pass', action: 'safety_only' })
    for (const forbidden of [
      'delta', 'relative', 'pAt10', 'p_at_10', 'bootstrap', 'regime',
      'confidenceInterval', 'upper99', 'verdict', 'promote', 'would_promote',
    ]) expect(serialized).not.toContain(forbidden)
  })
})

const HASHES = {
  studyContractSha256: '1'.repeat(64),
  candidateModelSha256: '2'.repeat(64),
  comparatorArtifactSha256: '3'.repeat(64),
  datasetManifestSha256: '4'.repeat(64),
  featureContractSha256: '5'.repeat(64),
  labelContractSha256: '6'.repeat(64),
  calibrationArtifactSha256: '7'.repeat(64),
} as const

const bootstrapCore = {
  contractVersion: 'bootstrap-v1' as const,
  method: 'theme_x_two_week_moving_block' as const,
  replicates: 10_000 as const,
  movingBlockLength: 2 as const,
  eceBinCount: 10 as const,
  inputSha256: 'a'.repeat(64),
  deltaBrier: {
    seed: 101,
    point: -0.1125,
    upper99: -0.01,
    replicateSha256: '8'.repeat(64),
  },
  ece: {
    seed: 102,
    point: 0.1,
    upper95: 0.11,
    replicateSha256: '9'.repeat(64),
  },
  regimeLower95: {
    risk_off: { seed: 103, lower95: -0.01, replicateSha256: 'b'.repeat(64) },
    neutral: { seed: 104, lower95: -0.01, replicateSha256: 'c'.repeat(64) },
    risk_on: { seed: 105, lower95: -0.01, replicateSha256: 'd'.repeat(64) },
  },
}

const passingBootstrap = () => ({
  ...bootstrapCore,
  resultSha256: bootstrapResultSha256(bootstrapCore),
})

const passingFinalInput = () => ({
  cycleId: CYCLE_ID,
  plannedOrigins: 16 as const,
  sequenceStart: 1 as const,
  sequenceEnd: 16,
  completeness: {
    pooledRatio: 1,
    minimumOriginRatio: 1,
    terminalAccountingRatio: 1,
    maximumOriginSourceGapRatio: 0,
    pooledCoverage: 1,
  },
  metrics: {
    candidateBrier: 0.01,
    comparatorBrier: 0.1225,
    pAt10Candidate: 1,
    pAt10Comparator: 1,
    pAt10ValidOrigins: 16,
    pAt10RequiredOrigins: 13,
    pAt10TieBreak: 'probability_desc_theme_id_asc' as const,
    regimes: [
      {
        regime: 'risk_off' as const,
        originCount: 4,
        pairedRowCount: 100,
        candidateBrier: 0.01,
        comparatorBrier: 0.1225,
        deltaLower95: -0.01,
      },
      {
        regime: 'neutral' as const,
        originCount: 8,
        pairedRowCount: 200,
        candidateBrier: 0.01,
        comparatorBrier: 0.1225,
        deltaLower95: -0.01,
      },
      {
        regime: 'risk_on' as const,
        originCount: 4,
        pairedRowCount: 100,
        candidateBrier: 0.01,
        comparatorBrier: 0.1225,
        deltaLower95: -0.01,
      },
    ],
  },
  criticalIncidentCount: 0,
  gateInputSha256: 'a'.repeat(64),
  frozenHashes: HASHES,
  expectedFrozenHashes: HASHES,
  bootstrap: passingBootstrap(),
})

describe('final statistical gates', () => {
  it('passes only when every prospective gate passes and exposes would_promote without promoting', () => {
    expect(evaluateFinalPromotionGate(passingFinalInput())).toMatchObject({
      decision: 'pass',
      action: 'would_promote',
      reasons: ['all_gates_passed'],
      relativeBrierImprovement: expect.closeTo(0.9183673469, 8),
    })
  })

  it.each([
    ['completeness', { completeness: { ...passingFinalInput().completeness, pooledRatio: 0.99 - 5e-13 } }, 'completeness_below_99pct'],
    ['coverage', { completeness: { ...passingFinalInput().completeness, pooledCoverage: 0.70 - 5e-13 } }, 'coverage_below_70pct'],
    ['delta upper', { bootstrap: { ...passingBootstrap(), deltaBrier: { ...bootstrapCore.deltaBrier, upper99: 0 } } }, 'delta_brier_upper99_not_below_zero'],
    ['ECE point', { bootstrap: { ...passingBootstrap(), ece: { ...bootstrapCore.ece, point: 0.10 + 5e-13 } } }, 'ece_point_above_10pct'],
    ['ECE upper', { bootstrap: { ...passingBootstrap(), ece: { ...bootstrapCore.ece, upper95: 0.12 + 5e-13 } } }, 'ece_upper95_above_12pct'],
    ['P@10 sample', { metrics: { ...passingFinalInput().metrics, pAt10ValidOrigins: 12 } }, 'p_at_10_insufficient_origins'],
    ['P@10 guardrail', { metrics: { ...passingFinalInput().metrics, pAt10Candidate: 0.53 - 5e-13, pAt10Comparator: 0.58 } }, 'p_at_10_guardrail'],
    ['critical incident', { criticalIncidentCount: 1 }, 'critical_incident'],
  ] as const)('rejects a final %s failure without extension or retraining', (_label, override, reason) => {
    const input = { ...passingFinalInput(), ...override }
    const result = evaluateFinalPromotionGate(input)

    expect(result).toMatchObject({ decision: 'reject', action: 'keep_champion' })
    expect(result.reasons).toContain(reason)
    expect(JSON.stringify(result)).not.toMatch(/extend|retrain/i)
  })

  it('requires relative Brier improvement of at least two percent', () => {
    const input = passingFinalInput()
    const result = evaluateFinalPromotionGate({
      ...input,
      metrics: { ...input.metrics, candidateBrier: 0.1 * (1 - (0.02 - 5e-13)), comparatorBrier: 0.1 },
    })

    expect(result.reasons).toContain('relative_brier_improvement_below_2pct')
  })

  it('rejects theme-only, wrong replicate count, input hash drift, result hash drift, and frozen hash drift', () => {
    const input = passingFinalInput()
    const failures = [
      { ...input, bootstrap: { ...input.bootstrap, method: 'theme_only' } },
      { ...input, bootstrap: { ...input.bootstrap, replicates: 9_999 } },
      { ...input, bootstrap: { ...input.bootstrap, inputSha256: 'e'.repeat(64) } },
      { ...input, bootstrap: { ...input.bootstrap, resultSha256: 'f'.repeat(64) } },
      {
        ...input,
        expectedFrozenHashes: { ...input.expectedFrozenHashes, candidateModelSha256: '0'.repeat(64) },
      },
    ]

    for (const failure of failures) {
      const result = evaluateFinalPromotionGate(failure)
      expect(result).toMatchObject({ decision: 'reject', action: 'keep_champion' })
      expect(result.reasons).toEqual(expect.arrayContaining([
        expect.stringMatching(/bootstrap|hash/),
      ]))
    }
  })

  it('uses independent probability-desc/theme-id-asc P@10 rankings and excludes origins below ten pairs', () => {
    const rows = [
      ...Array.from({ length: 12 }, (_, offset) => {
        const index = 11 - offset
        return {
        originDate: '2026-07-06',
        themeId: `theme-${String(index).padStart(2, '0')}`,
        candidateProbability: 0.5,
        comparatorProbability: index === 10 ? 0.9 : 0.5,
        outcome: index === 0 || index === 9,
        }
      }),
      ...Array.from({ length: 9 }, (_, index) => ({
        originDate: '2026-07-13',
        themeId: `short-${index}`,
        candidateProbability: 0.9,
        comparatorProbability: 0.9,
        outcome: true,
      })),
    ]

    expect(calculatePAt10(rows, 16)).toEqual({
      candidate: 0.2,
      comparator: 0.1,
      validOrigins: 1,
      requiredOrigins: 13,
      tieBreak: 'probability_desc_theme_id_asc',
    })
  })

  it('classifies exact KOSPI boundaries and exposes insufficient regimes without failing them', () => {
    expect(classifyKospiRegime(-0.03)).toBe('risk_off')
    expect(classifyKospiRegime(-0.029_999)).toBe('neutral')
    expect(classifyKospiRegime(0.029_999)).toBe('neutral')
    expect(classifyKospiRegime(0.03)).toBe('risk_on')

    const input = passingFinalInput()
    const bootstrapWithInsufficientNeutral = {
      ...bootstrapCore,
      regimeLower95: { ...bootstrapCore.regimeLower95, neutral: null },
    }
    const result = evaluateFinalPromotionGate({
      ...input,
      bootstrap: {
        ...bootstrapWithInsufficientNeutral,
        resultSha256: bootstrapResultSha256(bootstrapWithInsufficientNeutral),
      },
      metrics: {
        ...input.metrics,
        regimes: input.metrics.regimes.map((regime) => regime.regime === 'neutral'
          ? { ...regime, originCount: 3, pairedRowCount: 99, deltaLower95: null }
          : regime),
      },
    })
    expect(result).toMatchObject({ decision: 'pass' })
    expect(result.regimes).toContainEqual(expect.objectContaining({
      regime: 'neutral', status: 'insufficient_regime_sample', gateEligible: false,
    }))
  })

  it('rejects an eligible catastrophic regime reversal only when both conditions hold', () => {
    const input = passingFinalInput()
    const bootstrapWithPositiveRiskOff = {
      ...bootstrapCore,
      regimeLower95: {
        ...bootstrapCore.regimeLower95,
        risk_off: { ...bootstrapCore.regimeLower95.risk_off, lower95: 0.001 },
      },
    }
    const reversed = {
      ...input.metrics.regimes[0],
      candidateBrier: 0.12,
      comparatorBrier: 0.1,
      deltaLower95: 0.001,
    }
    const result = evaluateFinalPromotionGate({
      ...input,
      bootstrap: {
        ...bootstrapWithPositiveRiskOff,
        resultSha256: bootstrapResultSha256(bootstrapWithPositiveRiskOff),
      },
      metrics: { ...input.metrics, regimes: [reversed, ...input.metrics.regimes.slice(1)] },
    })

    expect(result).toMatchObject({ decision: 'reject', action: 'keep_champion' })
    expect(result.reasons).toContain('regime_catastrophic_reversal')
  })

  it('does not round a regime worsening below twenty percent up to catastrophe', () => {
    const input = passingFinalInput()
    const bootstrapWithPositiveRiskOff = {
      ...bootstrapCore,
      regimeLower95: {
        ...bootstrapCore.regimeLower95,
        risk_off: { ...bootstrapCore.regimeLower95.risk_off, lower95: 0.001 },
      },
    }
    const result = evaluateFinalPromotionGate({
      ...input,
      bootstrap: {
        ...bootstrapWithPositiveRiskOff,
        resultSha256: bootstrapResultSha256(bootstrapWithPositiveRiskOff),
      },
      metrics: {
        ...input.metrics,
        regimes: [{
          ...input.metrics.regimes[0],
          candidateBrier: 0.12 - 5e-13,
          comparatorBrier: 0.1,
          deltaLower95: 0.001,
        }, ...input.metrics.regimes.slice(1)],
      },
    })

    expect(result).toMatchObject({ decision: 'pass' })
  })
})
