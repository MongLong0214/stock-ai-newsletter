import { describe, expect, it } from 'vitest'

import { sha256Hex, sha256JsonStringArray } from '@/lib/tli/canonical-json'
import { getKoreanTradingDatesBetween } from '@/lib/tli/trading-calendar'
import {
  bablObservationKey,
  buildBablCollectionRun,
  buildInterestCollectionRun,
  buildKeywordGroupSpec,
  buildNewsCollectionRun,
  calendarDatesBetween,
  interestObservationKey,
  keywordGroupSha256,
  newsObservationKey,
  type InterestObservationInput,
  type ProdPhaseSnapshot,
} from '../collectors/collection-run-contract'

const THEME_A = '11111111-1111-4111-8111-111111111111'
const THEME_B = '22222222-2222-4222-8222-222222222222'
const THEME_C = '33333333-3333-4333-8333-333333333333'

const WINDOW_START = '2026-06-08'
const WINDOW_END = '2026-06-19'

const TIMESTAMPS = {
  requestedAt: '2026-06-19T08:00:00.000Z',
  collectedAt: '2026-06-19T08:00:05.000Z',
  completedAt: '2026-06-19T08:00:06.000Z',
} as const

const tradingDates = getKoreanTradingDatesBetween({ startDate: WINDOW_START, endDate: WINDOW_END })

const interestObservation = (themeId: string, tradingDate: string, rawValue: number): InterestObservationInput => ({
  theme_id: themeId,
  trading_date: tradingDate,
  source: 'naver_datalab',
  raw_value: rawValue,
  normalized: rawValue,
  anchor_scaled_value: null,
  keyword_epoch: 1,
})

const datalabRequest = (themeNames: readonly string[]) => ({
  startDate: WINDOW_START,
  endDate: WINDOW_END,
  timeUnit: 'date',
  keywordGroups: themeNames.map((name) => ({ groupName: name, keywords: [name] })),
})

const datalabResponse = (themeNames: readonly string[]) => ({
  results: themeNames.map((name) => ({
    title: name,
    keywords: [name],
    data: tradingDates.map((date, index) => ({ period: date, ratio: index + 1 })),
  })),
})

const buildTwoThemeInterestRun = (respondedThemeIds: readonly string[] = [THEME_A, THEME_B]) =>
  buildInterestCollectionRun({
    contractVersion: 'tli-interest-v1',
    requestWindowStart: WINDOW_START,
    requestWindowEnd: WINDOW_END,
    requestPayload: datalabRequest(['a', 'b']),
    responsePayload: datalabResponse(['a', 'b']),
    keywordGroupHash: sha256Hex('kw-batch'),
    requestedThemes: [
      { themeId: THEME_A, groupName: 'a' },
      { themeId: THEME_B, groupName: 'b' },
    ],
    observations: respondedThemeIds.flatMap((themeId) =>
      tradingDates.map((date, index) => interestObservation(themeId, date, index + 1)),
    ),
    respondedThemeIds,
    timestamps: TIMESTAMPS,
  })

describe('keyword group spec', () => {
  it('키워드 순서와 중복에 무관하게 동일한 hash를 낸다', () => {
    const left = buildKeywordGroupSpec({ groupName: '반도체', keywords: ['HBM', '반도체', 'HBM'] })
    const right = buildKeywordGroupSpec({ groupName: '반도체', keywords: ['반도체', 'HBM'] })
    expect(keywordGroupSha256(left)).toBe(keywordGroupSha256(right))
    expect(keywordGroupSha256(left)).toMatch(/^[0-9a-f]{64}$/)
  })

  it('group name이 다르면 hash가 달라진다', () => {
    const left = buildKeywordGroupSpec({ groupName: '반도체', keywords: ['HBM'] })
    const right = buildKeywordGroupSpec({ groupName: '2차전지', keywords: ['HBM'] })
    expect(keywordGroupSha256(left)).not.toBe(keywordGroupSha256(right))
  })
})

