/**
 * TLI v3 Todo 8: content-addressed dataset manifest + keyset-loaded confirmatory dataset.
 *
 * 하나의 pre-outcome `study_contract_id`에 origin-binding 된 `gta-v2` confirmatory label만
 * `(base_date, theme_id, id)` stable keyset으로 읽는다. 서로 다른 study origin을 절대 섞지 않으며
 * row count만으로 동일성을 주장하지 않는다. 같은 study ID + immutable cutoff의 반복 load는
 * ordered row bytes/hash가 완전히 동일해야 한다(dataset determinism 계약).
 *
 * 직렬화·해시는 `@/lib/tli/canonical-json`(canonical-json-v1, RFC 8785 JCS)만 쓴다 — 신규 구현 금지.
 */

import {
  compareUtf8Bytes,
  sha256CanonicalJson,
  type JsonObject,
} from '@/lib/tli/canonical-json'
import { supabaseAdmin } from '@/scripts/tli/shared/supabase-admin'
import {
  keysetOrExpression,
  paginateByKeyset,
  type KeysetColumns,
  type KeysetCursor,
} from '@/scripts/tli/shared/keyset'

export const DATASET_MANIFEST_VERSION = 'tli-dataset-manifest-v1'
export const CONFIRMATORY_LABEL_TYPE = 'gt_a'
export const CONFIRMATORY_LABELER_VERSION = 'gta-v2'
export const CONFIRMATORY_HORIZON_DAYS = 5
export const CONFIRMATORY_USE_STATUS = 'confirmatory_eligible'
export const CONFIRMATORY_USE_REASON = 'gta_v2_exact_contract'
export const DATASET_PAGE_SIZE = 1000
const SOURCE_RUN_CHUNK_SIZE = 300

const KEYSET_COLUMNS: KeysetColumns = { first: 'base_date', second: 'theme_id', third: 'id' }

/**
 * plan 8번 loader 필터 계약. manifest에 그대로 기록해 self-documenting AND 계약으로 남긴다.
 * 각 항목은 아래 loader가 강제하는 exact predicate와 1:1로 대응한다.
 */
export const CONFIRMATORY_QUERY_CONTRACT = {
  label_type: CONFIRMATORY_LABEL_TYPE,
  labeler_version: CONFIRMATORY_LABELER_VERSION,
  horizon_days: CONFIRMATORY_HORIZON_DAYS,
  label_status: 'final',
  scientific_use_status: CONFIRMATORY_USE_STATUS,
  scientific_use_reason: CONFIRMATORY_USE_REASON,
  rescale_suspect: false,
  outcome: 'y_binary_not_null',
  finalized_at: 'lte_as_of_cutoff',
  label_source_run_completed_at: 'lte_as_of_cutoff',
  study_origin_binding: 'required_single_study_contract',
  keyset: 'base_date_theme_id_id',
} as const satisfies JsonObject

// ── DB row shapes ──

export interface StudyContractRow {
  readonly id: string
  readonly payload_sha256: string
  readonly labeler_version: string
  readonly label_contract_sha256: string
  readonly feature_contract_version: string
  readonly feature_contract_sha256: string
}

export interface StudyOriginBindingRow {
  readonly study_origin_manifest_id: string
  readonly forecast_origin_manifest_id: string
}

export interface RawConfirmatoryLabelRow {
  readonly id: string
  readonly theme_id: string
  readonly base_date: string
  readonly horizon_days: number
  readonly labeler_version: string
  readonly label_type: string
  readonly label_status: string
  readonly scientific_use_status: string
  readonly scientific_use_reason: string
  readonly rescale_suspect: boolean
  readonly y_binary: boolean | null
  readonly g_log_ratio: number | string | null
  readonly finalized_at: string | null
  readonly forecast_origin_manifest_id: string | null
  readonly label_source_run_id: string | null
  readonly past_dates: readonly string[] | null
  readonly future_dates: readonly string[] | null
}

/** loader의 DB 접근 표면. 테스트는 in-memory fake를 주입해 keyset·hash·필터 계약을 직접 반증한다. */
export interface DatasetDataSource {
  loadStudyContract(studyContractId: string): Promise<StudyContractRow | null>
  loadStudyOriginBindings(studyContractId: string): Promise<readonly StudyOriginBindingRow[]>
  loadConfirmatoryLabelPage(input: {
    readonly forecastOriginManifestIds: readonly string[]
    readonly asOfCutoff: string
    readonly after: KeysetCursor | null
    readonly pageSize: number
  }): Promise<readonly RawConfirmatoryLabelRow[]>
  loadSourceRunCompletions(runIds: readonly string[]): Promise<ReadonlyMap<string, string>>
}

