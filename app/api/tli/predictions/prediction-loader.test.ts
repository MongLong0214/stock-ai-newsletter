import { beforeEach, describe, expect, it, vi } from 'vitest'

const loaderMocks = vi.hoisted(() => ({
  getServerSupabaseClient: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  isSupabasePlaceholder: false,
}))

vi.mock('@/lib/supabase/server-client', () => ({
  getServerSupabaseClient: loaderMocks.getServerSupabaseClient,
}))

vi.mock('@/lib/tli/methodology-metrics', () => ({
  loadMethodologyMetricsSummary: vi.fn(() => {
    throw new Error('methodology metrics must not be loaded during scientific containment')
  }),
}))

import {
  isPredictionV3ExposureEnabled,
  loadPredictionResponse,
} from './prediction-loader'

interface RegistryRow {
  readonly model_version: string
  readonly experiment_cycle_id: string | null
}

function createClient(registryRow: RegistryRow | null) {
  const registryQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn(),
  }
  registryQuery.select.mockReturnValue(registryQuery)
  registryQuery.eq.mockReturnValue(registryQuery)
  registryQuery.limit.mockReturnValue(registryQuery)
  registryQuery.maybeSingle.mockResolvedValue({ data: registryRow, error: null })

  const from = vi.fn((table: string) => {
    if (table !== 'model_registry') {
      throw new Error(`unexpected table read during containment: ${table}`)
    }
    return registryQuery
  })

  return { client: { from }, from, registryQuery }
}

const request = {
  phaseFilter: 'rising' as const,
  themeId: '11111111-1111-4111-8111-111111111111',
}

describe('TLI prediction scientific containment loader', () => {
  beforeEach(() => {
    loaderMocks.getServerSupabaseClient.mockReset()
  })

  it.each([
    [undefined, false],
    ['false', false],
    ['1', false],
    ['TRUE', false],
    ['true', true],
  ])('accepts only the exact exposure value %s', (value, expected) => {
    expect(isPredictionV3ExposureEnabled(value)).toBe(expected)
  })

  it('requires an exact champion eligible public registry row', async () => {
    const { client, from, registryQuery } = createClient(null)
    loaderMocks.getServerSupabaseClient.mockReturnValue(client)

    const result = await loadPredictionResponse(request)

    expect(from).toHaveBeenCalledOnce()
    expect(from).toHaveBeenCalledWith('model_registry')
    expect(registryQuery.select).toHaveBeenCalledWith('model_version, experiment_cycle_id')
    expect(registryQuery.eq.mock.calls).toEqual([
      ['status', 'champion'],
      ['scientific_claim_status', 'eligible'],
      ['scientific_release_status', 'public'],
    ])
    expect(result).toMatchObject({ dataSource: 'none', themes: [] })
  })

  it('does not expose a legacy champion with no experiment cycle identity', async () => {
    const { client, from } = createClient({
      model_version: 'b-abl-v1',
      experiment_cycle_id: null,
    })
    loaderMocks.getServerSupabaseClient.mockReturnValue(client)

    const result = await loadPredictionResponse(request)

    expect(from).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ dataSource: 'none', themes: [] })
  })

  it.each([
    'a different challenger cycle row on the same date',
    'a comparator-role row',
    'an exploratory-label row',
    'a rollback-era prediction row',
  ])('does not expose %s before Todo 12 identity columns exist', async () => {
    const { client, from } = createClient({
      model_version: 'm1-future-validated',
      experiment_cycle_id: '22222222-2222-4222-8222-222222222222',
    })
    loaderMocks.getServerSupabaseClient.mockReturnValue(client)

    const result = await loadPredictionResponse(request)

    expect(from).toHaveBeenCalledTimes(1)
    expect(from).not.toHaveBeenCalledWith('theme_predictions_v3')
    expect(result).toMatchObject({
      phase: 'rising',
      dataSource: 'none',
      themes: [],
    })
  })

  it('does not expose an invalidated challenger excluded by the registry filters', async () => {
    const { client, from } = createClient(null)
    loaderMocks.getServerSupabaseClient.mockReturnValue(client)

    const result = await loadPredictionResponse(request)

    expect(from).toHaveBeenCalledTimes(1)
    expect(from).not.toHaveBeenCalledWith('theme_predictions_v3')
    expect(result).toMatchObject({ dataSource: 'none', themes: [] })
  })
})
