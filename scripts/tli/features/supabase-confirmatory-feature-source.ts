import { loadConfirmatoryFeatureBatch } from '@/scripts/tli/features/load-confirmatory-feature-inputs'
import type {
  ConfirmatoryFeatureBatch,
  ConfirmatoryFeatureBatchDataSource,
  ConfirmatoryFeatureBatchRequest,
} from '@/scripts/tli/features/load-confirmatory-feature-inputs'

import {
  parseBablObservations,
  parseCollectionRuns,
  parseForecastOriginManifest,
  parseForecastThemeInputs,
  parseInterestObservations,
  parseNewsObservations,
  parseStudyOriginBundle,
  parseStudyThemeInputs,
} from './supabase-confirmatory-feature-parsers'
import {
  readAllPages,
  readChunkedPages,
  readParsed,
  resolveSourceOptions,
  selectFrom,
} from './supabase-confirmatory-query'
import type {
  SupabaseConfirmatoryClient,
  SupabaseConfirmatorySourceOptions,
} from './supabase-confirmatory-query'

export { ConfirmatoryFeatureSourceError } from './supabase-confirmatory-query'
export type {
  ConfirmatoryFeatureSourceErrorCode,
  SupabaseConfirmatoryClient,
  SupabaseConfirmatoryQuery,
  SupabaseConfirmatoryQueryResult,
  SupabaseConfirmatorySourceOptions,
  SupabaseConfirmatoryTable,
} from './supabase-confirmatory-query'

const TABLES = {
  studyOrigins: 'tli_study_origin_manifests',
  studyThemes: 'tli_study_origin_theme_inputs',
  forecastOrigins: 'tli_forecast_origin_manifests',
  forecastThemes: 'tli_forecast_origin_theme_inputs',
  runs: 'tli_collection_runs',
  interest: 'tli_interest_observations',
  news: 'tli_news_observations',
  babl: 'tli_babl_phase_observations',
} as const

const COLUMNS = {
  studyOrigins: 'id, payload_sha256, forecast_origin_manifest_id, study_contract:tli_attention_study_contracts!inner(id, payload_sha256, feature_contract_version, feature_contract_sha256, babl_algorithm_version, babl_comparison_spec_version, babl_evaluation_horizon_days, babl_candidate_pool_rule)',
  studyThemes: 'study_origin_manifest_id, theme_id, babl_observation_id, babl_input_sha256, babl_candidate_pool, babl_missing_reason',
  forecastOrigins: 'id, payload_sha256, origin_date, forecast_cutoff, expected_theme_ids, expected_theme_count',
  forecastThemes: 'forecast_origin_manifest_id, theme_id, keyword_group_sha256, forecast_interest_run_id, forecast_interest_response_sha256, news_observation_ids, news_input_sha256, input_status, abstain_reason',
  runs: 'id, source, status, response_sha256, keyword_group_hash, source_max_date, collected_at, completed_at',
  interest: 'id, collection_run_id, theme_id, trading_date, raw_value, normalized, anchor_scaled_value',
  news: 'id, collection_run_id, theme_id, article_date, article_count, query_hash, collected_at',
  babl: 'id, collection_run_id, theme_id, snapshot_date, phase, algorithm_version, comparison_spec_version, evaluation_horizon_days, candidate_pool, source_prediction_snapshot_id, computed_at, payload_hash, source_run:tli_collection_runs!inner(status)',
} as const

export function createSupabaseConfirmatoryFeatureBatchDataSource(
  client: SupabaseConfirmatoryClient,
  options: SupabaseConfirmatorySourceOptions = {},
): ConfirmatoryFeatureBatchDataSource {
  const { pageSize, idChunkSize } = resolveSourceOptions(options)
  return {
    loadStudyOriginBundle(studyOriginManifestId) {
      const pending = selectFrom(client, TABLES.studyOrigins, COLUMNS.studyOrigins)
        .eq('id', studyOriginManifestId).maybeSingle()
      return readParsed(TABLES.studyOrigins, pending, parseStudyOriginBundle)
    },
    loadStudyThemeInputs(studyOriginManifestId) {
      return readAllPages({
        table: TABLES.studyThemes,
        pageSize,
        createQuery: () => selectFrom(client, TABLES.studyThemes, COLUMNS.studyThemes)
          .eq('study_origin_manifest_id', studyOriginManifestId)
          .order('theme_id', { ascending: true }),
        parser: parseStudyThemeInputs,
      })
    },
    loadForecastOriginManifest(forecastOriginManifestId) {
      const pending = selectFrom(client, TABLES.forecastOrigins, COLUMNS.forecastOrigins)
        .eq('id', forecastOriginManifestId).maybeSingle()
      return readParsed(TABLES.forecastOrigins, pending, parseForecastOriginManifest)
    },
    loadForecastThemeInputs(forecastOriginManifestId) {
      return readAllPages({
        table: TABLES.forecastThemes,
        pageSize,
        createQuery: () => selectFrom(client, TABLES.forecastThemes, COLUMNS.forecastThemes)
          .eq('forecast_origin_manifest_id', forecastOriginManifestId)
          .order('theme_id', { ascending: true }),
        parser: parseForecastThemeInputs,
      })
    },
    loadCollectionRunsByIds(collectionRunIds) {
      return readChunkedPages({
        table: TABLES.runs, pageSize, idChunkSize, ids: collectionRunIds,
        createChunkQuery: (ids) => selectFrom(client, TABLES.runs, COLUMNS.runs)
          .in('id', ids).order('id', { ascending: true }),
        parser: parseCollectionRuns,
      })
    },
    loadInterestObservationsByRunIds(collectionRunIds) {
      return readChunkedPages({
        table: TABLES.interest, pageSize, idChunkSize, ids: collectionRunIds,
        createChunkQuery: (ids) => selectFrom(client, TABLES.interest, COLUMNS.interest)
          .in('collection_run_id', ids)
          .order('collection_run_id', { ascending: true })
          .order('theme_id', { ascending: true })
          .order('trading_date', { ascending: true })
          .order('id', { ascending: true }),
        parser: parseInterestObservations,
      })
    },
    loadNewsObservationsByIds(observationIds) {
      return readChunkedPages({
        table: TABLES.news, pageSize, idChunkSize, ids: observationIds,
        createChunkQuery: (ids) => selectFrom(client, TABLES.news, COLUMNS.news)
          .in('id', ids).order('id', { ascending: true }),
        parser: parseNewsObservations,
      })
    },
    loadBablObservationsByIds(observationIds) {
      return readChunkedPages({
        table: TABLES.babl, pageSize, idChunkSize, ids: observationIds,
        createChunkQuery: (ids) => selectFrom(client, TABLES.babl, COLUMNS.babl)
          .in('id', ids).order('id', { ascending: true }),
        parser: parseBablObservations,
      })
    },
  }
}

export async function loadConfirmatoryFeatureBatchFromSupabase(
  request: ConfirmatoryFeatureBatchRequest,
): Promise<ConfirmatoryFeatureBatch> {
  const { supabaseAdmin } = await import('@/scripts/tli/shared/supabase-admin')
  return loadConfirmatoryFeatureBatch(
    request,
    createSupabaseConfirmatoryFeatureBatchDataSource(supabaseAdmin),
  )
}