// ── Output shapes ──

export interface DatasetRow {
  readonly id: string
  readonly themeId: string
  readonly baseDate: string
  readonly horizonDays: number
  readonly forecastOriginManifestId: string
  readonly studyOriginManifestId: string
  readonly labelSourceRunId: string
  readonly finalizedAt: string
  readonly labelSourceRunCompletedAt: string
  readonly yBinary: boolean
  readonly gLogRatio: number
  readonly pastDates: readonly string[]
  readonly futureDates: readonly string[]
}

export interface DatasetManifest extends JsonObject {
  readonly manifest_version: typeof DATASET_MANIFEST_VERSION
  readonly study_contract_id: string
  readonly study_contract_sha256: string
  readonly labeler_version: typeof CONFIRMATORY_LABELER_VERSION
  readonly label_contract_sha256: string
  readonly feature_contract_version: string
  readonly feature_contract_sha256: string
  readonly horizon_days: typeof CONFIRMATORY_HORIZON_DAYS
  readonly as_of_cutoff: string
  readonly query_contract: typeof CONFIRMATORY_QUERY_CONTRACT
  readonly row_count: number
  readonly unique_key_count: number
  readonly min_base_date: string | null
  readonly max_base_date: string | null
  readonly forecast_origin_manifest_ids: readonly string[]
  readonly study_origin_manifest_ids: readonly string[]
  readonly label_source_run_ids: readonly string[]
  readonly ordered_rows_sha256: string
}

export interface LoadedDataset {
  readonly manifest: DatasetManifest
  readonly manifestSha256: string
  readonly rows: readonly DatasetRow[]
}

// ── Canonicalization helpers ──

/** DB timestamptz → canonical-json-v1 UTC millisecond string (`YYYY-MM-DDTHH:mm:ss.sssZ`). */
const toCanonicalTimestamp = (value: string, field: string): string => {
  const parsed = new Date(value)
  const ms = parsed.getTime()
  if (!Number.isFinite(ms)) {
    throw new Error(`dataset manifest field ${field} is not a parseable timestamp: ${value}`)
  }
  return parsed.toISOString()
}

const toFiniteNumber = (value: number | string | null, field: string): number => {
  if (value === null) throw new Error(`dataset manifest field ${field} must be non-null and finite`)
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) throw new Error(`dataset manifest field ${field} must be finite`)
  return numeric
}

const rowKey = (row: RawConfirmatoryLabelRow): KeysetCursor => ({
  first: row.base_date,
  second: row.theme_id,
  third: row.id,
})

/** ordered row SHA-256의 대상이 되는 정규 row 객체. keyset 순서 그대로 배열에 담아 해싱한다. */
const canonicalDatasetRow = (row: DatasetRow): JsonObject => ({
  base_date: row.baseDate,
  theme_id: row.themeId,
  id: row.id,
  horizon_days: row.horizonDays,
  labeler_version: CONFIRMATORY_LABELER_VERSION,
  forecast_origin_manifest_id: row.forecastOriginManifestId,
  study_origin_manifest_id: row.studyOriginManifestId,
  label_source_run_id: row.labelSourceRunId,
  finalized_at: row.finalizedAt,
  label_source_run_completed_at: row.labelSourceRunCompletedAt,
  y_binary: row.yBinary,
  g_log_ratio: row.gLogRatio,
  past_dates: [...row.pastDates],
  future_dates: [...row.futureDates],
})

const sortedUnique = (values: readonly string[]): string[] =>
  [...new Set(values)].sort(compareUtf8Bytes)

// ── Production data source ──

