/**
 * TLI v3 Todo 6: Immutable collection vintage 계약 — 순수 함수.
 *
 * API call마다 terminal run + observations를 하나의 append 페이로드로 만든다. 여기서 만든 payload는
 * 그대로 한 DB transaction에 들어가야 하며, 성공 후에만 current cache를 갱신한다.
 *
 * 046의 `validate_tli_collection_run_observations` 트리거가 COMMIT 시점에
 * `expected_keys_sha256`와 실제 삽입된 observation key 집합을 대조하므로,
 * 여기서 계산하는 key/hash는 DB의 SQL 표현식과 **문자 단위로 동일**해야 한다.
 *
 * WHY expected key 정의:
 *   interest는 요청한 테마 그룹 전체가 response에 존재할 때만 complete다. 반면 개별 테마의 날짜 희소성은
 *   run을 오염시키지 않는다 — DataLab은 0-volume 날짜를 응답에서 생략하므로, "요청 테마 × 요청 창의 전
 *   거래일"을 expected로 두면 희소 테마 하나가 같은 배치의 정상 테마까지 전부 abstain시킨다.
 *   테마별 20-slot 충족 여부는 046 `create_tli_forecast_origin_manifest`가 독립적으로 검증한다.
 *   news는 반대로 expected theme×date마다 0건도 명시적 row로 저장해야 하므로 zero-fill이 계약이다.
 */

import {
  canonicalJsonV1Sha256,
  compareUtf8Bytes,
  sha256JsonStringArray,
  type JsonObject,
  type JsonValue,
} from '@/lib/tli/canonical-json'
import {
  addKoreanTradingDays,
  getKoreanTradingDateWindow,
  isKoreanTradingDate,
} from '@/lib/tli/trading-calendar'

// ── Types ──

export type CollectionRunSource = 'naver_datalab' | 'naver_news' | 'babl_phase'
export type CollectionRunStatus = 'complete' | 'partial' | 'failed'

export const INTEREST_OBSERVATION_SOURCE = 'naver_datalab'

export interface KeywordGroupSpec {
  readonly group_name: string
  readonly keywords: readonly string[]
}

export interface InterestObservationInput {
  readonly theme_id: string
  readonly trading_date: string
  readonly source: typeof INTEREST_OBSERVATION_SOURCE
  readonly raw_value: number
  readonly normalized: number
  readonly anchor_scaled_value: number | null
  readonly keyword_epoch: number
}

export interface NewsObservationInput {
  readonly theme_id: string
  readonly article_date: string
  readonly article_count: number
  readonly query_hash: string
  readonly collected_at: string
}

export interface BablObservationInput {
  readonly theme_id: string
  readonly snapshot_date: string
  readonly phase: string
  readonly algorithm_version: string
  readonly candidate_pool: string
  readonly comparison_spec_version: string
  readonly evaluation_horizon_days: number
  readonly source_prediction_snapshot_id: string
  readonly computed_at: string
  readonly payload_hash: string
}

export type CollectionObservationInput =
  | InterestObservationInput
  | NewsObservationInput
  | BablObservationInput

export interface CollectionRunInput {
  readonly source: CollectionRunSource
  readonly contract_version: string
  readonly request_window_start: string
  readonly request_window_end: string
  readonly request_payload: JsonObject
  readonly response_payload: JsonValue | null
  readonly request_sha256: string
  readonly response_sha256: string | null
  readonly keyword_group_hash: string | null
  readonly expected_universe_hash: string
  readonly expected_keys_sha256: string
  readonly expected_row_count: number
  readonly observed_row_count: number
  readonly source_max_date: string | null
  readonly requested_at: string
  readonly collected_at: string
  readonly completed_at: string
  readonly status: CollectionRunStatus
  readonly failure_summary: JsonObject | null
}

export interface CollectionRunAppend<TObservation extends CollectionObservationInput> {
  readonly run: CollectionRunInput
  readonly observations: readonly TObservation[]
}

