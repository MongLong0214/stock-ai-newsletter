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
  makeStudyOriginRow,
  makeStudyThemeRow,
} from '@/scripts/tli/__tests__/supabase-confirmatory-feature-source.fixture'

type Source = ReturnType<typeof createSupabaseConfirmatoryFeatureBatchDataSource>

type InvalidHashCase = {
  readonly label: string
  readonly table: string
  readonly data: unknown
  readonly load: (source: Source) => Promise<unknown>
}

const UPPERCASE_HASH = 'A'.repeat(64)
const SHORT_HASH = 'a'.repeat(63)
const NON_HEX_HASH = 'g'.repeat(64)

const INVALID_HASH_CASES: readonly InvalidHashCase[] = [
  {
    label: 'study-origin payload_sha256',
    table: 'tli_study_origin_manifests',
    data: makeStudyOriginRow({ payload_sha256: UPPERCASE_HASH }),
    load: (source) => source.loadStudyOriginBundle('study-origin-1'),
  },
  {
    label: 'study-contract payload_sha256',
    table: 'tli_study_origin_manifests',
    data: makeStudyOriginRow({}, { payload_sha256: SHORT_HASH }),
    load: (source) => source.loadStudyOriginBundle('study-origin-1'),
  },
  {
    label: 'feature_contract_sha256',
    table: 'tli_study_origin_manifests',
    data: makeStudyOriginRow({}, { feature_contract_sha256: NON_HEX_HASH }),
    load: (source) => source.loadStudyOriginBundle('study-origin-1'),
  },
  {
    label: 'nullable babl_input_sha256',
    table: 'tli_study_origin_theme_inputs',
    data: [makeStudyThemeRow({ babl_input_sha256: UPPERCASE_HASH })],
    load: (source) => source.loadStudyThemeInputs('study-origin-1'),
  },
  {
    label: 'forecast-origin payload_sha256',
    table: 'tli_forecast_origin_manifests',
    data: makeForecastOriginRow({ payload_sha256: SHORT_HASH }),
    load: (source) => source.loadForecastOriginManifest('forecast-origin-1'),
  },
  {
    label: 'keyword_group_sha256',
    table: 'tli_forecast_origin_theme_inputs',
    data: [makeForecastThemeRow({ keyword_group_sha256: NON_HEX_HASH })],
    load: (source) => source.loadForecastThemeInputs('forecast-origin-1'),
  },
  {
    label: 'nullable forecast_interest_response_sha256',
    table: 'tli_forecast_origin_theme_inputs',
    data: [makeForecastThemeRow({ forecast_interest_response_sha256: UPPERCASE_HASH })],
    load: (source) => source.loadForecastThemeInputs('forecast-origin-1'),
  },
  {
    label: 'nullable news_input_sha256',
    table: 'tli_forecast_origin_theme_inputs',
    data: [makeForecastThemeRow({ news_input_sha256: SHORT_HASH })],
    load: (source) => source.loadForecastThemeInputs('forecast-origin-1'),
  },
  {
    label: 'nullable collection response_sha256',
    table: 'tli_collection_runs',
    data: [makeCollectionRunRow({ response_sha256: NON_HEX_HASH })],
    load: (source) => source.loadCollectionRunsByIds(['run-1']),
  },
  {
    label: 'nullable collection keyword_group_hash',
    table: 'tli_collection_runs',
    data: [makeCollectionRunRow({ keyword_group_hash: UPPERCASE_HASH })],
    load: (source) => source.loadCollectionRunsByIds(['run-1']),
  },
  {
    label: 'news query_hash',
    table: 'tli_news_observations',
    data: [makeNewsObservationRow({ query_hash: SHORT_HASH })],
    load: (source) => source.loadNewsObservationsByIds(['news-1']),
  },
  {
    label: 'B-Abl payload_hash',
    table: 'tli_babl_phase_observations',
    data: [makeBablObservationRow({ payload_hash: NON_HEX_HASH })],
    load: (source) => source.loadBablObservationsByIds(['babl-1']),
  },
]

describe('Supabase confirmatory source canonical hashes', () => {
  it.each(INVALID_HASH_CASES)('rejects invalid $label', async ({ table, data, load }) => {
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
})