export const createSupabaseDatasetDataSource = (): DatasetDataSource => ({
  async loadStudyContract(studyContractId) {
    const { data, error } = await supabaseAdmin
      .from('tli_attention_study_contracts')
      .select('id, payload_sha256, labeler_version, label_contract_sha256, feature_contract_version, feature_contract_sha256')
      .eq('id', studyContractId)
      .maybeSingle()
    if (error) throw new Error(`study contract query failed: ${error.message}`)
    return (data as StudyContractRow | null) ?? null
  },

  async loadStudyOriginBindings(studyContractId) {
    const { data, error } = await supabaseAdmin
      .from('tli_study_origin_manifests')
      .select('id, forecast_origin_manifest_id')
      .eq('study_contract_id', studyContractId)
      .order('id', { ascending: true })
    if (error) throw new Error(`study-origin binding query failed: ${error.message}`)
    return ((data ?? []) as readonly { readonly id: string; readonly forecast_origin_manifest_id: string }[])
      .map((row) => ({
        study_origin_manifest_id: row.id,
        forecast_origin_manifest_id: row.forecast_origin_manifest_id,
      }))
  },

  async loadConfirmatoryLabelPage({ forecastOriginManifestIds, asOfCutoff, after, pageSize }) {
    // `.or()`는 filter builder에만 있으므로 `.order()/.limit()`(transform builder) 앞에서 적용한다.
    let filter = supabaseAdmin
      .from('theme_labels')
      .select('id, theme_id, base_date, horizon_days, labeler_version, label_type, label_status, scientific_use_status, scientific_use_reason, rescale_suspect, y_binary, g_log_ratio, finalized_at, forecast_origin_manifest_id, label_source_run_id, past_dates, future_dates')
      .eq('label_type', CONFIRMATORY_LABEL_TYPE)
      .eq('labeler_version', CONFIRMATORY_LABELER_VERSION)
      .eq('horizon_days', CONFIRMATORY_HORIZON_DAYS)
      .eq('label_status', 'final')
      .eq('scientific_use_status', CONFIRMATORY_USE_STATUS)
      .eq('scientific_use_reason', CONFIRMATORY_USE_REASON)
      .eq('rescale_suspect', false)
      .not('y_binary', 'is', null)
      .lte('finalized_at', asOfCutoff)
      .in('forecast_origin_manifest_id', forecastOriginManifestIds)

    if (after !== null) filter = filter.or(keysetOrExpression(KEYSET_COLUMNS, after))

    const { data, error } = await filter
      .order('base_date', { ascending: true })
      .order('theme_id', { ascending: true })
      .order('id', { ascending: true })
      .limit(pageSize)
    if (error) throw new Error(`confirmatory label page query failed: ${error.message}`)
    return (data as RawConfirmatoryLabelRow[] | null) ?? []
  },

  async loadSourceRunCompletions(runIds) {
    const completions = new Map<string, string>()
    for (let index = 0; index < runIds.length; index += SOURCE_RUN_CHUNK_SIZE) {
      const chunk = runIds.slice(index, index + SOURCE_RUN_CHUNK_SIZE)
      const { data, error } = await supabaseAdmin
        .from('tli_collection_runs')
        .select('id, completed_at')
        .in('id', chunk)
      if (error) throw new Error(`label source run query failed: ${error.message}`)
      for (const row of (data ?? []) as readonly { readonly id: string; readonly completed_at: string }[]) {
        completions.set(row.id, row.completed_at)
      }
    }
    return completions
  },
})

// ── Loader ──

