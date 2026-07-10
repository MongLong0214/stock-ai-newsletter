import { describe, expect, it } from 'vitest'

import { canonicalJsonV1, canonicalJsonV1Sha256, sha256Hex, sha256OrderedJsonStringArray } from '@/lib/tli/canonical-json'
import { buildKeywordGroupSpec, keywordGroupSha256 } from '../collectors/collection-run-contract'
import {
  buildForecastOriginManifestPayload,
  buildStudyOriginManifestPayload,
  forecastCutoffUtc,
  resolveStudyThemeInput,
  type ForecastThemeSource,
  type StudyBablCandidate,
} from '../origins/forecast-origin-manifest'

const ORIGIN_DATE = '2026-07-06'
const STUDY_CONTRACT_ID = '99999999-9999-4999-8999-999999999999'
const FORECAST_MANIFEST_ID = '88888888-8888-4888-8888-888888888888'

const themeId = (index: number): string =>
  `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`

const newsIds = (index: number): string[] =>
  Array.from({ length: 14 }, (_, slot) => `10000000-0000-4000-8000-${String(index * 100 + slot).padStart(12, '0')}`)

const usableTheme = (index: number): ForecastThemeSource => ({
  themeId: themeId(index),
  keywordGroupSpec: buildKeywordGroupSpec({ groupName: `theme-${index}`, keywords: [`kw-${index}`] }),
  interestRun: { id: `20000000-0000-4000-8000-${String(index).padStart(12, '0')}`, responseSha256: sha256Hex(`r-${index}`) },
  newsObservationIds: newsIds(index),
})

const bablCandidate = (overrides: Partial<StudyBablCandidate> = {}): StudyBablCandidate => ({
  observationId: '30000000-0000-4000-8000-000000000001',
  payloadHash: sha256Hex('babl'),
  candidatePool: 'archetype',
  sourceRunComplete: true,
  withinCutoff: true,
  poolMatchesSource: true,
  ...overrides,
})

describe('forecast cutoff', () => {
  it('18:00 Asia/Seoul을 09:00 UTC로 고정한다', () => {
    expect(forecastCutoffUtc(ORIGIN_DATE)).toBe('2026-07-06T09:00:00.000Z')
  })
})

describe('forecast origin manifest payload', () => {
  it('cycle이 0개여도 193개 테마의 forecast child를 만든다', () => {
    const payload = buildForecastOriginManifestPayload({
      originDate: ORIGIN_DATE,
      themeSources: Array.from({ length: 193 }, (_, index) => usableTheme(index)),
    })

    expect(payload.expected_theme_count).toBe(193)
    expect(payload.expected_theme_ids).toHaveLength(193)
    expect(payload.theme_inputs).toHaveLength(193)
  })

  it('동일 입력 retry는 byte-identical payload와 같은 hash를 낸다', () => {
    const sources = Array.from({ length: 193 }, (_, index) => usableTheme(index))
    const first = buildForecastOriginManifestPayload({ originDate: ORIGIN_DATE, themeSources: sources })
    const second = buildForecastOriginManifestPayload({ originDate: ORIGIN_DATE, themeSources: [...sources].reverse() })

    expect(canonicalJsonV1(first)).toBe(canonicalJsonV1(second))
    expect(canonicalJsonV1Sha256(first)).toBe(canonicalJsonV1Sha256(second))
  })

  it('expected_theme_ids와 child key가 정렬된 상태로 정확히 같다', () => {
    const payload = buildForecastOriginManifestPayload({
      originDate: ORIGIN_DATE,
      themeSources: [usableTheme(2), usableTheme(0), usableTheme(1)],
    })

    const expectedIds = payload.expected_theme_ids as string[]
    const childIds = (payload.theme_inputs as Array<{ theme_id: string }>).map((child) => child.theme_id)

    expect(expectedIds).toEqual([themeId(0), themeId(1), themeId(2)])
    expect(childIds).toEqual(expectedIds)
  })

  it('usable child는 9개 키를 모두 갖고 news_input_sha256가 ordered hash와 같다', () => {
    const payload = buildForecastOriginManifestPayload({ originDate: ORIGIN_DATE, themeSources: [usableTheme(7)] })
    const [child] = payload.theme_inputs as Array<Record<string, unknown>>

    expect(Object.keys(child).sort()).toEqual([
      'abstain_reason',
      'forecast_interest_response_sha256',
      'forecast_interest_run_id',
      'input_status',
      'keyword_group_sha256',
      'keyword_group_spec',
      'news_input_sha256',
      'news_observation_ids',
      'theme_id',
    ])
    expect(child.input_status).toBe('usable')
    expect(child.abstain_reason).toBeNull()
    expect(child.news_input_sha256).toBe(sha256OrderedJsonStringArray(newsIds(7)))
    expect(child.keyword_group_sha256).toBe(
      keywordGroupSha256(buildKeywordGroupSpec({ groupName: 'theme-7', keywords: ['kw-7'] })),
    )
  })

  it('missing interest는 forecast child abstain이다', () => {
    const payload = buildForecastOriginManifestPayload({
      originDate: ORIGIN_DATE,
      themeSources: [{ ...usableTheme(1), interestRun: null }],
    })
    const [child] = payload.theme_inputs as Array<Record<string, unknown>>

    expect(child.input_status).toBe('abstain')
    expect(child.abstain_reason).toBe('interest_run_unavailable')
    expect(child.forecast_interest_run_id).toBeNull()
    expect(child.forecast_interest_response_sha256).toBeNull()
    expect(child.news_observation_ids).toEqual([])
    expect(child.news_input_sha256).toBeNull()
  })

  it('news observation이 14개가 아니면 abstain이다 (row 부재 = source missing)', () => {
    const thirteen = newsIds(1).slice(0, 13)
    const payload = buildForecastOriginManifestPayload({
      originDate: ORIGIN_DATE,
      themeSources: [{ ...usableTheme(1), newsObservationIds: thirteen }],
    })
    const [child] = payload.theme_inputs as Array<Record<string, unknown>>

    expect(child.input_status).toBe('abstain')
    expect(child.abstain_reason).toBe('news_observations_incomplete')
  })

  it('중복 테마와 빈 universe를 거부한다', () => {
    expect(() =>
      buildForecastOriginManifestPayload({ originDate: ORIGIN_DATE, themeSources: [usableTheme(1), usableTheme(1)] }),
    ).toThrow(/중복 테마/)
    expect(() => buildForecastOriginManifestPayload({ originDate: ORIGIN_DATE, themeSources: [] })).toThrow(/최소 1개/)
  })
})