describe('observation key가 046 SQL 표현식과 동일하다', () => {
  it('interest key는 theme|date|source다', () => {
    expect(interestObservationKey(interestObservation(THEME_A, '2026-06-08', 1))).toBe(
      `${THEME_A}|2026-06-08|naver_datalab`,
    )
  })

  it('news key는 theme|date다', () => {
    expect(
      newsObservationKey({
        theme_id: THEME_A,
        article_date: '2026-06-08',
        article_count: 0,
        query_hash: sha256Hex('kw'),
        collected_at: TIMESTAMPS.collectedAt,
      }),
    ).toBe(`${THEME_A}|2026-06-08`)
  })

  it('B-Abl key는 theme|date|algorithm|pool|spec|horizon이다', () => {
    expect(
      bablObservationKey({
        theme_id: THEME_A,
        snapshot_date: '2026-06-08',
        phase: 'rising',
        algorithm_version: 'v4.1',
        candidate_pool: 'archetype',
        comparison_spec_version: 'comparison-v4-spec-v1',
        evaluation_horizon_days: 14,
        source_prediction_snapshot_id: THEME_B,
        computed_at: TIMESTAMPS.collectedAt,
        payload_hash: sha256Hex('p'),
      }),
    ).toBe(`${THEME_A}|2026-06-08|v4.1|archetype|comparison-v4-spec-v1|14`)
  })
})

describe('interest collection run', () => {
  it('같은 API fixture를 두 번 수집하면 동일한 request/response hash를 낸다', () => {
    const first = buildTwoThemeInterestRun()
    const second = buildTwoThemeInterestRun()

    expect(first.run.response_sha256).toBe(second.run.response_sha256)
    expect(first.run.request_sha256).toBe(second.run.request_sha256)
    expect(first.run.expected_keys_sha256).toBe(second.run.expected_keys_sha256)
    expect(first.run.status).toBe('complete')
  })

  it('complete run의 expected/observed key set과 count가 정확히 일치한다', () => {
    const { run, observations } = buildTwoThemeInterestRun()

    expect(run.expected_row_count).toBe(observations.length)
    expect(run.observed_row_count).toBe(observations.length)
    expect(run.expected_keys_sha256).toBe(sha256JsonStringArray(observations.map(interestObservationKey)))
    expect(run.failure_summary).toBeNull()
  })

  it('expected universe hash는 요청 테마 id 집합을 고정한다', () => {
    const { run } = buildTwoThemeInterestRun()
    expect(run.expected_universe_hash).toBe(sha256JsonStringArray([THEME_A, THEME_B]))
  })

  it('source max date를 관측치에서 뽑아낸다', () => {
    const { run } = buildTwoThemeInterestRun()
    expect(run.source_max_date).toBe(tradingDates[tradingDates.length - 1])
  })

  it('응답에서 누락된 테마가 있으면 partial이고 결손 slot을 expected로 선언한다', () => {
    const { run, observations } = buildTwoThemeInterestRun([THEME_A])

    expect(run.status).toBe('partial')
    expect(run.failure_summary).toEqual({ reason: 'missing_response_groups', missing_theme_ids: [THEME_B] })
    expect(run.observed_row_count).toBe(observations.length)
    expect(run.expected_row_count).toBe(tradingDates.length * 2)
    expect(run.expected_row_count).toBeGreaterThan(run.observed_row_count)
  })

  it('API 예외는 observation 0개의 failed run이 되고 response를 남기지 않는다', () => {
    const run = buildInterestCollectionRun({
      contractVersion: 'tli-interest-v1',
      requestWindowStart: WINDOW_START,
      requestWindowEnd: WINDOW_END,
      requestPayload: datalabRequest(['a', 'b']),
      responsePayload: null,
      keywordGroupHash: sha256Hex('kw-batch'),
      requestedThemes: [
        { themeId: THEME_A, groupName: 'a' },
        { themeId: THEME_B, groupName: 'b' },
      ],
      observations: [],
      respondedThemeIds: [],
      timestamps: TIMESTAMPS,
      failureSummary: { reason: 'naver_datalab_http_500' },
    }).run

    expect(run.status).toBe('failed')
    expect(run.observed_row_count).toBe(0)
    expect(run.response_payload).toBeNull()
    expect(run.response_sha256).toBeNull()
    expect(run.source_max_date).toBeNull()
  })

  it('중복 observation key를 거부한다', () => {
    expect(() =>
      buildInterestCollectionRun({
        contractVersion: 'tli-interest-v1',
        requestWindowStart: WINDOW_START,
        requestWindowEnd: WINDOW_END,
        requestPayload: datalabRequest(['a']),
        responsePayload: datalabResponse(['a']),
        keywordGroupHash: sha256Hex('kw'),
        requestedThemes: [{ themeId: THEME_A, groupName: 'a' }],
        observations: [
          interestObservation(THEME_A, tradingDates[0], 1),
          interestObservation(THEME_A, tradingDates[0], 2),
        ],
        respondedThemeIds: [THEME_A],
        timestamps: TIMESTAMPS,
      }),
    ).toThrow(/중복 observation key/)
  })

  it('거래일이 아닌 날짜의 관측치를 거부한다', () => {
    const saturday = '2026-06-13'
    expect(getKoreanTradingDatesBetween({ startDate: saturday, endDate: saturday })).toEqual([])
    expect(() =>
      buildInterestCollectionRun({
        contractVersion: 'tli-interest-v1',
        requestWindowStart: WINDOW_START,
        requestWindowEnd: WINDOW_END,
        requestPayload: datalabRequest(['a']),
        responsePayload: datalabResponse(['a']),
        keywordGroupHash: sha256Hex('kw'),
        requestedThemes: [{ themeId: THEME_A, groupName: 'a' }],
        observations: [interestObservation(THEME_A, saturday, 1)],
        respondedThemeIds: [THEME_A],
        timestamps: TIMESTAMPS,
      }),
    ).toThrow(/한국 거래일/)
  })

  it('응답에 없는 테마의 관측치를 거부한다 (expected key swap)', () => {
    expect(() =>
      buildInterestCollectionRun({
        contractVersion: 'tli-interest-v1',
        requestWindowStart: WINDOW_START,
        requestWindowEnd: WINDOW_END,
        requestPayload: datalabRequest(['a']),
        responsePayload: datalabResponse(['a']),
        keywordGroupHash: sha256Hex('kw'),
        requestedThemes: [{ themeId: THEME_A, groupName: 'a' }],
        observations: [interestObservation(THEME_C, tradingDates[0], 1)],
        respondedThemeIds: [THEME_A],
        timestamps: TIMESTAMPS,
      }),
    ).toThrow(/response에 없는 테마/)
  })

  it('DataLab batch별 request가 서로 다른 run으로 분리된다', () => {
    const batchOne = buildInterestCollectionRun({
      contractVersion: 'tli-interest-v1',
      requestWindowStart: WINDOW_START,
      requestWindowEnd: WINDOW_END,
      requestPayload: datalabRequest(['a']),
      responsePayload: datalabResponse(['a']),
      keywordGroupHash: sha256Hex('kw-a'),
      requestedThemes: [{ themeId: THEME_A, groupName: 'a' }],
      observations: tradingDates.map((date, index) => interestObservation(THEME_A, date, index + 1)),
      respondedThemeIds: [THEME_A],
      timestamps: TIMESTAMPS,
    })
    const batchTwo = buildInterestCollectionRun({
      contractVersion: 'tli-interest-v1',
      requestWindowStart: WINDOW_START,
      requestWindowEnd: WINDOW_END,
      requestPayload: datalabRequest(['b']),
      responsePayload: datalabResponse(['b']),
      keywordGroupHash: sha256Hex('kw-b'),
      requestedThemes: [{ themeId: THEME_B, groupName: 'b' }],
      observations: tradingDates.map((date, index) => interestObservation(THEME_B, date, index + 1)),
      respondedThemeIds: [THEME_B],
      timestamps: TIMESTAMPS,
    })

    expect(batchOne.run.request_sha256).not.toBe(batchTwo.run.request_sha256)
    expect(batchOne.run.expected_universe_hash).not.toBe(batchTwo.run.expected_universe_hash)
    expect(batchOne.run.keyword_group_hash).not.toBe(batchTwo.run.keyword_group_hash)
  })
})

