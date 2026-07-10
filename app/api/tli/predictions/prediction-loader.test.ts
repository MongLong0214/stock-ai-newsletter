import { beforeEach, describe, expect, it, vi } from 'vitest'

const loaderMocks = vi.hoisted(() => ({
  getServerSupabaseClient: vi.fn(),
  loadMethodologyMetricsSummary: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({ isSupabasePlaceholder: false }))
vi.mock('@/lib/supabase/server-client', () => ({
  getServerSupabaseClient: loaderMocks.getServerSupabaseClient,
}))
vi.mock('@/lib/tli/methodology-metrics', () => ({
  loadMethodologyMetricsSummary: loaderMocks.loadMethodologyMetricsSummary,
}))

import {
  isPredictionV3ExposureEnabled,
  loadPredictionResponse,
} from './prediction-loader'

interface RegistryRow {
  readonly model_version: string
  readonly experiment_cycle_id: string | null
  readonly status: 'champion' | 'archived'
  readonly scientific_claim_status: 'eligible' | 'unvalidated'
  readonly scientific_release_status: 'public' | 'blocked'
}

interface PredictionRow {
  readonly theme_id: string
  readonly prediction_date: string
  readonly p_rise: number
  readonly ci_lower: number
  readonly ci_upper: number
  readonly abstain: boolean
  readonly abstain_reasons: readonly string[]
  readonly model_version: string
  readonly experiment_cycle_id: string
  readonly scientific_prediction_role: 'candidate' | 'comparator'
}

interface ClientFixture {
  readonly registryRow: RegistryRow | null
  readonly predictions?: readonly PredictionRow[]
  readonly predictionError?: Error
}

const CYCLE = '22222222-2222-4222-8222-222222222222'
const OTHER_CYCLE = '33333333-3333-4333-8333-333333333333'
const THEME = '11111111-1111-4111-8111-111111111111'
const OTHER_THEME = '44444444-4444-4444-8444-444444444444'
const MODEL = 'm1-future-validated'
const PUBLIC_REGISTRY: RegistryRow = {
  model_version: MODEL,
  experiment_cycle_id: CYCLE,
  status: 'champion',
  scientific_claim_status: 'eligible',
  scientific_release_status: 'public',
}

function prediction(overrides: Partial<PredictionRow> = {}): PredictionRow {
  return {
    theme_id: THEME,
    prediction_date: '2026-07-06',
    p_rise: 0.72,
    ci_lower: 0.61,
    ci_upper: 0.81,
    abstain: false,
    abstain_reasons: [],
    model_version: MODEL,
    experiment_cycle_id: CYCLE,
    scientific_prediction_role: 'candidate',
    ...overrides,
  }
}

function createClient(fixture: ClientFixture) {
  const filters: Record<string, string> = {}
  const predictionQuery = { select: vi.fn(), eq: vi.fn(), order: vi.fn() }
  predictionQuery.select.mockReturnValue(predictionQuery)
  predictionQuery.eq.mockImplementation((column: string, value: string) => {
    filters[column] = value
    return predictionQuery
  })
  predictionQuery.order.mockImplementation(async () => {
    const registry = fixture.registryRow
    const isPublic = registry?.experiment_cycle_id !== null
      && registry?.status === 'champion'
      && registry.scientific_claim_status === 'eligible'
      && registry.scientific_release_status === 'public'
    return {
      data: isPublic ? (fixture.predictions ?? []).filter((row) =>
        row.experiment_cycle_id === registry.experiment_cycle_id
        && row.model_version === registry.model_version
        && row.scientific_prediction_role === 'candidate'
        && (filters.theme_id === undefined || row.theme_id === filters.theme_id)) : [],
      error: fixture.predictionError ?? null,
    }
  })

  const themeQuery = { select: vi.fn(), in: vi.fn() }
  themeQuery.select.mockReturnValue(themeQuery)
  themeQuery.in.mockImplementation(async (_column: string, ids: readonly string[]) => ({
    data: ids.map((id) => ({ id, name: id === THEME ? 'AI 반도체' : '다른 테마' })),
    error: null,
  }))

  const from = vi.fn((table: string) => {
    switch (table) {
      case 'tli_public_scientific_predictions_v3': return predictionQuery
      case 'themes': return themeQuery
      default: throw new Error(`unexpected table: ${table}`)
    }
  })

  return { client: { from }, from, predictionQuery, themeQuery }
}

describe('TLI prediction scientific cycle loader', () => {
  beforeEach(() => {
    loaderMocks.getServerSupabaseClient.mockReset()
    loaderMocks.loadMethodologyMetricsSummary.mockReset()
    loaderMocks.loadMethodologyMetricsSummary.mockResolvedValue({
      status: 'ready', windowDays: 90, sinceDate: '2026-04-08', throughDate: '2026-07-06',
      championModelVersion: MODEL, latestMetricDate: '2026-07-06', metricDays: 10,
      nScored: 40, brier: 0.12, ece: 0.04, pAt10: 0.7, coverage: 0.8, abstainRate: 0.1,
    })
  })

  it.each([
    [undefined, false], ['false', false], ['1', false], ['TRUE', false], ['true', true],
  ])('accepts only the exact exposure value %s', (value, expected) => {
    expect(isPredictionV3ExposureEnabled(value)).toBe(expected)
  })

  it.each([
    ['missing registry row', null],
    ['legacy champion without a cycle', {
      model_version: 'b-abl-v1', experiment_cycle_id: null, status: 'champion' as const,
      scientific_claim_status: 'unvalidated' as const, scientific_release_status: 'blocked' as const,
    }],
  ])('fails closed for %s', async (_name, registryRow) => {
    const { client, from } = createClient({ registryRow })
    loaderMocks.getServerSupabaseClient.mockReturnValue(client)

    const result = await loadPredictionResponse({ phaseFilter: null, themeId: null })

    expect(from).toHaveBeenCalledTimes(1)
    expect(from).toHaveBeenCalledWith('tli_public_scientific_predictions_v3')
    expect(result).toMatchObject({ dataSource: 'none', themes: [] })
  })

  it('loads only the exact champion cycle, model version, and candidate role', async () => {
    const rows = [
      prediction(),
      prediction({ experiment_cycle_id: OTHER_CYCLE, p_rise: 0.99 }),
      prediction({ scientific_prediction_role: 'comparator', p_rise: 0.01 }),
      prediction({ model_version: 'm1-stale', p_rise: 0.98 }),
    ]
    const { client, predictionQuery } = createClient({
      registryRow: PUBLIC_REGISTRY,
      predictions: rows,
    })
    loaderMocks.getServerSupabaseClient.mockReturnValue(client)

    const result = await loadPredictionResponse({ phaseFilter: null, themeId: null })

    expect(predictionQuery.eq).not.toHaveBeenCalled()
    expect(predictionQuery.eq).not.toHaveBeenCalledWith('serving_role', 'champion')
    expect(result).toMatchObject({
      dataSource: 'theme_predictions_v3',
      themes: [{
        themeId: THEME, name: 'AI 반도체', pRise: 0.72, phase: 'rising',
        modelVersion: MODEL, trailing90d: { topSignalPrecision: 0.7, n: 40 },
      }],
    })
    expect(result.themes).toHaveLength(1)
  })

  it('returns only the latest prediction-date cohort from the atomic exact view query', async () => {
    const { client } = createClient({
      registryRow: PUBLIC_REGISTRY,
      predictions: [
        prediction({ prediction_date: '2026-06-29', p_rise: 0.11 }),
        prediction({ prediction_date: '2026-07-06' }),
        prediction({ theme_id: OTHER_THEME, prediction_date: '2026-07-06', p_rise: 0.2 }),
      ],
    })
    loaderMocks.getServerSupabaseClient.mockReturnValue(client)

    const result = await loadPredictionResponse({ phaseFilter: null, themeId: null })

    expect(result.themes.map((item) => item.themeId)).toEqual([THEME, OTHER_THEME])
    expect(result.themes.find((item) => item.themeId === THEME)?.pRise).toBe(0.72)
  })

  it('applies exact theme and derived phase filters without cross-theme leakage', async () => {
    const { client, predictionQuery } = createClient({
      registryRow: PUBLIC_REGISTRY,
      predictions: [prediction(), prediction({ theme_id: OTHER_THEME, p_rise: 0.2 })],
    })
    loaderMocks.getServerSupabaseClient.mockReturnValue(client)

    const result = await loadPredictionResponse({ phaseFilter: 'rising', themeId: THEME })

    expect(predictionQuery.eq).toHaveBeenCalledWith('theme_id', THEME)
    expect(result.phase).toBe('rising')
    expect(result.themes.map((item) => item.themeId)).toEqual([THEME])
  })

  it('keeps an empty exact identity result fail-closed', async () => {
    const { client } = createClient({
      registryRow: PUBLIC_REGISTRY,
      predictions: [prediction({ experiment_cycle_id: OTHER_CYCLE })],
    })
    loaderMocks.getServerSupabaseClient.mockReturnValue(client)

    await expect(loadPredictionResponse({ phaseFilter: null, themeId: null }))
      .resolves.toMatchObject({ dataSource: 'none', themes: [] })
    expect(loaderMocks.loadMethodologyMetricsSummary).not.toHaveBeenCalled()
  })

  it('fails closed when the exact champion is on monitoring hold', async () => {
    const { client } = createClient({
      registryRow: { ...PUBLIC_REGISTRY, scientific_release_status: 'blocked' },
      predictions: [prediction()],
    })
    loaderMocks.getServerSupabaseClient.mockReturnValue(client)

    await expect(loadPredictionResponse({ phaseFilter: null, themeId: null }))
      .resolves.toMatchObject({ dataSource: 'none', themes: [] })
  })

  it('propagates the atomic scientific-view query error', async () => {
    const { client } = createClient({
      registryRow: PUBLIC_REGISTRY,
      predictionError: new Error('prediction failed'),
    })
    loaderMocks.getServerSupabaseClient.mockReturnValue(client)

    await expect(loadPredictionResponse({ phaseFilter: null, themeId: null }))
      .rejects.toThrow(/failed/)
  })
})
