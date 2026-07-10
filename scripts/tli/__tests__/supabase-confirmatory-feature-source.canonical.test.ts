import { describe, expect, it } from 'vitest'

import {
  ConfirmatoryFeatureSourceError,
  createSupabaseConfirmatoryFeatureBatchDataSource,
} from '@/scripts/tli/features/supabase-confirmatory-feature-source'
import {
  FakeClient,
  makeBablObservationRow,
  makeCollectionRunRow,
  makeForecastOriginRow,
  makeForecastThemeRow,
  makeNewsObservationRow,
  makeStudyThemeRow,
} from '@/scripts/tli/__tests__/supabase-confirmatory-feature-source.fixture'

type Source = ReturnType<typeof createSupabaseConfirmatoryFeatureBatchDataSource>

type InvalidTimestampCase = {
  readonly label: string
  readonly table: string
  readonly data: unknown
  readonly load: (source: Source) => Promise<unknown>
}

const INVALID_TIMESTAMP_CASES: readonly InvalidTimestampCase[] = [
  {
    label: 'an impossible forecast cutoff',
    table: 'tli_forecast_origin_manifests',
    data: makeForecastOriginRow({ forecast_cutoff: '2026-02-30T08:00:00Z' }),
    load: (source) => source.loadForecastOriginManifest('forecast-origin-1'),
  },
  {
    label: 'a zone-less collection start',
    table: 'tli_collection_runs',
    data: [makeCollectionRunRow({ collected_at: '2026-06-01T08:00:00' })],
    load: (source) => source.loadCollectionRunsByIds(['run-1']),
  },
  {
    label: 'an impossible collection completion',
    table: 'tli_collection_runs',
    data: [makeCollectionRunRow({ completed_at: '2026-04-31T08:00:00Z' })],
    load: (source) => source.loadCollectionRunsByIds(['run-1']),
  },
  {
    label: 'a zone-less news collection time',
    table: 'tli_news_observations',
    data: [makeNewsObservationRow({ collected_at: '2026-06-01T08:00:00' })],
    load: (source) => source.loadNewsObservationsByIds(['news-1']),
  },
  {
    label: 'an impossible B-Abl computation time',
    table: 'tli_babl_phase_observations',
    data: [makeBablObservationRow({ computed_at: '2026-06-31T08:00:00Z' })],
    load: (source) => source.loadBablObservationsByIds(['babl-1']),
  },
]

describe('Supabase confirmatory source canonical timestamps', () => {
  it('canonicalizes every mapped timestamptz field to millisecond UTC', async () => {
    // Given
    const client = new FakeClient({
      tli_forecast_origin_manifests: {
        data: makeForecastOriginRow({ forecast_cutoff: '2026-06-01T08:00:00+00:00' }),
        error: null,
      },
      tli_collection_runs: { data: [makeCollectionRunRow({
        collected_at: '2026-06-01T08:00:00Z',
        completed_at: '2026-06-01T08:00:00.123456+00:00',
      })], error: null },
      tli_news_observations: { data: [makeNewsObservationRow({
        collected_at: '2026-06-01T17:00:00+09:00',
      })], error: null },
      tli_babl_phase_observations: { data: [makeBablObservationRow({
        computed_at: '2026-06-01T08:00:00.999999Z',
      })], error: null },
    })
    const source = createSupabaseConfirmatoryFeatureBatchDataSource(client)

    // When
    const [forecast, runs, news, babl] = await Promise.all([
      source.loadForecastOriginManifest('forecast-origin-1'),
      source.loadCollectionRunsByIds(['run-1']),
      source.loadNewsObservationsByIds(['news-1']),
      source.loadBablObservationsByIds(['babl-1']),
    ])

    // Then
    expect({
      forecastCutoff: forecast?.forecastCutoff,
      collectedAt: runs.at(0)?.collectedAt,
      completedAt: runs.at(0)?.completedAt,
      newsCollectedAt: news.at(0)?.collectedAt,
      bablComputedAt: babl.at(0)?.computedAt,
    }).toEqual({
      forecastCutoff: '2026-06-01T08:00:00.000Z',
      collectedAt: '2026-06-01T08:00:00.000Z',
      completedAt: '2026-06-01T08:00:00.123Z',
      newsCollectedAt: '2026-06-01T08:00:00.000Z',
      bablComputedAt: '2026-06-01T08:00:00.999Z',
    })
  })

  it.each(INVALID_TIMESTAMP_CASES)('rejects $label', async ({ table, data, load }) => {
    // Given
    const source = createSupabaseConfirmatoryFeatureBatchDataSource(new FakeClient({
      [table]: { data, error: null },
    }))

    // When / Then
    await expect(load(source)).rejects.toMatchObject({
      name: 'ConfirmatoryFeatureSourceError',
      code: 'INVALID_RESPONSE',
      table,
    } satisfies Partial<ConfirmatoryFeatureSourceError>)
  })

  it('preserves null for every nullable hash response field', async () => {
    // Given
    const client = new FakeClient({
      tli_study_origin_theme_inputs: { data: [makeStudyThemeRow()], error: null },
      tli_forecast_origin_theme_inputs: { data: [makeForecastThemeRow()], error: null },
      tli_collection_runs: { data: [makeCollectionRunRow({
        response_sha256: null,
        keyword_group_hash: null,
      })], error: null },
    })
    const source = createSupabaseConfirmatoryFeatureBatchDataSource(client)

    // When
    const [studyThemes, forecastThemes, runs] = await Promise.all([
      source.loadStudyThemeInputs('study-origin-1'),
      source.loadForecastThemeInputs('forecast-origin-1'),
      source.loadCollectionRunsByIds(['run-1']),
    ])

    // Then
    expect({
      bablInputSha256: studyThemes.at(0)?.bablInputSha256,
      forecastInterestResponseSha256: forecastThemes.at(0)?.forecastInterestResponseSha256,
      newsInputSha256: forecastThemes.at(0)?.newsInputSha256,
      responseSha256: runs.at(0)?.responseSha256,
      keywordGroupHash: runs.at(0)?.keywordGroupHash,
    }).toEqual({
      bablInputSha256: null,
      forecastInterestResponseSha256: null,
      newsInputSha256: null,
      responseSha256: null,
      keywordGroupHash: null,
    })
  })
})