export const loadConfirmatoryDataset = async (
  input: { readonly studyContractId: string; readonly asOfCutoff: string },
  source: DatasetDataSource = createSupabaseDatasetDataSource(),
): Promise<LoadedDataset> => {
  const asOfCutoff = toCanonicalTimestamp(input.asOfCutoff, 'as_of_cutoff')
  const asOfCutoffMs = new Date(asOfCutoff).getTime()

  const studyContract = await source.loadStudyContract(input.studyContractId)
  if (studyContract === null) {
    throw new Error(`dataset manifest requires an existing study contract: ${input.studyContractId}`)
  }
  if (studyContract.labeler_version !== CONFIRMATORY_LABELER_VERSION) {
    throw new Error(`study contract labeler_version must be ${CONFIRMATORY_LABELER_VERSION}`)
  }

  const bindings = await source.loadStudyOriginBindings(input.studyContractId)
  const studyOriginByForecast = new Map<string, string>()
  for (const binding of bindings) {
    if (studyOriginByForecast.has(binding.forecast_origin_manifest_id)) {
      throw new Error(`study contract binds forecast origin ${binding.forecast_origin_manifest_id} more than once`)
    }
    studyOriginByForecast.set(binding.forecast_origin_manifest_id, binding.study_origin_manifest_id)
  }
  const forecastOriginManifestIds = sortedUnique([...studyOriginByForecast.keys()])

  const rawRows = forecastOriginManifestIds.length === 0
    ? []
    : await paginateByKeyset<RawConfirmatoryLabelRow>({
      pageSize: DATASET_PAGE_SIZE,
      keyOf: rowKey,
      fetchPage: (after) => source
        .loadConfirmatoryLabelPage({ forecastOriginManifestIds, asOfCutoff, after, pageSize: DATASET_PAGE_SIZE })
        .then((page) => [...page]),
    })

  // 직접 표현 가능한 AND 계약을 defensively 재검증한다 — 데이터 소스가 broaden 하더라도 계약을 강제한다.
  const contractRows = rawRows.filter((raw) =>
    raw.label_type === CONFIRMATORY_LABEL_TYPE
    && raw.labeler_version === CONFIRMATORY_LABELER_VERSION
    && raw.horizon_days === CONFIRMATORY_HORIZON_DAYS
    && raw.label_status === 'final'
    && raw.scientific_use_status === CONFIRMATORY_USE_STATUS
    && raw.scientific_use_reason === CONFIRMATORY_USE_REASON
    && raw.rescale_suspect === false
    && raw.y_binary !== null
    && raw.finalized_at !== null
    && new Date(toCanonicalTimestamp(raw.finalized_at, 'finalized_at')).getTime() <= asOfCutoffMs
    && raw.forecast_origin_manifest_id !== null
    && studyOriginByForecast.has(raw.forecast_origin_manifest_id)
    && raw.label_source_run_id !== null)

  const runIds = sortedUnique(contractRows.map((raw) => raw.label_source_run_id as string))
  const completions = await source.loadSourceRunCompletions(runIds)

  const rows: DatasetRow[] = []
  for (const raw of contractRows) {
    const runId = raw.label_source_run_id as string
    const completedAt = completions.get(runId)
    if (completedAt === undefined) continue // joined label source run 부재 → confirmatory 배제
    const completedCanonical = toCanonicalTimestamp(completedAt, 'label_source_run.completed_at')
    if (new Date(completedCanonical).getTime() > asOfCutoffMs) continue // late source → 배제

    const forecastId = raw.forecast_origin_manifest_id as string
    rows.push({
      id: raw.id,
      themeId: raw.theme_id,
      baseDate: raw.base_date,
      horizonDays: raw.horizon_days,
      forecastOriginManifestId: forecastId,
      studyOriginManifestId: studyOriginByForecast.get(forecastId) as string,
      labelSourceRunId: runId,
      finalizedAt: toCanonicalTimestamp(raw.finalized_at as string, 'finalized_at'),
      labelSourceRunCompletedAt: completedCanonical,
      yBinary: raw.y_binary as boolean,
      gLogRatio: toFiniteNumber(raw.g_log_ratio, 'g_log_ratio'),
      pastDates: raw.past_dates ?? [],
      futureDates: raw.future_dates ?? [],
    })
  }

  const uniqueKeys = new Set(rows.map((row) => `${row.baseDate}|${row.themeId}|${row.horizonDays}`))
  if (uniqueKeys.size !== rows.length) {
    throw new Error('dataset contains duplicate confirmatory label keys (theme_id, base_date, horizon_days)')
  }

  const orderedRowsSha256 = sha256CanonicalJson(rows.map(canonicalDatasetRow))

  const manifest: DatasetManifest = {
    manifest_version: DATASET_MANIFEST_VERSION,
    study_contract_id: studyContract.id,
    study_contract_sha256: studyContract.payload_sha256,
    labeler_version: CONFIRMATORY_LABELER_VERSION,
    label_contract_sha256: studyContract.label_contract_sha256,
    feature_contract_version: studyContract.feature_contract_version,
    feature_contract_sha256: studyContract.feature_contract_sha256,
    horizon_days: CONFIRMATORY_HORIZON_DAYS,
    as_of_cutoff: asOfCutoff,
    query_contract: CONFIRMATORY_QUERY_CONTRACT,
    row_count: rows.length,
    unique_key_count: uniqueKeys.size,
    min_base_date: rows.length === 0 ? null : rows[0].baseDate,
    max_base_date: rows.length === 0 ? null : rows[rows.length - 1].baseDate,
    forecast_origin_manifest_ids: sortedUnique(rows.map((row) => row.forecastOriginManifestId)),
    study_origin_manifest_ids: sortedUnique(rows.map((row) => row.studyOriginManifestId)),
    label_source_run_ids: sortedUnique(rows.map((row) => row.labelSourceRunId)),
    ordered_rows_sha256: orderedRowsSha256,
  }

  return {
    manifest,
    manifestSha256: sha256CanonicalJson(manifest),
    rows,
  }
}