describe('news collection run', () => {
  const NEWS_START = '2026-06-06'
  const NEWS_END = '2026-06-19'
  const keywordSha = keywordGroupSha256(buildKeywordGroupSpec({ groupName: 'a', keywords: ['HBM'] }))

  const buildRun = (articleCountByDate: ReadonlyMap<string, number>) =>
    buildNewsCollectionRun({
      contractVersion: 'tli-news-v1',
      themeId: THEME_A,
      requestWindowStart: NEWS_START,
      requestWindowEnd: NEWS_END,
      requestPayload: { query: '"HBM"', sort: 'date' },
      responsePayload: { total: 3 },
      keywordGroupSha256: keywordSha,
      articleCountByDate,
      timestamps: TIMESTAMPS,
    })

  it('046 forecast manifest와 같은 14개 달력일을 expected로 삼는다', () => {
    expect(calendarDatesBetween(NEWS_START, NEWS_END)).toHaveLength(14)
    expect(calendarDatesBetween(NEWS_START, NEWS_END).at(-1)).toBe(NEWS_END)
  })

  it('0건 날짜를 명시적 article_count=0 row로 저장한다 (row 부재 != 0건)', () => {
    const { run, observations } = buildRun(new Map([['2026-06-10', 3]]))

    expect(run.status).toBe('complete')
    expect(observations).toHaveLength(14)
    expect(observations.filter((observation) => observation.article_count === 0)).toHaveLength(13)
    expect(observations.find((o) => o.article_date === '2026-06-10')?.article_count).toBe(3)
    expect(run.expected_row_count).toBe(14)
    expect(run.observed_row_count).toBe(14)
  })

  it('모든 row의 query_hash가 테마 keyword group hash와 같다', () => {
    const { run, observations } = buildRun(new Map())
    expect(run.keyword_group_hash).toBe(keywordSha)
    expect(observations.every((observation) => observation.query_hash === keywordSha)).toBe(true)
  })

  it('수집 실패는 missing이며 0건으로 위장하지 않는다', () => {
    const { run, observations } = buildNewsCollectionRun({
      contractVersion: 'tli-news-v1',
      themeId: THEME_A,
      requestWindowStart: NEWS_START,
      requestWindowEnd: NEWS_END,
      requestPayload: { query: '"HBM"', sort: 'date' },
      responsePayload: null,
      keywordGroupSha256: keywordSha,
      articleCountByDate: new Map(),
      timestamps: TIMESTAMPS,
      failureSummary: { reason: 'naver_news_timeout' },
    })

    expect(run.status).toBe('failed')
    expect(observations).toHaveLength(0)
    expect(run.expected_row_count).toBe(14)
    expect(run.observed_row_count).toBe(0)
    expect(run.failure_summary).toEqual({ reason: 'naver_news_timeout' })
  })

  it('요청 창 밖의 날짜를 거부한다', () => {
    expect(() => buildRun(new Map([['2026-06-20', 1]]))).toThrow(/요청 창 밖/)
  })
})

