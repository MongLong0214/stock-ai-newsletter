/**
 * TLI v3 Todo 6: 거래 가능한 월요일 cutoff 뒤 universal forecast origin manifest와
 * study-origin manifest의 canonical payload를 만든다 — 순수 함수.
 *
 * cycle이 0개여도 두 manifest를 계속 쌓는다. missing interest는 forecast child abstain,
 * missing B-Abl은 study child missing으로 명시한다. 과거 manifest는 절대 overwrite하지 않는다
 * (동일 payload retry만 046 RPC가 기존 id를 반환한다).
 *
 * 여기서 만드는 payload는 046 `create_tli_forecast_origin_manifest` / `bind_tli_study_origin`이
 * 독립적으로 재검증한다. 따라서 필드 집합·정렬·hash는 DB 표현식과 정확히 일치해야 한다.
 */

import {
  compareUtf8Bytes,
  sha256JsonStringArray,
  sha256OrderedJsonStringArray,
  type JsonObject,
} from '@/lib/tli/canonical-json'
import { keywordGroupSha256, type KeywordGroupSpec } from '@/scripts/tli/collectors/collection-run-contract'

export const FORECAST_MANIFEST_VERSION = 'forecast-origin-v1'
export const NEWS_INPUT_SLOTS = 14
export const INTEREST_INPUT_SLOTS = 20

export type ForecastAbstainReason = 'interest_run_unavailable' | 'news_observations_incomplete'

export type BablMissingReason =
  | 'no_matching_observation'
  | 'multiple_matching_observations'
  | 'source_run_not_complete'
  | 'source_after_cutoff'
  | 'source_pool_mismatch'

export interface ForecastThemeSource {
  readonly themeId: string
  readonly keywordGroupSpec: KeywordGroupSpec
  /** cutoff 이하 최신 complete single run. 20 거래일 slot을 모두 가진 run만 전달해야 한다. */
  readonly interestRun: { readonly id: string; readonly responseSha256: string } | null
  /** article_date 오름차순 14개. 하나라도 없으면 null (row 부재는 0건이 아니라 source missing). */
  readonly newsObservationIds: readonly string[] | null
}

/** 18:00 Asia/Seoul == 09:00 UTC (KST는 DST가 없다) */
export const forecastCutoffUtc = (originDate: string): string => `${originDate}T09:00:00.000Z`

const abstainReasonFor = (source: ForecastThemeSource): ForecastAbstainReason | null => {
  // interest를 먼저 판정한다 — 둘 다 없으면 interest 결손이 근본 원인이다.
  if (source.interestRun === null) return 'interest_run_unavailable'
  if (source.newsObservationIds === null || source.newsObservationIds.length !== NEWS_INPUT_SLOTS) {
    return 'news_observations_incomplete'
  }
  return null
}

const sortByThemeId = <T extends { readonly themeId: string }>(sources: readonly T[]): T[] =>
  [...sources].sort((left, right) => compareUtf8Bytes(left.themeId, right.themeId))