export interface CollectionRunTimestamps {
  readonly requestedAt: string
  readonly collectedAt: string
  readonly completedAt: string
}

// ── Keys (046 SQL 표현식과 동일해야 함) ──

export const interestObservationKey = (observation: InterestObservationInput): string =>
  `${observation.theme_id}|${observation.trading_date}|${observation.source}`

export const newsObservationKey = (observation: NewsObservationInput): string =>
  `${observation.theme_id}|${observation.article_date}`

export const bablObservationKey = (observation: BablObservationInput): string =>
  [
    observation.theme_id,
    observation.snapshot_date,
    observation.algorithm_version,
    observation.candidate_pool,
    observation.comparison_spec_version,
    String(observation.evaluation_horizon_days),
  ].join('|')

// ── Keyword group ──

/**
 * 046은 `interest_run.keyword_group_hash = child.keyword_group_sha256 = news.query_hash`를 강제한다.
 * 따라서 interest와 news는 반드시 같은 spec을 쓰며, 키워드 순서 변동이 hash를 흔들지 않도록 정렬한다.
 */
export const buildKeywordGroupSpec = (input: {
  readonly groupName: string
  readonly keywords: readonly string[]
}): KeywordGroupSpec => ({
  group_name: input.groupName,
  keywords: [...new Set(input.keywords)].sort(compareUtf8Bytes),
})

export const keywordGroupSha256 = (spec: KeywordGroupSpec): string =>
  canonicalJsonV1Sha256({ group_name: spec.group_name, keywords: [...spec.keywords] })

/** DataLab 요청에 쓰는 키워드 확장 (괄호 제거형·한글 전용형 변형 추가 후 상위 5개) */
export const preprocessDatalabKeywords = (keywords: readonly string[]): string[] => {
  const processed = new Set<string>()

  for (const keyword of keywords) {
    processed.add(keyword)

    const withoutParens = keyword.replace(/\s*\([^)]*\)\s*/g, '').trim()
    if (withoutParens && withoutParens !== keyword) processed.add(withoutParens)

    const koreanOnly = keyword.replace(/[^가-힣\s]/g, '').trim()
    if (koreanOnly && koreanOnly.length >= 2 && koreanOnly !== keyword) processed.add(koreanOnly)
  }

  return [...processed].slice(0, 5)
}

export interface KeywordGroupTheme {
  readonly name: string
  readonly naverKeywords: readonly string[]
}

/**
 * interest run·news run·forecast theme input이 공유하는 유일한 keyword group 정의.
 * 046이 `keyword_group_hash == keyword_group_sha256 == news.query_hash`를 강제하므로 갈라질 수 없다.
 */
export const resolveThemeKeywordGroup = (theme: KeywordGroupTheme): KeywordGroupSpec =>
  buildKeywordGroupSpec({
    groupName: theme.name,
    keywords: preprocessDatalabKeywords(theme.naverKeywords),
  })

/** 여러 테마 그룹을 한 request로 묶은 batch run의 keyword_group_hash */
export const datalabBatchKeywordGroupHash = (specs: readonly KeywordGroupSpec[]): string =>
  canonicalJsonV1Sha256({
    groups: [...specs]
      .sort((left, right) => compareUtf8Bytes(left.group_name, right.group_name))
      .map((spec) => ({ group_name: spec.group_name, keywords: [...spec.keywords] })),
  })

// ── Date helpers ──

const MILLIS_PER_DAY = 86_400_000

const toUtcMillis = (date: string): number => {
  const millis = Date.parse(`${date}T00:00:00.000Z`)
  if (!Number.isFinite(millis)) throw new Error(`잘못된 날짜: ${date}`)
  return millis
}

const toIsoDate = (millis: number): string => new Date(millis).toISOString().slice(0, 10)

/** 046 forecast manifest가 news expected date를 달력일로 계산하므로 여기서도 달력일을 쓴다. */
export const calendarDatesBetween = (startDate: string, endDate: string): string[] => {
  if (startDate > endDate) return []
  const dates: string[] = []
  for (let cursor = toUtcMillis(startDate); cursor <= toUtcMillis(endDate); cursor += MILLIS_PER_DAY) {
    dates.push(toIsoDate(cursor))
  }
  return dates
}