describe('B-Abl phase collection run', () => {
  const STUDY = {
    babl_algorithm_version: 'v4.1',
    babl_comparison_spec_version: 'comparison-v4-spec-v1',
    babl_evaluation_horizon_days: 14,
  } as const

  const snapshot = (overrides: Partial<ProdPhaseSnapshot> = {}): ProdPhaseSnapshot => ({
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    theme_id: THEME_A,
    snapshot_date: '2026-06-19',
    phase: 'rising',
    algorithm_version: 'v4.1',
    candidate_pool: 'archetype',
    comparison_spec_version: 'comparison-v4-spec-v1',
    evaluation_horizon_days: 14,
    created_at: '2026-06-19T07:00:00.000Z',
    ...overrides,
  })

  const buildRun = (prodSnapshots: readonly ProdPhaseSnapshot[]) =>
    buildBablCollectionRun({
      contractVersion: 'tli-babl-v1',
      snapshotDate: '2026-06-19',
      requestPayload: { source: 'prediction_snapshots_v2', run_type: 'prod' },
      studyContract: STUDY,
      prodSnapshots,
      timestamps: TIMESTAMPS,
    })

  it('study contract별 exact 1건만 저장하고 pool은 source prod run 값을 그대로 쓴다', () => {
    const { run, observations } = buildRun([snapshot({ candidate_pool: 'peer' })])

    expect(run.status).toBe('complete')
    expect(observations).toHaveLength(1)
    expect(observations[0].candidate_pool).toBe('peer')
    expect(observations[0].source_prediction_snapshot_id).toBe(snapshot().id)
    expect(observations[0].computed_at).toBe(snapshot().created_at)
    expect(observations[0].payload_hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('study lock과 다른 algorithm/spec/horizon 스냅샷을 제외한다', () => {
    const { observations } = buildRun([
      snapshot(),
      snapshot({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', theme_id: THEME_B, algorithm_version: 'v4.2' }),
      snapshot({ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', theme_id: THEME_C, evaluation_horizon_days: 7 }),
    ])

    expect(observations.map((observation) => observation.theme_id)).toEqual([THEME_A])
  })

  it('runtime/OOS metric이 아니라 study lock으로만 계약을 고른다', () => {
    // 같은 테마에 pool만 다른 두 prod 스냅샷이 있으면 둘 다 보존한다.
    // 어느 쪽이 "좋은지" 고르는 순간 outcome-selected contract가 되므로 collector는 판단하지 않는다.
    const { observations } = buildRun([
      snapshot({ candidate_pool: 'archetype' }),
      snapshot({ id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', candidate_pool: 'peer' }),
    ])

    expect(observations).toHaveLength(2)
    expect(observations.map((observation) => observation.candidate_pool).sort()).toEqual(['archetype', 'peer'])
  })

  it('일치하는 prod 스냅샷이 없으면 observation 0개의 complete run이다', () => {
    const { run, observations } = buildRun([])
    expect(run.status).toBe('complete')
    expect(observations).toHaveLength(0)
    expect(run.source_max_date).toBeNull()
  })
})