export const buildForecastOriginManifestPayload = (input: {
  readonly originDate: string
  readonly themeSources: readonly ForecastThemeSource[]
}): JsonObject => {
  const sources = sortByThemeId(input.themeSources)
  const themeIds = sources.map((source) => source.themeId)

  if (new Set(themeIds).size !== themeIds.length) {
    throw new Error('forecast manifest에 중복 테마가 있습니다')
  }
  if (themeIds.length === 0) {
    throw new Error('forecast manifest는 최소 1개 테마가 필요합니다')
  }

  const keywordManifestItems: string[] = []

  const themeInputs = sources.map((source) => {
    const keywordGroupSha = keywordGroupSha256(source.keywordGroupSpec)
    keywordManifestItems.push(`${source.themeId}|${keywordGroupSha}`)

    const abstainReason = abstainReasonFor(source)
    const keywordGroupSpec: JsonObject = {
      group_name: source.keywordGroupSpec.group_name,
      keywords: [...source.keywordGroupSpec.keywords],
    }

    if (abstainReason !== null) {
      return {
        theme_id: source.themeId,
        keyword_group_spec: keywordGroupSpec,
        keyword_group_sha256: keywordGroupSha,
        forecast_interest_run_id: null,
        forecast_interest_response_sha256: null,
        news_observation_ids: [],
        news_input_sha256: null,
        input_status: 'abstain',
        abstain_reason: abstainReason,
      } satisfies JsonObject
    }

    const newsIds = [...(source.newsObservationIds ?? [])]
    return {
      theme_id: source.themeId,
      keyword_group_spec: keywordGroupSpec,
      keyword_group_sha256: keywordGroupSha,
      forecast_interest_run_id: source.interestRun?.id ?? null,
      forecast_interest_response_sha256: source.interestRun?.responseSha256 ?? null,
      news_observation_ids: newsIds,
      news_input_sha256: sha256OrderedJsonStringArray(newsIds),
      input_status: 'usable',
      abstain_reason: null,
    } satisfies JsonObject
  })

  return {
    manifest_version: FORECAST_MANIFEST_VERSION,
    origin_date: input.originDate,
    forecast_cutoff: forecastCutoffUtc(input.originDate),
    expected_theme_ids: themeIds,
    expected_theme_count: themeIds.length,
    expected_universe_sha256: sha256JsonStringArray(themeIds),
    keyword_group_manifest_sha256: sha256JsonStringArray(keywordManifestItems),
    theme_inputs: themeInputs,
  }
}

// ── Study-origin binding ──

/**
 * cutoff 시점에 study lock의 algorithm/spec/horizon과 일치하는 B-Abl observation 후보.
 * `candidatePool`은 그 exact prod run이 정한 값이며 caller가 고르지 않는다.
 */
export interface StudyBablCandidate {
  readonly observationId: string
  readonly payloadHash: string
  readonly candidatePool: string
  readonly sourceRunComplete: boolean
  readonly withinCutoff: boolean
  readonly poolMatchesSource: boolean
}

export interface StudyThemeInput {
  readonly theme_id: string
  readonly babl_observation_id: string | null
  readonly babl_input_sha256: string | null
  readonly babl_candidate_pool: string | null
  readonly babl_missing_reason: BablMissingReason | null
}

/** 046 `bind_tli_study_origin`의 판정 순서를 그대로 재현한다. 순서가 바뀌면 DB가 payload를 거부한다. */
export const resolveStudyThemeInput = (
  themeId: string,
  candidates: readonly StudyBablCandidate[],
): StudyThemeInput => {
  const eligible = candidates.filter(
    (candidate) => candidate.sourceRunComplete && candidate.withinCutoff && candidate.poolMatchesSource,
  )

  const missing = (reason: BablMissingReason): StudyThemeInput => ({
    theme_id: themeId,
    babl_observation_id: null,
    babl_input_sha256: null,
    babl_candidate_pool: null,
    babl_missing_reason: reason,
  })

  if (eligible.length > 1) return missing('multiple_matching_observations')

  if (eligible.length === 1) {
    const [selected] = eligible
    return {
      theme_id: themeId,
      babl_observation_id: selected.observationId,
      babl_input_sha256: selected.payloadHash,
      babl_candidate_pool: selected.candidatePool,
      babl_missing_reason: null,
    }
  }

  if (candidates.some((candidate) => !candidate.sourceRunComplete)) return missing('source_run_not_complete')
  if (candidates.some((candidate) => !candidate.withinCutoff)) return missing('source_after_cutoff')
  if (candidates.some((candidate) => !candidate.poolMatchesSource)) return missing('source_pool_mismatch')
  return missing('no_matching_observation')
}

export const buildStudyOriginManifestPayload = (input: {
  readonly studyContractId: string
  readonly forecastOriginManifestId: string
  /** forecast manifest의 expected_theme_ids와 정확히 같은 집합이어야 한다. */
  readonly expectedThemeIds: readonly string[]
  readonly candidatesByThemeId: ReadonlyMap<string, readonly StudyBablCandidate[]>
}): JsonObject => ({
  study_contract_id: input.studyContractId,
  forecast_origin_manifest_id: input.forecastOriginManifestId,
  theme_inputs: input.expectedThemeIds.map(
    (themeId) => resolveStudyThemeInput(themeId, input.candidatesByThemeId.get(themeId) ?? []) satisfies JsonObject,
  ),
})
