import { describe, expect, it } from 'vitest'

import {
  ConfirmatoryFeatureSourceError,
  createSupabaseConfirmatoryFeatureBatchDataSource,
} from '@/scripts/tli/features/supabase-confirmatory-feature-source'
import { FakeClient } from '@/scripts/tli/__tests__/supabase-confirmatory-feature-source.fixture'

const STUDY_ORIGIN_ID = 'study-origin-1'
const FORECAST_ORIGIN_ID = 'forecast-origin-1'
const THEME_ID = 'theme-1'

const STUDY_PARENT_ROW = {
  id: STUDY_ORIGIN_ID,
  payload_sha256: 'a'.repeat(64),
  forecast_origin_manifest_id: FORECAST_ORIGIN_ID,
  study_contract: {
    id: 'study-contract-1',
    payload_sha256: 'b'.repeat(64),
    feature_contract_version: 'tli-attention-v2-f1',
    feature_contract_sha256: 'c'.repeat(64),
    babl_algorithm_version: 'babl-v4',
    babl_comparison_spec_version: 'comparison-v4-spec-v1',
    babl_evaluation_horizon_days: 14,
    babl_candidate_pool_rule: 'source_prod_run_v1',
  },
}

describe('createSupabaseConfirmatoryFeatureBatchDataSource', () => {
  it('maps the exact study parent and joined study contract when queried by study-origin id', async () => {
    // Given
    const client = new FakeClient({
      tli_study_origin_manifests: { data: STUDY_PARENT_ROW, error: null },
    })
    const source = createSupabaseConfirmatoryFeatureBatchDataSource(client)

    // When
    const bundle = await source.loadStudyOriginBundle(STUDY_ORIGIN_ID)

    // Then
    expect(bundle).toEqual({
      id: STUDY_ORIGIN_ID,
      payloadSha256: 'a'.repeat(64),
      forecastOriginManifestId: FORECAST_ORIGIN_ID,
      studyContract: {
        id: 'study-contract-1',
        payloadSha256: 'b'.repeat(64),
        featureContractVersion: 'tli-attention-v2-f1',
        featureContractSha256: 'c'.repeat(64),
        bablAlgorithmVersion: 'babl-v4',
        bablComparisonSpecVersion: 'comparison-v4-spec-v1',
        bablEvaluationHorizonDays: 14,
        bablCandidatePoolRule: 'source_prod_run_v1',
      },
    })
    expect(client.calls).toContainEqual({
      table: 'tli_study_origin_manifests', operation: 'eq', column: 'id', value: STUDY_ORIGIN_ID,
    })
    expect(client.calls).toContainEqual({
      table: 'tli_study_origin_manifests', operation: 'select',
      value: 'id, payload_sha256, forecast_origin_manifest_id, study_contract:tli_attention_study_contracts!inner(id, payload_sha256, feature_contract_version, feature_contract_sha256, babl_algorithm_version, babl_comparison_spec_version, babl_evaluation_horizon_days, babl_candidate_pool_rule)',
    })
  })

  it('maps ordered study and forecast children including frozen arrays and nullable fields', async () => {
    // Given
    const client = new FakeClient({
      tli_study_origin_theme_inputs: { data: [{
        study_origin_manifest_id: STUDY_ORIGIN_ID,
        theme_id: THEME_ID,
        babl_observation_id: null,
        babl_input_sha256: null,
        babl_candidate_pool: null,
        babl_missing_reason: 'no_matching_observation',
      }], error: null },
      tli_forecast_origin_theme_inputs: { data: [{
        forecast_origin_manifest_id: FORECAST_ORIGIN_ID,
        theme_id: THEME_ID,
        keyword_group_sha256: 'd'.repeat(64),
        forecast_interest_run_id: 'interest-run-1',
        forecast_interest_response_sha256: 'e'.repeat(64),
        news_observation_ids: ['news-2', 'news-1'],
        news_input_sha256: 'f'.repeat(64),
        input_status: 'usable',
        abstain_reason: null,
      }], error: null },
    })
    const source = createSupabaseConfirmatoryFeatureBatchDataSource(client)

    // When
    const [studyChildren, forecastChildren] = await Promise.all([
      source.loadStudyThemeInputs(STUDY_ORIGIN_ID),
      source.loadForecastThemeInputs(FORECAST_ORIGIN_ID),
    ])

    // Then
    expect(studyChildren).toEqual([{
      studyOriginManifestId: STUDY_ORIGIN_ID, themeId: THEME_ID,
      bablObservationId: null, bablInputSha256: null, bablCandidatePool: null,
      bablMissingReason: 'no_matching_observation',
    }])
    expect(forecastChildren).toEqual([{
      forecastOriginManifestId: FORECAST_ORIGIN_ID, themeId: THEME_ID,
      keywordGroupSha256: 'd'.repeat(64), forecastInterestRunId: 'interest-run-1',
      forecastInterestResponseSha256: 'e'.repeat(64), newsObservationIds: ['news-2', 'news-1'],
      newsInputSha256: 'f'.repeat(64), inputStatus: 'usable', abstainReason: null,
    }])
    expect(client.calls.filter((call) => call.operation === 'order')).toEqual([
      { table: 'tli_study_origin_theme_inputs', operation: 'order', column: 'theme_id', value: { ascending: true } },
      { table: 'tli_forecast_origin_theme_inputs', operation: 'order', column: 'theme_id', value: { ascending: true } },
    ])
    expect(client.calls.filter((call) => call.operation === 'select').map((call) => call.value)).toEqual([
      'study_origin_manifest_id, theme_id, babl_observation_id, babl_input_sha256, babl_candidate_pool, babl_missing_reason',
      'forecast_origin_manifest_id, theme_id, keyword_group_sha256, forecast_interest_run_id, forecast_interest_response_sha256, news_observation_ids, news_input_sha256, input_status, abstain_reason',
    ])
  })

  it('maps collection, interest, news, and B-Abl rows from fixed bulk queries', async () => {
    // Given
    const client = new FakeClient({
      tli_collection_runs: { data: [{ id: 'run-1', source: 'naver_datalab', status: 'complete', response_sha256: 'a'.repeat(64), keyword_group_hash: 'b'.repeat(64), source_max_date: '2026-06-01', collected_at: '2026-06-01T08:00:00Z', completed_at: '2026-06-01T08:01:00Z' }], error: null },
      tli_interest_observations: { data: [{ id: 'interest-1', collection_run_id: 'run-1', theme_id: THEME_ID, trading_date: '2026-06-01', raw_value: 12, normalized: 0.4, anchor_scaled_value: null }], error: null },
      tli_news_observations: { data: [{ id: 'news-1', collection_run_id: 'run-2', theme_id: THEME_ID, article_date: '2026-06-01', article_count: 0, query_hash: 'c'.repeat(64), collected_at: '2026-06-01T08:02:00Z' }], error: null },
      tli_babl_phase_observations: { data: [{ id: 'babl-1', collection_run_id: 'run-3', theme_id: THEME_ID, snapshot_date: '2026-06-01', phase: 'rising', algorithm_version: 'babl-v4', comparison_spec_version: 'comparison-v4-spec-v1', evaluation_horizon_days: 14, candidate_pool: 'prod', source_prediction_snapshot_id: 'snapshot-1', computed_at: '2026-06-01T08:03:00Z', payload_hash: 'd'.repeat(64), source_run: { status: 'complete' } }], error: null },
    })
    const source = createSupabaseConfirmatoryFeatureBatchDataSource(client)

    // When
    const rows = await Promise.all([
      source.loadCollectionRunsByIds(['run-1']), source.loadInterestObservationsByRunIds(['run-1']),
      source.loadNewsObservationsByIds(['news-1']), source.loadBablObservationsByIds(['babl-1']),
    ])

    // Then
    expect(rows).toEqual([
      [{ id: 'run-1', source: 'naver_datalab', status: 'complete', responseSha256: 'a'.repeat(64), keywordGroupHash: 'b'.repeat(64), sourceMaxDate: '2026-06-01', collectedAt: '2026-06-01T08:00:00.000Z', completedAt: '2026-06-01T08:01:00.000Z' }],
      [{ id: 'interest-1', collectionRunId: 'run-1', themeId: THEME_ID, tradingDate: '2026-06-01', rawValue: 12, normalized: 0.4, anchorScaledValue: null }],
      [{ id: 'news-1', collectionRunId: 'run-2', themeId: THEME_ID, articleDate: '2026-06-01', articleCount: 0, queryHash: 'c'.repeat(64), collectedAt: '2026-06-01T08:02:00.000Z' }],
      [{ id: 'babl-1', collectionRunId: 'run-3', themeId: THEME_ID, snapshotDate: '2026-06-01', phase: 'rising', algorithmVersion: 'babl-v4', comparisonSpecVersion: 'comparison-v4-spec-v1', evaluationHorizonDays: 14, candidatePool: 'prod', sourcePredictionSnapshotId: 'snapshot-1', computedAt: '2026-06-01T08:03:00.000Z', payloadHash: 'd'.repeat(64), sourceRunStatus: 'complete' }],
    ])
    expect(client.calls.filter((call) => call.operation === 'in').map((call) => [call.table, call.column, call.value])).toEqual([
      ['tli_collection_runs', 'id', ['run-1']],
      ['tli_interest_observations', 'collection_run_id', ['run-1']],
      ['tli_news_observations', 'id', ['news-1']],
      ['tli_babl_phase_observations', 'id', ['babl-1']],
    ])
    expect(client.calls.filter((call) => call.operation === 'select').map((call) => call.value)).toEqual([
      'id, source, status, response_sha256, keyword_group_hash, source_max_date, collected_at, completed_at',
      'id, collection_run_id, theme_id, trading_date, raw_value, normalized, anchor_scaled_value',
      'id, collection_run_id, theme_id, article_date, article_count, query_hash, collected_at',
      'id, collection_run_id, theme_id, snapshot_date, phase, algorithm_version, comparison_spec_version, evaluation_horizon_days, candidate_pool, source_prediction_snapshot_id, computed_at, payload_hash, source_run:tli_collection_runs!inner(status)',
    ])
  })

  it('loads the frozen forecast parent without current or latest selection', async () => {
    // Given
    const client = new FakeClient({ tli_forecast_origin_manifests: { data: {
      id: FORECAST_ORIGIN_ID, payload_sha256: 'a'.repeat(64), origin_date: '2026-06-01',
      forecast_cutoff: '2026-06-01T09:00:00Z', expected_theme_ids: ['theme-2', THEME_ID], expected_theme_count: 2,
    }, error: null } })
    const source = createSupabaseConfirmatoryFeatureBatchDataSource(client)

    // When
    const manifest = await source.loadForecastOriginManifest(FORECAST_ORIGIN_ID)

    // Then
    expect(manifest).toEqual({ id: FORECAST_ORIGIN_ID, payloadSha256: 'a'.repeat(64), originDate: '2026-06-01', forecastCutoff: '2026-06-01T09:00:00.000Z', expectedThemeIds: ['theme-2', THEME_ID], expectedThemeCount: 2 })
    expect(client.calls.filter((call) => call.operation === 'eq')).toEqual([
      { table: 'tli_forecast_origin_manifests', operation: 'eq', column: 'id', value: FORECAST_ORIGIN_ID },
    ])
    expect(client.calls).toContainEqual({
      table: 'tli_forecast_origin_manifests', operation: 'select',
      value: 'id, payload_sha256, origin_date, forecast_cutoff, expected_theme_ids, expected_theme_count',
    })
    expect(client.calls.some((call) => call.operation === 'in' || call.operation === 'order')).toBe(false)
  })

  it('returns null when an exact immutable parent does not exist', async () => {
    // Given
    const client = new FakeClient({
      tli_study_origin_manifests: { data: null, error: null },
      tli_forecast_origin_manifests: { data: null, error: null },
    })
    const source = createSupabaseConfirmatoryFeatureBatchDataSource(client)

    // When
    const parents = await Promise.all([
      source.loadStudyOriginBundle(STUDY_ORIGIN_ID),
      source.loadForecastOriginManifest(FORECAST_ORIGIN_ID),
    ])

    // Then
    expect(parents).toEqual([null, null])
  })

  it('fails closed with typed errors for query failures and malformed list responses', async () => {
    // Given
    const queryFailure = createSupabaseConfirmatoryFeatureBatchDataSource(new FakeClient({
      tli_collection_runs: { data: null, error: { message: 'database unavailable' } },
    }))
    const malformed = createSupabaseConfirmatoryFeatureBatchDataSource(new FakeClient({
      tli_news_observations: { data: { id: 'not-an-array' }, error: null },
    }))

    // When / Then
    await expect(queryFailure.loadCollectionRunsByIds(['run-1'])).rejects.toMatchObject({
      name: 'ConfirmatoryFeatureSourceError', code: 'QUERY_FAILED', table: 'tli_collection_runs',
    } satisfies Partial<ConfirmatoryFeatureSourceError>)
    await expect(malformed.loadNewsObservationsByIds(['news-1'])).rejects.toMatchObject({
      name: 'ConfirmatoryFeatureSourceError', code: 'INVALID_RESPONSE', table: 'tli_news_observations',
    } satisfies Partial<ConfirmatoryFeatureSourceError>)
  })

  it('returns empty bulk results without issuing a query for empty frozen id sets', async () => {
    // Given
    const client = new FakeClient({})
    const source = createSupabaseConfirmatoryFeatureBatchDataSource(client)

    // When
    const rows = await Promise.all([
      source.loadCollectionRunsByIds([]), source.loadInterestObservationsByRunIds([]),
      source.loadNewsObservationsByIds([]), source.loadBablObservationsByIds([]),
    ])

    // Then
    expect(rows).toEqual([[], [], [], []])
    expect(client.calls).toEqual([])
  })

  it('paginates ordered manifest children until a short page preserves every row', async () => {
    // Given
    const children = Array.from({ length: 5 }, (_, index) => ({
      study_origin_manifest_id: STUDY_ORIGIN_ID,
      theme_id: `theme-${index + 1}`,
      babl_observation_id: null,
      babl_input_sha256: null,
      babl_candidate_pool: null,
      babl_missing_reason: 'no_matching_observation',
    }))
    const client = new FakeClient({
      tli_study_origin_theme_inputs: { data: children, error: null },
    })
    const source = createSupabaseConfirmatoryFeatureBatchDataSource(client, {
      pageSize: 2,
      idChunkSize: 2,
    })

    // When
    const rows = await source.loadStudyThemeInputs(STUDY_ORIGIN_ID)

    // Then
    expect(rows.map((row) => row.themeId)).toEqual([
      'theme-1', 'theme-2', 'theme-3', 'theme-4', 'theme-5',
    ])
    expect(client.calls.filter((call) => call.operation === 'range').map((call) => call.value)).toEqual([
      [0, 1], [2, 3], [4, 5],
    ])
  })

  it('chunks large frozen id sets and paginates each chunk without truncation', async () => {
    // Given
    const observations = Array.from({ length: 5 }, (_, index) => ({
      id: `news-${index + 1}`,
      collection_run_id: `run-${index + 1}`,
      theme_id: THEME_ID,
      article_date: '2026-06-01',
      article_count: index,
      query_hash: 'a'.repeat(64),
      collected_at: '2026-06-01T08:00:00Z',
    }))
    const client = new FakeClient({
      tli_news_observations: { data: observations, error: null },
    })
    const source = createSupabaseConfirmatoryFeatureBatchDataSource(client, {
      pageSize: 2,
      idChunkSize: 2,
    })

    // When
    const rows = await source.loadNewsObservationsByIds([
      'news-5', 'news-1', 'news-4', 'news-2', 'news-3',
    ])

    // Then
    expect(rows.map((row) => row.id)).toEqual([
      'news-1', 'news-2', 'news-3', 'news-4', 'news-5',
    ])
    expect(client.calls.filter((call) => call.operation === 'in').map((call) => call.value)).toEqual([
      ['news-1', 'news-2'], ['news-3', 'news-4'], ['news-5'],
    ])
    expect(client.calls.filter((call) => call.operation === 'range').map((call) => call.value)).toEqual([
      [0, 1], [2, 3], [0, 1], [2, 3], [0, 1],
    ])
  })
})
