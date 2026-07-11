import { describe, expect, it, vi } from 'vitest'
import {
  buildScientificPredictionScoringPlan,
  executeScientificPredictionScoringPlan,
  ScientificScoringPartialError,
  type ScientificPredictionRow,
} from '../comparison/theme-predictions-v3-scientific-scoring'
import {
  CANDIDATE_ID,
  COMPARATOR_ID,
  LABEL_ID,
  makeScientificScoringFixture,
  ORIGIN_ID,
  STUDY_ID,
} from './theme-predictions-v3-scientific-scoring.fixture'

const build = (input = makeScientificScoringFixture()) => buildScientificPredictionScoringPlan(input)

const TERMINAL_FIELDS = new Set([
  'score_status', 'actual_label_id', 'score_payload_sha256', 'actual_g', 'actual_y', 'scored_at',
])

const immutableBytes = (rows: Iterable<object>): string => JSON.stringify(Array.from(rows, (row) => (
  Object.fromEntries(Object.entries(row).filter(([field]) => !TERMINAL_FIELDS.has(field)))
)))

interface StoredPredictionRow extends ScientificPredictionRow {
  readonly actual_label_id: string | null
  readonly score_payload_sha256: string | null
  readonly actual_g: number | null
  readonly actual_y: boolean | null
  readonly scored_at: string | null
}

describe('Todo 13 scientific scorer — version-exact', () => {
  it('scores only the requested gta-v2 cycle pair when v1/v2 and a same-model second cycle coexist', () => {
    const plan = build()

    expect(plan.finalizations.map((item) => item.predictionId)).toEqual([
      CANDIDATE_ID,
      COMPARATOR_ID,
    ])
    expect(plan.finalizations.every((item) => item.actualLabelId === LABEL_ID)).toBe(true)
    expect(plan.expectedThemeCount).toBe(1)
    expect(plan.intervalEligibleCount).toBe(2)
    expect(plan.intervalCompleteCount).toBe(2)
  })
})

describe('Todo 13 scientific scorer — fail-closed', () => {
  const expectPreflightFailure = async (
    mutate: (fixture: ReturnType<typeof makeScientificScoringFixture>) => void,
  ): Promise<void> => {
    const fixture = makeScientificScoringFixture()
    mutate(fixture)
    const finalize = vi.fn(async () => undefined)

    expect(() => buildScientificPredictionScoringPlan(fixture)).toThrow()
    expect(finalize).not.toHaveBeenCalled()
  }

  it.each([
    ['zero exact label', (fixture: ReturnType<typeof makeScientificScoringFixture>) => {
      fixture.labels = fixture.labels.filter((label) => label.id !== LABEL_ID)
    }],
    ['duplicate exact label', (fixture: ReturnType<typeof makeScientificScoringFixture>) => {
      const exact = fixture.labels.find((label) => label.id === LABEL_ID)
      if (exact) fixture.labels = [...fixture.labels, { ...exact, id: '70000000-0000-4000-8000-000000000099' }]
    }],
    ['zero exact role', (fixture: ReturnType<typeof makeScientificScoringFixture>) => {
      fixture.predictions = fixture.predictions.filter((row) => row.id !== COMPARATOR_ID)
    }],
    ['duplicate exact role', (fixture: ReturnType<typeof makeScientificScoringFixture>) => {
      const candidate = fixture.predictions.find((row) => row.id === CANDIDATE_ID)
      if (candidate) fixture.predictions = [...fixture.predictions, { ...candidate, id: '80000000-0000-4000-8000-000000000099' }]
    }],
    ['study mismatch', (fixture: ReturnType<typeof makeScientificScoringFixture>) => {
      fixture.studyOrigins = fixture.studyOrigins.map((row) => ({ ...row, study_contract_id: `${STUDY_ID}-wrong` }))
    }],
    ['forecast mismatch', (fixture: ReturnType<typeof makeScientificScoringFixture>) => {
      fixture.studyOrigins = fixture.studyOrigins.map((row) => ({ ...row, forecast_origin_manifest_id: `${ORIGIN_ID}-wrong` }))
    }],
    ['unattested origin', (fixture: ReturnType<typeof makeScientificScoringFixture>) => {
      fixture.evidenceAttestations = fixture.evidenceAttestations.filter((row) => (
        row.artifact_id !== '90000000-0000-4000-8000-000000000001'
      ))
    }],
    ['candidate model hash drift', (fixture: ReturnType<typeof makeScientificScoringFixture>) => {
      fixture.predictions = fixture.predictions.map((row) => row.id === CANDIDATE_ID
        ? { ...row, model_artifact_sha256: '9'.repeat(64) }
        : row)
    }],
    ['feature contract hash drift', (fixture: ReturnType<typeof makeScientificScoringFixture>) => {
      fixture.predictions = fixture.predictions.map((row) => row.id === CANDIDATE_ID
        ? { ...row, feature_contract_hash: '9'.repeat(64) }
        : row)
    }],
    ['cutoff drift', (fixture: ReturnType<typeof makeScientificScoringFixture>) => {
      fixture.predictions = fixture.predictions.map((row) => row.id === CANDIDATE_ID
        ? { ...row, forecast_cutoff: '2026-07-06T09:00:01.000Z' }
        : row)
    }],
    ['null final outcome', (fixture: ReturnType<typeof makeScientificScoringFixture>) => {
      fixture.labels = fixture.labels.map((label) => label.id === LABEL_ID
        ? { ...label, y_binary: null }
        : label)
    }],
  ] as const)('%s causes a zero-mutation run failure', async (_name, mutate) => {
    await expectPreflightFailure(mutate)
  })

  it('rejects an exact pair whose feature snapshot hashes differ by role', () => {
    const fixture = makeScientificScoringFixture()
    fixture.predictions = fixture.predictions.map((row) => row.id === COMPARATOR_ID
      ? { ...row, feature_snapshot_hash: '9'.repeat(64) }
      : row)

    expect(() => buildScientificPredictionScoringPlan(fixture)).toThrow(/feature snapshot/i)
  })

  it('rejects the same tampered feature snapshot hash on both roles', () => {
    const fixture = makeScientificScoringFixture()
    fixture.predictions = fixture.predictions.map((row) => (
      row.experiment_cycle_id === fixture.requestedCycleId
        ? { ...row, feature_snapshot_hash: '9'.repeat(64) }
        : row
    ))

    expect(() => buildScientificPredictionScoringPlan(fixture)).toThrow(/feature/i)
  })
})

