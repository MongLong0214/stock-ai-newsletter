import { describe, expect, it, vi } from 'vitest'

import { canonicalJsonV1Sha256 } from '@/lib/tli/canonical-json'
import type { AttentionStudyContract } from '../collectors/babl-phase-snapshot'
import { keywordGroupSha256, resolveThemeKeywordGroup } from '../collectors/collection-run-contract'
import {
  isAfterForecastCutoff,
  runMondayOrigins,
  selectBindableStudies,
  type MondayOriginDeps,
} from '../origins/run-monday-origins'
import { forecastCutoffUtc, type ForecastThemeSource, type StudyBablCandidate } from '../origins/forecast-origin-manifest'
import type { OriginTheme } from '../origins/origin-sources'

// 2026-07-06 == 거래 가능한 월요일
const MONDAY = '2026-07-06'
const AFTER_CUTOFF = new Date('2026-07-06T09:00:00.000Z')

const themeId = (index: number): string => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`

const themes = (count: number): OriginTheme[] =>
  Array.from({ length: count }, (_, index) => ({ id: themeId(index), name: `theme-${index}`, naverKeywords: [`kw-${index}`] }))

const newsIds = (index: number): string[] =>
  Array.from({ length: 14 }, (_, slot) => `10000000-0000-4000-8000-${String(index * 100 + slot).padStart(12, '0')}`)

const usableSources = (originThemes: readonly OriginTheme[]): ForecastThemeSource[] =>
  originThemes.map((theme, index) => ({
    themeId: theme.id,
    keywordGroupSpec: resolveThemeKeywordGroup(theme),
    interestRun: { id: `20000000-0000-4000-8000-${String(index).padStart(12, '0')}`, responseSha256: canonicalJsonV1Sha256({ r: index }) },
    newsObservationIds: newsIds(index),
  }))

const study: AttentionStudyContract = {
  id: '99999999-9999-4999-8999-999999999999',
  locked_at: '2026-07-01T00:00:00.000Z',
  first_origin_date: '2026-07-06',
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

const baseDeps = (overrides: Partial<MondayOriginDeps> = {}): MondayOriginDeps => {
  const originThemes = themes(193)
  return {
    now: AFTER_CUTOFF,
    loadThemes: async () => originThemes,
    loadThemeSources: async () => usableSources(originThemes),
    loadStudies: async () => [study],
    loadBablCandidates: async () => new Map([[themeId(0), [bablCandidate()]]]),
    createForecastManifest: vi.fn(async () => 'ffffffff-ffff-4fff-8fff-ffffffffffff'),
    bindStudyOrigin: vi.fn(async () => 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'),
    ...overrides,
  }
}

describe('isAfterForecastCutoff', () => {
  it('18:00 KST(09:00 UTC) 이후에만 true다', () => {
    expect(isAfterForecastCutoff(MONDAY, new Date('2026-07-06T08:59:59.000Z'))).toBe(false)
    expect(isAfterForecastCutoff(MONDAY, new Date(forecastCutoffUtc(MONDAY)))).toBe(true)
  })
})

describe('selectBindableStudies', () => {
  it('lock이 cutoff보다 이르고 first origin 이후인 study만 고른다', () => {
    expect(selectBindableStudies([study], MONDAY)).toHaveLength(1)
    expect(selectBindableStudies([{ ...study, first_origin_date: '2026-07-13' }], MONDAY)).toHaveLength(0)
    expect(selectBindableStudies([{ ...study, locked_at: '2026-07-06T09:00:01.000Z' }], MONDAY)).toHaveLength(0)
  })
})

describe('runMondayOrigins', () => {
  it('거래 가능한 월요일이 아니면 origin을 만들지 않는다', async () => {
    const deps = baseDeps()
    const report = await runMondayOrigins('2026-07-07', deps)
    expect(report.skippedReason).toBe('not_a_trading_monday')
    expect(deps.createForecastManifest).not.toHaveBeenCalled()
  })

  it('cutoff 이전에는 manifest를 만들지 않는다', async () => {
    const deps = baseDeps({ now: new Date('2026-07-06T08:00:00.000Z') })
    const report = await runMondayOrigins(MONDAY, deps)
    expect(report.skippedReason).toBe('before_cutoff')
    expect(deps.createForecastManifest).not.toHaveBeenCalled()
  })

  it('cycle 0개여도 forecast manifest 1개+child 193, study-origin 1개+child 193을 만든다', async () => {
    const deps = baseDeps()
    const report = await runMondayOrigins(MONDAY, deps)

    expect(report.skippedReason).toBeNull()
    expect(report.forecastManifestId).toBe('ffffffff-ffff-4fff-8fff-ffffffffffff')
    expect(report.forecastChildCount).toBe(193)
    expect(report.usableChildCount).toBe(193)
    expect(report.studyOriginManifestIds).toHaveLength(1)

    const forecastPayload = (deps.createForecastManifest as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>
    expect((forecastPayload.theme_inputs as unknown[]).length).toBe(193)

    const studyPayload = (deps.bindStudyOrigin as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>
    expect((studyPayload.theme_inputs as unknown[]).length).toBe(193)
  })

  it('동일 retry는 같은 forecast payload hash를 만든다 (046 RPC가 같은 id를 반환)', async () => {
    const first = baseDeps()
    const second = baseDeps()
    await runMondayOrigins(MONDAY, first)
    await runMondayOrigins(MONDAY, second)

    const firstPayload = (first.createForecastManifest as ReturnType<typeof vi.fn>).mock.calls[0][0]
    const secondPayload = (second.createForecastManifest as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(canonicalJsonV1Sha256(firstPayload)).toBe(canonicalJsonV1Sha256(secondPayload))
  })

  it('missing interest는 forecast child abstain이 된다', async () => {
    const originThemes = themes(2)
    const deps = baseDeps({
      loadThemes: async () => originThemes,
      loadThemeSources: async () => [
        { ...usableSources(originThemes)[0] },
        { ...usableSources(originThemes)[1], interestRun: null },
      ],
    })

    const report = await runMondayOrigins(MONDAY, deps)
    expect(report.forecastChildCount).toBe(2)
    expect(report.usableChildCount).toBe(1)

    const payload = (deps.createForecastManifest as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>
    const children = payload.theme_inputs as Array<{ input_status: string; abstain_reason: string | null }>
    expect(children.filter((c) => c.input_status === 'abstain')).toHaveLength(1)
    expect(children.find((c) => c.input_status === 'abstain')?.abstain_reason).toBe('interest_run_unavailable')
  })

  it('missing B-Abl은 study child missing이 된다 (abstain 아님)', async () => {
    const originThemes = themes(2)
    const deps = baseDeps({
      loadThemes: async () => originThemes,
      loadThemeSources: async () => usableSources(originThemes),
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

    expect(report.forecastManifestId).not.toBeNull()
    expect(report.studyOriginManifestIds).toHaveLength(0)
    expect(deps.bindStudyOrigin).not.toHaveBeenCalled()
  })

  it('forecast child의 keyword_group_sha256가 테마 keyword group hash와 같다', async () => {
    const originThemes = themes(1)
    const deps = baseDeps({
      loadThemes: async () => originThemes,
      loadThemeSources: async () => usableSources(originThemes),
    })
    await runMondayOrigins(MONDAY, deps)

    const payload = (deps.createForecastManifest as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>
    const [child] = payload.theme_inputs as Array<{ keyword_group_sha256: string }>
    expect(child.keyword_group_sha256).toBe(keywordGroupSha256(resolveThemeKeywordGroup(originThemes[0])))
  })
})