export const FORECAST_INTEREST_SLOTS = 20

/**
 * forecast-usable interest run의 요청 창.
 *
 * 046은 run window 안의 `trading_date <= origin_date` observation이 **정확히 20개**일 것을 요구한다
 * (046:903-914). DataLab은 당일 데이터를 지연 제공하므로 창을 base date 직전 거래일에서 끝내
 * 20개 slot이 항상 관측 가능하게 한다. 이때 source age는 1 거래일로 계약 상한(≤1)을 만족한다.
 */
export const forecastInterestRunWindow = (
  baseDate: string,
): { readonly startDate: string; readonly endDate: string; readonly tradingDates: readonly string[] } => {
  const endDate = addKoreanTradingDays(baseDate, -1)
  const tradingDates = getKoreanTradingDateWindow({
    baseDate: endDate,
    startOffset: -(FORECAST_INTEREST_SLOTS - 1),
    endOffset: 0,
  })
  return { startDate: tradingDates[0], endDate, tradingDates }
}

const maxDate = (dates: readonly string[]): string | null =>
  dates.length === 0 ? null : dates.reduce((left, right) => (right > left ? right : left))

const uniqueSorted = (values: readonly string[]): string[] =>
  [...new Set(values)].sort(compareUtf8Bytes)

// ── Shared assembly ──

interface RunEnvelope {
  readonly source: CollectionRunSource
  readonly contractVersion: string
  readonly requestWindowStart: string
  readonly requestWindowEnd: string
  readonly requestPayload: JsonObject
  readonly responsePayload: JsonValue | null
  readonly keywordGroupHash: string | null
  readonly expectedThemeIds: readonly string[]
  readonly expectedKeys: readonly string[]
  readonly observationKeys: readonly string[]
  readonly sourceMaxDate: string | null
  readonly timestamps: CollectionRunTimestamps
  readonly failureSummary: JsonObject | null
}

const assembleRun = (envelope: RunEnvelope): CollectionRunInput => {
  const expectedKeys = uniqueSorted(envelope.expectedKeys)
  const observationKeys = envelope.observationKeys

  if (new Set(observationKeys).size !== observationKeys.length) {
    throw new Error(`${envelope.source} run에 중복 observation key가 있습니다`)
  }

  const isComplete = envelope.failureSummary === null
  if (isComplete) {
    const observedSorted = uniqueSorted(observationKeys)
    if (
      observedSorted.length !== expectedKeys.length
      || observedSorted.some((key, index) => key !== expectedKeys[index])
    ) {
      throw new Error(`${envelope.source} complete run의 관측 key가 expected key set과 다릅니다`)
    }
  }

  return {
    source: envelope.source,
    contract_version: envelope.contractVersion,
    request_window_start: envelope.requestWindowStart,
    request_window_end: envelope.requestWindowEnd,
    request_payload: envelope.requestPayload,
    response_payload: envelope.responsePayload,
    request_sha256: canonicalJsonV1Sha256(envelope.requestPayload),
    response_sha256:
      envelope.responsePayload === null ? null : canonicalJsonV1Sha256(envelope.responsePayload),
    keyword_group_hash: envelope.keywordGroupHash,
    expected_universe_hash: sha256JsonStringArray(uniqueSorted(envelope.expectedThemeIds)),
    // DB `tli_sha256_json_string_array`가 C collation으로 재정렬하므로 순서는 무의미하지만 동일 입력을 넣는다.
    expected_keys_sha256: sha256JsonStringArray(expectedKeys),
    expected_row_count: expectedKeys.length,
    observed_row_count: observationKeys.length,
    source_max_date: envelope.sourceMaxDate,
    requested_at: envelope.timestamps.requestedAt,
    collected_at: envelope.timestamps.collectedAt,
    completed_at: envelope.timestamps.completedAt,
    status: isComplete ? 'complete' : envelope.observationKeys.length === 0 ? 'failed' : 'partial',
    failure_summary: envelope.failureSummary,
  }
}

