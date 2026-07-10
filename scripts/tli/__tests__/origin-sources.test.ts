import { describe, expect, it } from 'vitest'

import { canonicalJsonV1, canonicalJsonV1Sha256 } from '@/lib/tli/canonical-json'
import { getKoreanTradingDateWindow } from '@/lib/tli/trading-calendar'
import { calendarDatesBetween } from '../collectors/collection-run-contract'
import { buildKeywordGroupSpec, keywordGroupSha256 } from '../collectors/collection-run-contract'
import { buildForecastOriginManifestPayload } from '../origins/forecast-origin-manifest'
import {
  newsExpectedDates,
  recordedKeywordGroupSpec,
  selectPitForecastSources,
  type PitInterestRunCandidate,
} from '../origins/origin-sources'

const MONDAY = '2026-07-13'
const THEME_A = '00000000-0000-4000-8000-000000000001'
const THEME_B = '00000000-0000-4000-8000-000000000002'
const OLD_SPEC = buildKeywordGroupSpec({ groupName: '반도체', keywords: ['HBM', '반도체'] })
const NEW_SPEC = buildKeywordGroupSpec({ groupName: '반도체', keywords: ['AI 반도체', 'HBM'] })
const INTEREST_DATES = getKoreanTradingDateWindow({
  baseDate: '2026-07-10',
  startOffset: -19,
  endOffset: 0,
})

const interestCandidate = (
  overrides: Partial<PitInterestRunCandidate> = {},
): PitInterestRunCandidate => ({
  id: '20000000-0000-4000-8000-000000000001',
  themeId: THEME_A,
  responseSha256: canonicalJsonV1Sha256({ response: 'monday' }),
  sourceMaxDate: '2026-07-10',
  collectedAt: '2026-07-13T08:50:00.000Z',
  completedAt: '2026-07-13T08:55:00.000Z',
  keywordGroupSpec: OLD_SPEC,
  keywordGroupSha256: keywordGroupSha256(OLD_SPEC),
  tradingDates: INTEREST_DATES,
  ...overrides,
})

