import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FEATURE_NAMES } from '@/lib/tli/features/build-features'
import type { FeatureVector } from '@/lib/tli/features/build-features'
import { UnsupportedLegacyArtifactError } from '@/lib/tli/model/predict'

const registryMocks = vi.hoisted(() => ({
  snapshotRows: [] as Array<{ theme_id: string; snapshot_date: string; phase: string }>,
  recentLabelRows: [] as Array<{ base_date: string; y_binary: boolean | null }>,
  championEntry: null as { model_version: string; model_type: string; coefficients: unknown } | null,
  challengerEntry: null as { model_version: string; model_type: string; coefficients: unknown } | null,
  upsertLegacyPredictionsV3: vi.fn(async (_rows: Array<Record<string, unknown>>) => {
    void _rows
    return _rows.length
  }),
  loadFeatureInputsForBaseDate: vi.fn(async (input: { themeId: string; baseDate: string }) => ({
    themeId: input.themeId,
    baseDate: input.baseDate,
  })),
  // Populated below (after FEATURE_NAMES import resolves) — read lazily by the buildFeatureVector mock.
  featureVector: null as FeatureVector | null,
}))

registryMocks.featureVector = {
  values: [1.4826, ...FEATURE_NAMES.slice(1).map(() => 0)],
  missingFlags: FEATURE_NAMES.map(() => false),
  abstain: false,
  abstainReasons: [],
}