// ── Interest (Naver DataLab) ──

export interface DatalabResponseGroup {
  readonly title: string
  readonly keywords: readonly string[]
  readonly data: ReadonlyArray<{ readonly period: string; readonly ratio: number }>
}

export interface BuildInterestRunInput {
  readonly contractVersion: string
  readonly requestWindowStart: string
  readonly requestWindowEnd: string
  readonly requestPayload: JsonObject
  readonly responsePayload: JsonValue | null
  /** 이 request의 keyword-group spec hash. 테마 dedicated run이면 그 테마의 keyword_group_sha256와 같다. */
  readonly keywordGroupHash: string
  /** 요청에 포함된 테마 그룹 (앵커 그룹 제외) */
  readonly requestedThemes: ReadonlyArray<{ readonly themeId: string; readonly groupName: string }>
  /** response에서 테마별로 뽑아낸 관측치. 한국 거래일만 남겨야 한다. */
  readonly observations: readonly InterestObservationInput[]
  /** response에 그룹이 존재한 테마 id */
  readonly respondedThemeIds: readonly string[]
  readonly timestamps: CollectionRunTimestamps
  /** API 예외 등으로 response 자체가 없을 때 */
  readonly failureSummary?: JsonObject | null
}

export const buildInterestCollectionRun = (
  input: BuildInterestRunInput,
): CollectionRunAppend<InterestObservationInput> => {
  const requestedThemeIds = input.requestedThemes.map((theme) => theme.themeId)
  const respondedThemeIds = new Set(input.respondedThemeIds)

  for (const observation of input.observations) {
    if (observation.source !== INTEREST_OBSERVATION_SOURCE) {
      throw new Error(`interest observation source가 잘못되었습니다: ${observation.source}`)
    }
    if (!isKoreanTradingDate(observation.trading_date)) {
      throw new Error(`interest observation은 한국 거래일만 허용됩니다: ${observation.trading_date}`)
    }
    if (!respondedThemeIds.has(observation.theme_id)) {
      throw new Error(`response에 없는 테마의 관측치입니다: ${observation.theme_id}`)
    }
  }

  const missingThemeIds = requestedThemeIds.filter((themeId) => !respondedThemeIds.has(themeId))
  const explicitFailure = input.failureSummary ?? null

  const failureSummary: JsonObject | null =
    explicitFailure !== null
      ? explicitFailure
      : missingThemeIds.length > 0
        ? { reason: 'missing_response_groups', missing_theme_ids: [...missingThemeIds].sort(compareUtf8Bytes) }
        : null

  const observationKeys = input.observations.map(interestObservationKey)

  // partial/failed 런은 응답받지 못한 테마의 거래일 slot까지 expected로 선언해 결손을 명시한다.
  const missingKeys =
    failureSummary === null
      ? []
      : (explicitFailure !== null ? requestedThemeIds : missingThemeIds).flatMap((themeId) =>
          calendarDatesBetween(input.requestWindowStart, input.requestWindowEnd)
            .filter(isKoreanTradingDate)
            .map((date) => `${themeId}|${date}|${INTEREST_OBSERVATION_SOURCE}`),
        )

  const observations = explicitFailure !== null ? [] : input.observations

  return {
    run: assembleRun({
      source: 'naver_datalab',
      contractVersion: input.contractVersion,
      requestWindowStart: input.requestWindowStart,
      requestWindowEnd: input.requestWindowEnd,
      requestPayload: input.requestPayload,
      responsePayload: explicitFailure !== null ? null : input.responsePayload,
      keywordGroupHash: input.keywordGroupHash,
      expectedThemeIds: requestedThemeIds,
      expectedKeys: [...observations.map(interestObservationKey), ...missingKeys],
      observationKeys: explicitFailure !== null ? [] : observationKeys,
      sourceMaxDate: maxDate(observations.map((observation) => observation.trading_date)),
      timestamps: input.timestamps,
      failureSummary,
    }),
    observations,
  }
}