const withNews = (sources: ReturnType<typeof selectPitForecastSources>) => sources.map((source) => ({
  ...source,
  newsObservationIds: Array.from(
    { length: 14 },
    (_, index) => `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  ),
}))

describe('Monday origin source PIT selection', () => {
  it('주말과 휴장일을 건너뛴 최근 14개 KOSPI 거래일을 news slot으로 쓴다', () => {
    // Given: 지방선거일·현충일 대체휴일과 두 번의 주말이 포함된 14달력일 구간.
    const originDate = '2026-06-15'
    const expectedTradingDates = [
      '2026-05-22',
      '2026-05-26',
      '2026-05-27',
      '2026-05-28',
      '2026-05-29',
      '2026-06-01',
      '2026-06-02',
      '2026-06-04',
      '2026-06-05',
      '2026-06-09',
      '2026-06-10',
      '2026-06-11',
      '2026-06-12',
      '2026-06-15',
    ]

    // When: 기존 달력일 방식과 origin selector의 slot을 각각 계산한다.
    const calendarDates = calendarDatesBetween('2026-06-02', originDate)
    const selectedDates = newsExpectedDates(originDate)

    // Then: 달력일 방식은 계약과 다르고 selector만 RPC의 거래일 계약과 일치해야 한다.
    expect(calendarDates).not.toEqual(expectedTradingDates)
    expect(selectedDates).toEqual(expectedTradingDates)
  })

  it('월요일 생성과 수요일 지연 backfill이 같은 canonical payload bytes와 hash를 만든다', () => {
    // Given: 월요일 cutoff 전 immutable run과 화요일 keyword 변경 뒤 수집된 run.
    const mondayRun = interestCandidate()
    const tuesdayRun = interestCandidate({
      id: '20000000-0000-4000-8000-000000000002',
      responseSha256: canonicalJsonV1Sha256({ response: 'tuesday' }),
      collectedAt: '2026-07-14T01:00:00.000Z',
      completedAt: '2026-07-14T01:05:00.000Z',
      keywordGroupSpec: NEW_SPEC,
      keywordGroupSha256: keywordGroupSha256(NEW_SPEC),
    })

    // When: 정시 실행은 당시 보이던 run, 지연 실행은 이후 run까지 보이는 상태에서 같은 origin을 만든다.
    const onTimePayload = buildForecastOriginManifestPayload({
      originDate: MONDAY,
      themeSources: withNews(selectPitForecastSources([mondayRun], MONDAY)),
    })
    const delayedPayload = buildForecastOriginManifestPayload({
      originDate: MONDAY,
      themeSources: withNews(selectPitForecastSources([mondayRun, tuesdayRun], MONDAY)),
    })

    // Then: cutoff 뒤 mutable 변화가 canonical bytes나 payload hash를 바꾸지 않는다.
    expect(canonicalJsonV1(delayedPayload)).toBe(canonicalJsonV1(onTimePayload))
    expect(canonicalJsonV1Sha256(delayedPayload)).toBe(canonicalJsonV1Sha256(onTimePayload))
  })

  it('화요일 keyword 변경 뒤에도 Monday origin은 cutoff 이하 interest run의 spec/hash를 쓴다', () => {
    // Given: 같은 테마의 cutoff 전 old spec run과 cutoff 뒤 new spec run.
    const oldRun = interestCandidate()
    const newRun = interestCandidate({
      id: '20000000-0000-4000-8000-000000000002',
      collectedAt: '2026-07-14T01:00:00.000Z',
      completedAt: '2026-07-14T01:05:00.000Z',
      keywordGroupSpec: NEW_SPEC,
      keywordGroupSha256: keywordGroupSha256(NEW_SPEC),
    })

    // When: Wednesday backfill이 Monday cutoff로 PIT universe를 파생한다.
    const [selected] = selectPitForecastSources([oldRun, newRun], MONDAY)

    // Then: 현재 keyword가 아니라 immutable old run의 exact spec/hash가 선택된다.
    expect(selected.keywordGroupSpec).toEqual(OLD_SPEC)
    expect(keywordGroupSha256(selected.keywordGroupSpec)).toBe(oldRun.keywordGroupSha256)
    expect(selected.interestRun?.id).toBe(oldRun.id)
  })

  it('expected universe는 cutoff 이하 exact 20-slot qualifying interest run이 있는 테마만 포함한다', () => {
    // Given: theme A는 cutoff 전 exact 20 slots, theme B는 cutoff 뒤에만 complete run이 있다.
    const futureOnlyTheme = interestCandidate({
      id: '20000000-0000-4000-8000-000000000003',
      themeId: THEME_B,
      collectedAt: '2026-07-14T01:00:00.000Z',
      completedAt: '2026-07-14T01:05:00.000Z',
    })

    // When: Monday cutoff 기준으로 source universe를 파생한다.
    const sources = selectPitForecastSources([interestCandidate(), futureOnlyTheme], MONDAY)

    // Then: 현재 active 목록과 무관하게 qualifying immutable run이 있던 theme A만 남는다.
    expect(sources.map((source) => source.themeId)).toEqual([THEME_A])
  })

  it('테마별 최신 exact 20-slot run을 고르고 더 최신인 19-slot run은 제외한다', () => {
    // Given: 같은 테마의 오래된 exact run, 최신 exact run, 그보다 늦지만 19-slot인 run.
    const latestExact = interestCandidate({
      id: '20000000-0000-4000-8000-000000000004',
      completedAt: '2026-07-13T08:58:00.000Z',
    })
    const newerIncomplete = interestCandidate({
      id: '20000000-0000-4000-8000-000000000005',
      completedAt: '2026-07-13T08:59:00.000Z',
      tradingDates: INTEREST_DATES.slice(1),
    })

    // When: 046과 같은 적격성·최신순으로 PIT source를 고른다.
    const [selected] = selectPitForecastSources([interestCandidate(), latestExact, newerIncomplete], MONDAY)

    // Then: incomplete run을 버리고 최신 exact run만 선택해야 한다.
    expect(selected.interestRun?.id).toBe(latestExact.id)
  })

  it('keyword group은 immutable interest request payload에서 hash가 일치하는 exact group을 복원한다', () => {
    // Given: anchor와 Monday theme group이 함께 기록된 immutable DataLab request payload.
    const requestPayload = {
      startDate: INTEREST_DATES[0],
      endDate: INTEREST_DATES[INTEREST_DATES.length - 1],
      timeUnit: 'date',
      keywordGroups: [
        { groupName: '__tli_anchor__', keywords: ['날씨'] },
        { groupName: OLD_SPEC.group_name, keywords: [...OLD_SPEC.keywords] },
      ],
    }

    // When: run에 저장된 keyword hash로 group spec을 복원한다.
    const selected = recordedKeywordGroupSpec(requestPayload, keywordGroupSha256(OLD_SPEC))

    // Then: mutable theme_keywords 조회 없이 hash가 묶은 exact Monday spec을 얻는다.
    expect(selected).toEqual(OLD_SPEC)
  })
})
