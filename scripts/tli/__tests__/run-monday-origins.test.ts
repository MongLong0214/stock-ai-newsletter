import { describe, expect, it, vi } from 'vitest'

vi.mock('@/scripts/tli/shared/supabase-admin', () => ({ supabaseAdmin: {} }))

import { canonicalJsonV1, canonicalJsonV1Sha256 } from '@/lib/tli/canonical-json'
import type { AttentionStudyContract } from '../collectors/babl-phase-snapshot'
import { buildKeywordGroupSpec, keywordGroupSha256 } from '../collectors/collection-run-contract'
import {
  MONDAY_ORIGIN_START_DATE,
  isAfterForecastCutoff,
  runMondayOrigins,
  selectBindableStudies,
  type ExistingForecastOrigin,
  type ExistingStudyBinding,
  type MondayOriginDeps,
} from '../origins/run-monday-origins'
import { forecastCutoffUtc, type ForecastThemeSource, type StudyBablCandidate } from '../origins/forecast-origin-manifest'

const MONDAY = MONDAY_ORIGIN_START_DATE
const SECOND_MONDAY = '2026-07-20'
const AFTER_CUTOFF = new Date('2026-07-13T09:30:00.000Z')
const FORECAST_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
const STUDY_MANIFEST_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'

const themeId = (index: number): string => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`

const newsIds = (index: number): string[] =>
  Array.from({ length: 14 }, (_, slot) => `10000000-0000-4000-8000-${String(index * 100 + slot).padStart(12, '0')}`)

const usableSources = (count: number): ForecastThemeSource[] =>
  Array.from({ length: count }, (_, index) => ({
    themeId: themeId(index),
    keywordGroupSpec: buildKeywordGroupSpec({ groupName: `theme-${index}`, keywords: [`kw-${index}`] }),
    interestRun: { id: `20000000-0000-4000-8000-${String(index).padStart(12, '0')}`, responseSha256: canonicalJsonV1Sha256({ r: index }) },
    newsObservationIds: newsIds(index),
  }))

const study: AttentionStudyContract = {
  id: '99999999-9999-4999-8999-999999999999',
  locked_at: '2026-07-01T00:00:00.000Z',
  first_origin_date: MONDAY_ORIGIN_START_DATE,
  babl_algorithm_version: 'v4.1',
  babl_comparison_spec_version: 'comparison-v4-spec-v1',
  babl_evaluation_horizon_days: 14,
}

const bablCandidate = (): StudyBablCandidate => ({
  observationId: '30000000-0000-4000-8000-000000000001',
  payloadHash: canonicalJsonV1Sha256({ b: 1 }),
  candidatePool: 'archetype',
  sourceRunComplete: true,
  withinCutoff: true,
  poolMatchesSource: true,
})

const existingForecast = (
  expectedThemeIds: readonly string[] = [themeId(0), themeId(1)],
): ExistingForecastOrigin => ({
  id: FORECAST_ID,
  originDate: MONDAY,
  expectedThemeIds,
  usableChildCount: expectedThemeIds.length,
  rosterThemeCount: expectedThemeIds.length,
})

const existingBinding = (): ExistingStudyBinding => ({
  forecastManifestId: FORECAST_ID,
  studyContractId: study.id,
})

const baseDeps = (overrides: Partial<MondayOriginDeps> = {}): MondayOriginDeps => {
  const sources = usableSources(193)
  return {
    now: AFTER_CUTOFF,
    loadExistingForecastOrigins: async () => [],
    loadExistingStudyBindings: async () => [],
    loadThemeSources: vi.fn(async () => sources),
    loadStudies: async () => [study],
    loadBablCandidates: vi.fn(async () => new Map([[themeId(0), [bablCandidate()]]])),
    createForecastManifest: vi.fn(async () => FORECAST_ID),
    bindStudyOrigin: vi.fn(async () => STUDY_MANIFEST_ID),
    ...overrides,
  }
}

describe('isAfterForecastCutoff', () => {
  it('18:00 KST(09:00 UTC) 이후에만 true다', () => {
    expect(isAfterForecastCutoff(MONDAY, new Date('2026-07-13T08:59:59.000Z'))).toBe(false)
    expect(isAfterForecastCutoff(MONDAY, new Date(forecastCutoffUtc(MONDAY)))).toBe(true)
  })
})

describe('selectBindableStudies', () => {
  it('lock이 cutoff보다 이르고 first origin 이후인 study만 고른다', () => {
    expect(selectBindableStudies([study], MONDAY)).toHaveLength(1)
    expect(selectBindableStudies([{ ...study, first_origin_date: SECOND_MONDAY }], MONDAY)).toHaveLength(0)
    expect(selectBindableStudies([{ ...study, locked_at: '2026-07-13T09:00:01.000Z' }], MONDAY)).toHaveLength(0)
  })
})

describe('runMondayOrigins', () => {
  it('화요일 실행은 cutoff가 지난 전날 월요일 manifest를 만든다', async () => {
    const deps = baseDeps()
    const report = await runMondayOrigins('2026-07-14', {
      ...deps,
      now: new Date('2026-07-14T00:00:00.000Z'),
    })

    expect(report.skippedReason).toBeNull()
    expect(report.origins.map((origin) => origin.originDate)).toEqual([MONDAY])
    expect(deps.createForecastManifest).toHaveBeenCalledOnce()
  })

  it('월요일 16:30 KST에는 당일 manifest 생성을 보류한다', async () => {
    const deps = baseDeps({ now: new Date('2026-07-13T07:30:00.000Z') })
    const report = await runMondayOrigins(MONDAY, deps)

    expect(report.skippedReason).toBe('before_cutoff')
    expect(deps.createForecastManifest).not.toHaveBeenCalled()
  })

  it('월요일 18:30 KST에는 당일 manifest를 만든다', async () => {
    const deps = baseDeps({ now: new Date('2026-07-13T09:30:00.000Z') })
    const report = await runMondayOrigins(MONDAY, deps)

    expect(report.skippedReason).toBeNull()
    expect(report.origins.map((origin) => origin.originDate)).toEqual([MONDAY])
    expect(deps.createForecastManifest).toHaveBeenCalledOnce()
    expect(deps.loadThemeSources).toHaveBeenCalledWith({ originDate: MONDAY })
  })

  it('2주치가 밀리면 오래된 월요일부터 각각 자기 cutoff로 backfill한다', async () => {
    const deps = baseDeps({ now: new Date('2026-07-21T00:00:00.000Z') })
    const report = await runMondayOrigins('2026-07-21', deps)

    expect(report.origins.map((origin) => origin.originDate)).toEqual([MONDAY, SECOND_MONDAY])
    const payloads = (deps.createForecastManifest as ReturnType<typeof vi.fn>).mock.calls
      .map(([payload]) => payload as Record<string, unknown>)
    expect(payloads.map((payload) => payload.origin_date)).toEqual([MONDAY, SECOND_MONDAY])
    expect(payloads.map((payload) => payload.forecast_cutoff)).toEqual([
      forecastCutoffUtc(MONDAY),
      forecastCutoffUtc(SECOND_MONDAY),
    ])
  })

  it('이미 forecast와 study bind가 있으면 source/B-Abl/RPC를 재호출하지 않는다', async () => {
    const deps = baseDeps({
      loadExistingForecastOrigins: async () => [existingForecast()],
      loadExistingStudyBindings: async () => [existingBinding()],
    })
    const report = await runMondayOrigins('2026-07-14', deps)

    expect(report.skippedReason).toBe('up_to_date')
    expect(report.origins).toEqual([])
    expect(deps.loadThemeSources).not.toHaveBeenCalled()
    expect(deps.loadBablCandidates).not.toHaveBeenCalled()
    expect(deps.createForecastManifest).not.toHaveBeenCalled()
    expect(deps.bindStudyOrigin).not.toHaveBeenCalled()
  })

  it('as-of 날짜가 미래여도 cutoff 미도달 월요일은 생성하지 않는다', async () => {
    const deps = baseDeps({
      now: new Date('2026-07-20T08:59:59.000Z'),
      loadExistingForecastOrigins: async () => [existingForecast()],
      loadExistingStudyBindings: async () => [existingBinding()],
    })
    const report = await runMondayOrigins(SECOND_MONDAY, deps)

    expect(report.skippedReason).toBe('before_cutoff')
    expect(report.origins).toEqual([])
    expect(deps.createForecastManifest).not.toHaveBeenCalled()
  })

  it('cycle 0개여도 forecast manifest 1개+child 193, study-origin 1개+child 193을 만든다', async () => {
    const deps = baseDeps()
    const report = await runMondayOrigins(MONDAY, deps)
    const [origin] = report.origins

    expect(report.skippedReason).toBeNull()
    expect(origin.forecastManifestId).toBe('ffffffff-ffff-4fff-8fff-ffffffffffff')
    expect(origin.forecastChildCount).toBe(193)
    expect(origin.usableChildCount).toBe(193)
    expect(origin.abstainChildCount).toBe(0)
    expect(origin.rosterThemeCount).toBe(193)
    expect(origin.studyOriginManifestIds).toHaveLength(1)

    const forecastPayload = (deps.createForecastManifest as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>
    expect((forecastPayload.theme_inputs as unknown[]).length).toBe(193)

    const studyPayload = (deps.bindStudyOrigin as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>
    expect((studyPayload.theme_inputs as unknown[]).length).toBe(193)
  })

  it('월요일 18:30 생성과 수요일 backfill은 동일 forecast payload bytes/hash를 만든다', async () => {
    const first = baseDeps({ now: new Date('2026-07-13T09:30:00.000Z') })
    const second = baseDeps({ now: new Date('2026-07-15T00:00:00.000Z') })
    await runMondayOrigins(MONDAY, first)
    await runMondayOrigins('2026-07-15', second)

    const firstPayload = (first.createForecastManifest as ReturnType<typeof vi.fn>).mock.calls[0][0]
    const secondPayload = (second.createForecastManifest as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(canonicalJsonV1(firstPayload)).toBe(canonicalJsonV1(secondPayload))
    expect(canonicalJsonV1Sha256(firstPayload)).toBe(canonicalJsonV1Sha256(secondPayload))
  })

  it('missing interest는 forecast child abstain이 된다', async () => {
    const sources = usableSources(2)
    const deps = baseDeps({
      loadThemeSources: async () => [
        sources[0],
        { ...sources[1], interestRun: null },
      ],
    })

    const report = await runMondayOrigins(MONDAY, deps)
    expect(report.origins[0].forecastChildCount).toBe(2)
    expect(report.origins[0].usableChildCount).toBe(1)
    expect(report.origins[0].abstainChildCount).toBe(1)
    expect(report.origins[0].rosterThemeCount).toBe(2)

    const payload = (deps.createForecastManifest as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>
    const children = payload.theme_inputs as Array<{ input_status: string; abstain_reason: string | null }>
    expect(children.filter((c) => c.input_status === 'abstain')).toHaveLength(1)
    expect(children.find((c) => c.input_status === 'abstain')?.abstain_reason).toBe('interest_run_unavailable')
  })

  it('missing B-Abl은 study child missing이 된다 (abstain 아님)', async () => {
    const deps = baseDeps({
      loadThemeSources: async () => usableSources(2),
      loadBablCandidates: async () => new Map([[themeId(0), [bablCandidate()]]]),
    })

    await runMondayOrigins(MONDAY, deps)
    const payload = (deps.bindStudyOrigin as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>
    const children = payload.theme_inputs as Array<{ babl_missing_reason: string | null }>
    expect(children[0].babl_missing_reason).toBeNull()
    expect(children[1].babl_missing_reason).toBe('no_matching_observation')
  })

  it('bind 가능한 study가 없으면 forecast manifest만 축적한다', async () => {
    const deps = baseDeps({ loadStudies: async () => [] })
    const report = await runMondayOrigins(MONDAY, deps)

    expect(report.origins[0].forecastManifestId).not.toBeNull()
    expect(report.origins[0].studyOriginManifestIds).toHaveLength(0)
    expect(deps.bindStudyOrigin).not.toHaveBeenCalled()
  })

  it('forecast RPC child는 exact keyword canonical bytes를 포함한 10-key 계약이다', async () => {
    const [source] = usableSources(1)
    const deps = baseDeps({ loadThemeSources: async () => [source] })
    await runMondayOrigins(MONDAY, deps)

    const payload = (deps.createForecastManifest as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>
    const [child] = payload.theme_inputs as Array<Record<string, unknown>>
    expect(Object.keys(child).sort()).toEqual([
      'theme_id', 'keyword_group_spec', 'keyword_group_canonical_json', 'keyword_group_sha256',
      'forecast_interest_run_id', 'forecast_interest_response_sha256', 'news_observation_ids',
      'news_input_sha256', 'input_status', 'abstain_reason',
    ].sort())
    expect(child.keyword_group_canonical_json).toBe(canonicalJsonV1(child.keyword_group_spec))
    expect(child.keyword_group_sha256).toBe(keywordGroupSha256(source.keywordGroupSpec))
    expect(canonicalJsonV1Sha256(child.keyword_group_spec)).toBe(child.keyword_group_sha256)
  })

  it('forecast-only 상태는 저장된 universe로 누락된 study bind만 복구한다', async () => {
    const frozenThemeIds = [themeId(0), themeId(1)]
    const deps = baseDeps({
      loadExistingForecastOrigins: async () => [existingForecast(frozenThemeIds)],
      loadExistingStudyBindings: async () => [],
    })

    const report = await runMondayOrigins('2026-07-14', deps)

    expect(report.origins[0].forecastManifestId).toBe(FORECAST_ID)
    expect(report.origins[0].studyOriginManifestIds).toEqual([STUDY_MANIFEST_ID])
    expect(deps.loadThemeSources).not.toHaveBeenCalled()
    expect(deps.createForecastManifest).not.toHaveBeenCalled()
    expect(deps.loadBablCandidates).toHaveBeenCalledWith({ originDate: MONDAY, themeIds: frozenThemeIds, study })
    expect(deps.bindStudyOrigin).toHaveBeenCalledOnce()

    const payload = (deps.bindStudyOrigin as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>
    expect((payload.theme_inputs as Array<{ theme_id: string }>).map((child) => child.theme_id)).toEqual(frozenThemeIds)
  })
})