// ── News (Naver News, 테마당 1 run) ──

export interface BuildNewsRunInput {
  readonly contractVersion: string
  readonly themeId: string
  readonly requestWindowStart: string
  readonly requestWindowEnd: string
  readonly requestPayload: JsonObject
  readonly responsePayload: JsonValue | null
  readonly keywordGroupSha256: string
  /** 날짜별 기사 수. 0건 날짜는 여기에 없어도 되며 explicit zero row로 채워진다. */
  readonly articleCountByDate: ReadonlyMap<string, number>
  readonly timestamps: CollectionRunTimestamps
  readonly failureSummary?: JsonObject | null
}

/**
 * complete run은 expected theme×date마다 0건도 명시적 `article_count=0` row로 저장한다.
 * row 부재는 0건이 아니라 source missing이다.
 */
export const buildNewsCollectionRun = (
  input: BuildNewsRunInput,
): CollectionRunAppend<NewsObservationInput> => {
  const expectedDates = calendarDatesBetween(input.requestWindowStart, input.requestWindowEnd)
  const failureSummary = input.failureSummary ?? null

  for (const date of input.articleCountByDate.keys()) {
    if (!expectedDates.includes(date)) {
      throw new Error(`요청 창 밖의 뉴스 날짜입니다: ${date}`)
    }
  }

  const observations: NewsObservationInput[] =
    failureSummary !== null
      ? []
      : expectedDates.map((date) => ({
          theme_id: input.themeId,
          article_date: date,
          article_count: input.articleCountByDate.get(date) ?? 0,
          query_hash: input.keywordGroupSha256,
          collected_at: input.timestamps.collectedAt,
        }))

  const expectedKeys = expectedDates.map((date) => `${input.themeId}|${date}`)

  return {
    run: assembleRun({
      source: 'naver_news',
      contractVersion: input.contractVersion,
      requestWindowStart: input.requestWindowStart,
      requestWindowEnd: input.requestWindowEnd,
      requestPayload: input.requestPayload,
      responsePayload: failureSummary !== null ? null : input.responsePayload,
      keywordGroupHash: input.keywordGroupSha256,
      expectedThemeIds: [input.themeId],
      expectedKeys,
      observationKeys: observations.map(newsObservationKey),
      sourceMaxDate: maxDate(observations.map((observation) => observation.article_date)),
      timestamps: input.timestamps,
      failureSummary,
    }),
    observations,
  }
}

// ── B-Abl phase ──

export interface ProdPhaseSnapshot {
  readonly id: string
  readonly theme_id: string
  readonly snapshot_date: string
  readonly phase: string
  readonly algorithm_version: string
  readonly candidate_pool: string
  readonly comparison_spec_version: string
  readonly evaluation_horizon_days: number
  readonly created_at: string
}

export interface BuildBablRunInput {
  readonly contractVersion: string
  readonly snapshotDate: string
  readonly requestPayload: JsonObject
  /** 이 study lock이 고정한 계약. runtime/OOS metric으로 고르지 않는다. */
  readonly studyContract: {
    readonly babl_algorithm_version: string
    readonly babl_comparison_spec_version: string
    readonly babl_evaluation_horizon_days: number
  }
  /** `run_type='prod'` 스냅샷만. candidate_pool은 각 행이 정한 값을 그대로 쓴다. */
  readonly prodSnapshots: readonly ProdPhaseSnapshot[]
  readonly timestamps: CollectionRunTimestamps
  readonly failureSummary?: JsonObject | null
}

export const bablObservationPayloadHash = (observation: Omit<BablObservationInput, 'payload_hash'>): string =>
  canonicalJsonV1Sha256({
    algorithm_version: observation.algorithm_version,
    candidate_pool: observation.candidate_pool,
    comparison_spec_version: observation.comparison_spec_version,
    computed_at: observation.computed_at,
    evaluation_horizon_days: observation.evaluation_horizon_days,
    phase: observation.phase,
    snapshot_date: observation.snapshot_date,
    source_prediction_snapshot_id: observation.source_prediction_snapshot_id,
    theme_id: observation.theme_id,
  })