describe('study-origin B-Abl 판정 (046 bind_tli_study_origin 순서 재현)', () => {
  it('적격 observation이 정확히 1건이면 id/hash/pool을 고정한다', () => {
    const input = resolveStudyThemeInput(themeId(1), [bablCandidate({ candidatePool: 'peer' })])

    expect(input.babl_observation_id).toBe('30000000-0000-4000-8000-000000000001')
    expect(input.babl_candidate_pool).toBe('peer')
    expect(input.babl_missing_reason).toBeNull()
  })

  it('적격 observation이 복수면 multiple_matching_observations다', () => {
    const input = resolveStudyThemeInput(themeId(1), [
      bablCandidate(),
      bablCandidate({ observationId: '30000000-0000-4000-8000-000000000002' }),
    ])
    expect(input.babl_missing_reason).toBe('multiple_matching_observations')
    expect(input.babl_observation_id).toBeNull()
  })

  it('후보가 없으면 no_matching_observation이다', () => {
    expect(resolveStudyThemeInput(themeId(1), []).babl_missing_reason).toBe('no_matching_observation')
  })

  it('source run 미완료 > cutoff 초과 > pool 불일치 순서로 판정한다', () => {
    expect(resolveStudyThemeInput(themeId(1), [bablCandidate({ sourceRunComplete: false })]).babl_missing_reason).toBe(
      'source_run_not_complete',
    )
    expect(resolveStudyThemeInput(themeId(1), [bablCandidate({ withinCutoff: false })]).babl_missing_reason).toBe(
      'source_after_cutoff',
    )
    expect(resolveStudyThemeInput(themeId(1), [bablCandidate({ poolMatchesSource: false })]).babl_missing_reason).toBe(
      'source_pool_mismatch',
    )
    // 두 결함이 동시에 있으면 046과 같이 미완료가 우선한다.
    expect(
      resolveStudyThemeInput(themeId(1), [bablCandidate({ sourceRunComplete: false, withinCutoff: false })])
        .babl_missing_reason,
    ).toBe('source_run_not_complete')
  })
})

describe('study origin manifest payload', () => {
  const expectedThemeIds = Array.from({ length: 193 }, (_, index) => themeId(index))

  it('cycle이 0개여도 193개 study child를 만들고 forecast universe 순서를 그대로 쓴다', () => {
    const payload = buildStudyOriginManifestPayload({
      studyContractId: STUDY_CONTRACT_ID,
      forecastOriginManifestId: FORECAST_MANIFEST_ID,
      expectedThemeIds,
      candidatesByThemeId: new Map([[themeId(0), [bablCandidate()]]]),
    })

    const children = payload.theme_inputs as Array<{ theme_id: string; babl_missing_reason: string | null }>
    expect(children).toHaveLength(193)
    expect(children.map((child) => child.theme_id)).toEqual(expectedThemeIds)
    expect(children[0].babl_missing_reason).toBeNull()
    // missing B-Abl은 abstain이 아니라 study child missing이다.
    expect(children[1].babl_missing_reason).toBe('no_matching_observation')
  })

  it('동일 입력 retry는 같은 canonical payload hash를 낸다', () => {
    const build = () =>
      buildStudyOriginManifestPayload({
        studyContractId: STUDY_CONTRACT_ID,
        forecastOriginManifestId: FORECAST_MANIFEST_ID,
        expectedThemeIds,
        candidatesByThemeId: new Map([[themeId(0), [bablCandidate()]]]),
      })

    expect(canonicalJsonV1Sha256(build())).toBe(canonicalJsonV1Sha256(build()))
  })

  it('child는 정확히 5개 키를 갖는다', () => {
    const payload = buildStudyOriginManifestPayload({
      studyContractId: STUDY_CONTRACT_ID,
      forecastOriginManifestId: FORECAST_MANIFEST_ID,
      expectedThemeIds: [themeId(0)],
      candidatesByThemeId: new Map(),
    })
    const [child] = payload.theme_inputs as Array<Record<string, unknown>>

    expect(Object.keys(child).sort()).toEqual([
      'babl_candidate_pool',
      'babl_input_sha256',
      'babl_missing_reason',
      'babl_observation_id',
      'theme_id',
    ])
  })
})