describe('Todo 13 scientific scorer — terminal scoring', () => {
  it('uses the canonical RPC once per role, changes only terminal fields, and rejects a second score', async () => {
    const fixture = makeScientificScoringFixture()
    const plan = build(fixture)
    const rows = new Map<string, StoredPredictionRow>(fixture.predictions
      .filter((row) => row.id === CANDIDATE_ID || row.id === COMPARATOR_ID)
      .map((row) => [row.id, { ...row, actual_label_id: null, score_payload_sha256: null, actual_g: null, actual_y: null, scored_at: null }]))
    const inferenceBefore = immutableBytes(rows.values())
    const finalize = vi.fn(async ({ canonicalJson, payloadSha256 }: {
      readonly canonicalJson: string
      readonly payloadSha256: string
    }) => {
      const payload = JSON.parse(canonicalJson) as {
        prediction_id: string
        actual_label_id: string
        score_status: string
        scored_at: string
      }
      const row = rows.get(payload.prediction_id)
      if (!row || row.score_status !== 'pending') throw new Error('already terminal')
      rows.set(payload.prediction_id, {
        ...row,
        score_status: payload.score_status,
        actual_label_id: payload.actual_label_id,
        score_payload_sha256: payloadSha256,
        actual_g: 0.25,
        actual_y: true,
        scored_at: payload.scored_at,
      })
    })

    const result = await executeScientificPredictionScoringPlan(plan, finalize)
    expect(result).toMatchObject({ status: 'complete', completedFinalizations: 2 })
    expect(finalize).toHaveBeenCalledTimes(2)
    expect([...rows.values()].every((row) => (
      row.actual_label_id === LABEL_ID
      && typeof row.score_payload_sha256 === 'string'
      && row.actual_y === true
      && row.actual_g === 0.25
      && row.scored_at === fixture.scoredAt
    ))).toBe(true)
    const inferenceAfter = immutableBytes(rows.values())
    expect(inferenceAfter).toBe(inferenceBefore)

    await expect(executeScientificPredictionScoringPlan(plan, finalize))
      .rejects.toBeInstanceOf(ScientificScoringPartialError)
    expect(finalize).toHaveBeenCalledTimes(3)
  })

  it('reports a one-role RPC failure as explicit partial completion', async () => {
    const finalize = vi.fn(async () => {
      if (finalize.mock.calls.length === 2) throw new Error('comparator write failed')
    })

    await expect(executeScientificPredictionScoringPlan(build(), finalize)).rejects.toMatchObject({
      result: {
        status: 'partial',
        completedFinalizations: 1,
        plannedFinalizations: 2,
      },
    })
  })

  it('keeps a scoring SHA rejection at zero completed finalizations', async () => {
    const finalize = vi.fn(async () => {
      throw new Error('score payload SHA mismatch')
    })

    await expect(executeScientificPredictionScoringPlan(build(), finalize)).rejects.toMatchObject({
      result: {
        status: 'partial',
        completedFinalizations: 0,
      },
    })
    expect(finalize).toHaveBeenCalledTimes(1)
  })

  it('rejects an unverified finalization plan before any RPC can run', async () => {
    const finalize = vi.fn(async () => {})

    await expect(executeScientificPredictionScoringPlan({ finalizations: [] }, finalize)).rejects.toMatchObject({
      name: 'ScientificScoringCriticalIncidentError',
      kind: 'critical_incident',
      code: 'scientific_scoring_plan_unverified',
      predictionId: null,
    })
    expect(finalize).not.toHaveBeenCalled()
  })

  it('freezes a verified plan so finalizations cannot be replaced after replay validation', () => {
    const plan = build()

    expect(Object.isFrozen(plan)).toBe(true)
    expect(Object.isFrozen(plan.finalizations)).toBe(true)
    expect(plan.finalizations.every((item) => Object.isFrozen(item))).toBe(true)
  })

  it('plans the exact excluded label reason for both roles', () => {
    const fixture = makeScientificScoringFixture()
    fixture.labels = fixture.labels.map((label) => label.id === LABEL_ID
      ? {
          ...label,
          label_status: 'excluded',
          scientific_use_status: 'exploratory_only',
          g_log_ratio: null,
          y_binary: null,
          exclude_reason: 'source_gap_sla',
        }
      : label)

    expect(buildScientificPredictionScoringPlan(fixture).finalizations).toEqual([
      expect.objectContaining({ role: 'candidate', scoreStatus: 'excluded', scoreExclusionReason: 'source_gap_sla' }),
      expect.objectContaining({ role: 'comparator', scoreStatus: 'excluded', scoreExclusionReason: 'source_gap_sla' }),
    ])
  })
})