const bablSnapshotOrderKey = (snapshot: ProdPhaseSnapshot): string =>
  [
    snapshot.theme_id,
    snapshot.snapshot_date,
    snapshot.algorithm_version,
    snapshot.candidate_pool,
    snapshot.comparison_spec_version,
    String(snapshot.evaluation_horizon_days),
    snapshot.id,
  ].join('\u0000')

export const buildBablCollectionRun = (
  input: BuildBablRunInput,
): CollectionRunAppend<BablObservationInput> => {
  const explicitFailure = input.failureSummary ?? null
  const sortedProdSnapshots = input.prodSnapshots
    .map((snapshot) => ({ ...snapshot, created_at: new Date(snapshot.created_at).toISOString() }))
    .sort((left, right) => compareUtf8Bytes(bablSnapshotOrderKey(left), bablSnapshotOrderKey(right)))

  const matching = sortedProdSnapshots.filter(
    (snapshot) =>
      snapshot.snapshot_date === input.snapshotDate
      && snapshot.algorithm_version === input.studyContract.babl_algorithm_version
      && snapshot.comparison_spec_version === input.studyContract.babl_comparison_spec_version
      && snapshot.evaluation_horizon_days === input.studyContract.babl_evaluation_horizon_days,
  )

  const failureSummary: JsonObject | null =
    explicitFailure ?? (matching.length === 0 ? { reason: 'no_matching_prod_snapshots' } : null)

  const responsePayload: JsonObject | null =
    explicitFailure === null
      ? {
          snapshots: sortedProdSnapshots.map((snapshot) => ({
            id: snapshot.id,
            theme_id: snapshot.theme_id,
            snapshot_date: snapshot.snapshot_date,
            phase: snapshot.phase,
            algorithm_version: snapshot.algorithm_version,
            candidate_pool: snapshot.candidate_pool,
            comparison_spec_version: snapshot.comparison_spec_version,
            evaluation_horizon_days: snapshot.evaluation_horizon_days,
            created_at: snapshot.created_at,
          })),
        }
      : null

  const observations: BablObservationInput[] =
    failureSummary !== null
      ? []
      : matching.map((snapshot) => {
          const base = {
            theme_id: snapshot.theme_id,
            snapshot_date: snapshot.snapshot_date,
            phase: snapshot.phase,
            algorithm_version: snapshot.algorithm_version,
            // candidate_pool은 study lock이 아니라 그 exact prod run이 사전에 정한 값이다.
            candidate_pool: snapshot.candidate_pool,
            comparison_spec_version: snapshot.comparison_spec_version,
            evaluation_horizon_days: snapshot.evaluation_horizon_days,
            source_prediction_snapshot_id: snapshot.id,
            computed_at: snapshot.created_at,
          }
          return { ...base, payload_hash: bablObservationPayloadHash(base) }
        })

  const observationKeys = observations.map(bablObservationKey)

  return {
    run: assembleRun({
      source: 'babl_phase',
      contractVersion: input.contractVersion,
      requestWindowStart: input.snapshotDate,
      requestWindowEnd: input.snapshotDate,
      requestPayload: input.requestPayload,
      responsePayload,
      keywordGroupHash: null,
      expectedThemeIds: observations.map((observation) => observation.theme_id),
      expectedKeys: observationKeys,
      observationKeys,
      sourceMaxDate: observations.length === 0 ? null : input.snapshotDate,
      timestamps: input.timestamps,
      failureSummary,
    }),
    observations,
  }
}

// ── RPC payload ──

export const collectionRunAppendPayload = <TObservation extends CollectionObservationInput>(
  append: CollectionRunAppend<TObservation>,
): JsonObject => ({
  run: append.run as unknown as JsonObject,
  observations: append.observations as unknown as JsonValue,
})