vi.mock('@/scripts/tli/shared/supabase-admin', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      if (table === 'prediction_snapshots_v2') {
        return {
          select: () => ({
            eq: async () => ({ data: registryMocks.snapshotRows, error: null }),
          }),
        }
      }
      if (table === 'model_registry') {
        return {
          select: () => ({
            eq: (_column: string, status: string) => ({
              maybeSingle: async () => ({
                data: status === 'champion' ? registryMocks.championEntry : registryMocks.challengerEntry,
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'theme_labels') {
        interface ThemeLabelsQuery {
          select(): ThemeLabelsQuery
          eq(): ThemeLabelsQuery
          not(): ThemeLabelsQuery
          gte(): ThemeLabelsQuery
          lte(): ThemeLabelsQuery
          order(): ThemeLabelsQuery
          range(from: number, to: number): Promise<{
            readonly data: typeof registryMocks.recentLabelRows
            readonly error: null
          }>
        }
        const query: ThemeLabelsQuery = {
          select: () => query,
          eq: () => query,
          not: () => query,
          gte: () => query,
          lte: () => query,
          order: () => query,
          range: async (from: number, to: number) => ({
            data: registryMocks.recentLabelRows.slice(from, to + 1),
            error: null,
          }),
        }
        return query
      }
      throw new Error(`unexpected table in mock: ${table}`)
    }),
  },
}))

vi.mock('@/scripts/tli/comparison/legacy-prediction-writer', () => {
  return { upsertLegacyPredictionsV3: registryMocks.upsertLegacyPredictionsV3 }
})

vi.mock('@/scripts/tli/features/load-feature-inputs', () => ({
  loadFeatureInputsForBaseDate: registryMocks.loadFeatureInputsForBaseDate,
}))

vi.mock('@/lib/tli/features/build-features', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/tli/features/build-features')>()
  return { ...actual, buildFeatureVector: vi.fn(() => registryMocks.featureVector) }
})

const legacyM1Artifact = () => ({
  artifact_version: 'tli-model-artifact-v1',
  model_type: 'm1_logistic',
  feature_schema: FEATURE_NAMES,
  scaler: {
    median: FEATURE_NAMES.map(() => 0),
    mad: FEATURE_NAMES.map(() => 1),
  },
  coefficients: {
    intercept: 0,
    weights: [
      1,
      ...FEATURE_NAMES.slice(1).map(() => 0),
      ...FEATURE_NAMES.map(() => 0),
    ],
  },
  calibrator: { type: 'platt', a: -1, b: 0 },
  trained_at: '2026-08-02',
  train_range: ['2026-01-07', '2026-07-05'],
  labeler_version: 'gta-v1',
  seed: 42,
  sample_report: {},
})

const upsertRows = (): Array<Record<string, unknown>> => {
  const call = registryMocks.upsertLegacyPredictionsV3.mock.calls[0]
  if (call === undefined) throw new Error('upsertLegacyPredictionsV3 was not called')
  return call[0]
}

const firstUpsertRow = (): Record<string, unknown> => {
  const row = upsertRows()[0]
  if (row === undefined) throw new Error('upsertLegacyPredictionsV3 had no first row')
  return row
}

describe('snapshotThemePredictionsV3 — model_registry-driven scoring (A1)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    registryMocks.upsertLegacyPredictionsV3.mockResolvedValue(1)
    registryMocks.snapshotRows = [
      { theme_id: 'theme-1', snapshot_date: '2026-07-06', phase: 'rising' },
    ]
    registryMocks.recentLabelRows = []
    registryMocks.challengerEntry = null
  })

  it('rejects a legacy v1 M1 champion before scoring or prior correction', async () => {
    registryMocks.recentLabelRows = Array.from({ length: 300 }, (_, index) => ({
      base_date: '2026-06-15',
      y_binary: index < 75,
    }))
    registryMocks.championEntry = {
      model_version: 'm1-2026w27',
      model_type: 'm1_logistic',
      coefficients: { ...legacyM1Artifact(), train_event_rate: 0.5 },
    }
    const { snapshotThemePredictionsV3 } = await import('@/scripts/tli/comparison/theme-predictions-v3')

    let caught: unknown
    try {
      await snapshotThemePredictionsV3({ today: '2026-07-06' })
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(UnsupportedLegacyArtifactError)
    if (!(caught instanceof UnsupportedLegacyArtifactError)) {
      throw new TypeError('expected UnsupportedLegacyArtifactError')
    }
    expect(caught.code).toBe('unsupported_legacy_artifact')
    expect(caught.message).toBe('unsupported_legacy_artifact')
    expect(registryMocks.upsertLegacyPredictionsV3).not.toHaveBeenCalled()
  })

  it('falls back to b-abl heuristic bootstrap when no champion is registered', async () => {
    registryMocks.championEntry = null
    const { snapshotThemePredictionsV3, TLI_V3_BASELINE_MODEL_VERSION } = await import('@/scripts/tli/comparison/theme-predictions-v3')

    const result = await snapshotThemePredictionsV3({ today: '2026-07-06' })

    expect(result.championRows).toBe(1)
    expect(firstUpsertRow()).toMatchObject({
      serving_role: 'champion',
      model_version: TLI_V3_BASELINE_MODEL_VERSION,
      p_rise: 1,
    })
  })

  it('keeps the champion row when a legacy v1 challenger fails at its isolated boundary', async () => {
    registryMocks.championEntry = {
      model_version: 'b-abl-v1',
      model_type: 'b_abl',
      coefficients: {},
    }
    registryMocks.challengerEntry = {
      model_version: 'm1-2026w27',
      model_type: 'm1_logistic',
      coefficients: legacyM1Artifact(),
    }
    const { snapshotThemePredictionsV3 } = await import('@/scripts/tli/comparison/theme-predictions-v3')

    const result = await snapshotThemePredictionsV3({ today: '2026-07-06' })

    expect(result.championRows).toBe(1)
    expect(result.challengerRows).toBe(0)
    const rows = upsertRows()
    expect(rows).toHaveLength(1)
    expect(rows.find((r: Record<string, unknown>) => r.serving_role === 'champion')).toMatchObject({ model_version: 'b-abl-v1' })
    expect(rows.find((r: Record<string, unknown>) => r.serving_role === 'challenger')).toBeUndefined()
  })
})
