import { describe, expect, it } from 'vitest'

import { sha256Hex, sha256OrderedJsonStringArray } from '@/lib/tli/canonical-json'
import {
  buildConfirmatoryFeatureVector,
  type ConfirmatoryFeatureInput,
} from '@/lib/tli/features/build-confirmatory-features'
import { addKoreanTradingDays, getKoreanTradingDateWindow } from '@/lib/tli/trading-calendar'

const BASE_DATE = '2026-07-06'
const CUTOFF_AT = '2026-07-06T09:00:00.000Z'
const THEME_ID = '10000000-0000-4000-8000-000000000001'
const INTEREST_RUN_ID = '20000000-0000-4000-8000-000000000001'
const NEWS_RUN_ID_A = '30000000-0000-4000-8000-000000000001'
const NEWS_RUN_ID_B = '30000000-0000-4000-8000-000000000002'
const previousTradingDate = addKoreanTradingDays(BASE_DATE, -1)
const twoTradingDaysBefore = addKoreanTradingDays(BASE_DATE, -2)
const tradingDates = getKoreanTradingDateWindow({ baseDate: BASE_DATE, startOffset: -19, endOffset: 0 })
const newsDates = tradingDates.slice(-14)
const newsObservationIds = newsDates.map((_, index) => `news-${String(index + 1).padStart(2, '0')}`)

const input = {
  studyOriginManifestId: 'study-origin-1',
  studyOriginManifestSha256: sha256Hex('study-origin'),
  studyContractId: 'study-contract-1',
  studyContractSha256: sha256Hex('study-contract'),
  featureContractVersion: 'tli-attention-v2-f1',
  featureContractSha256: sha256Hex('feature-contract'),
  forecastOriginManifestId: 'forecast-origin-1',
  forecastOriginManifestSha256: sha256Hex('forecast-origin'),
  themeId: THEME_ID,
  baseDate: BASE_DATE,
  cutoffAt: CUTOFF_AT,
  interestRun: {
    id: INTEREST_RUN_ID,
    responseSha256: sha256Hex('interest-response'),
    status: 'complete',
    sourceMaxDate: BASE_DATE,
    completedAt: '2026-07-06T08:30:00.000Z',
  },
  interestObservations: tradingDates.map((tradingDate, index) => ({
    id: `interest-${index + 1}`,
    collectionRunId: INTEREST_RUN_ID,
    themeId: THEME_ID,
    tradingDate,
    rawValue: index + 1,
    normalized: index + 1,
    anchorScaledValue: index + 1,
  })),
  newsObservationIds,
  newsInputSha256: sha256OrderedJsonStringArray(newsObservationIds),
  newsObservations: newsDates.map((articleDate, index) => ({
    id: `news-${String(index + 1).padStart(2, '0')}`,
    collectionRunId: index < 7 ? NEWS_RUN_ID_B : NEWS_RUN_ID_A,
    themeId: THEME_ID,
    articleDate,
    articleCount: index,
    queryHash: sha256Hex('query'),
    collectedAt: '2026-07-06T08:45:00.000Z',
  })),
  newsRuns: [],
  bablLock: {
    algorithmVersion: 'b-abl-v4',
    comparisonSpecVersion: 'comparison-v4-spec-v1',
    evaluationHorizonDays: 14,
    candidatePoolRule: 'source_prod_run_v1',
  },
  bablObservationId: null,
  bablInputSha256: null,
  bablCandidatePool: null,
  bablMissingReason: 'no_matching_observation',
  bablObservation: null,
} satisfies ConfirmatoryFeatureInput

const completeNewsRunA = {
  id: NEWS_RUN_ID_A,
  responseSha256: sha256Hex('news-response-a'),
  status: 'complete' as const,
  sourceMaxDate: previousTradingDate,
  collectedAt: '2026-07-06T08:35:00.000Z',
  completedAt: '2026-07-06T08:40:00.000Z',
}
const completeNewsRunB = {
  id: NEWS_RUN_ID_B,
  responseSha256: sha256Hex('news-response-b'),
  status: 'complete' as const,
  sourceMaxDate: twoTradingDaysBefore,
  collectedAt: '2026-07-06T08:25:00.000Z',
  completedAt: '2026-07-06T08:30:00.000Z',
}
const completeNewsRuns = [completeNewsRunA, completeNewsRunB]

describe('confirmatory news run metadata', () => {
  it('uses the maximum source date across selected referenced runs for news age', () => {
    const givenInput = { ...input, newsRuns: completeNewsRuns }
    const actual = buildConfirmatoryFeatureVector(givenInput)

    expect([actual.values[9], actual.provenance.newsSourceMaxDate]).toEqual([1, previousTradingDate])
  })

  it('aligns response hashes to referenced run ID order in provenance', () => {
    const givenInput = { ...input, newsRuns: completeNewsRuns }
    const actual = buildConfirmatoryFeatureVector(givenInput)

    expect(actual.provenance).toMatchObject({
      newsRunIds: [NEWS_RUN_ID_A, NEWS_RUN_ID_B],
      newsRunResponseSha256s: [completeNewsRunA.responseSha256, completeNewsRunB.responseSha256],
    })
  })

  const invalidNewsRunCases = [
    { name: 'metadata missing', newsRuns: [completeNewsRunA] },
    {
      name: 'run partial',
      newsRuns: [completeNewsRunA, { ...completeNewsRunB, status: 'partial' as const }],
    },
    {
      name: 'run completed after cutoff',
      newsRuns: [completeNewsRunA, { ...completeNewsRunB, completedAt: '2026-07-06T09:00:01.000Z' }],
    },
    {
      name: 'run collected after cutoff',
      newsRuns: [completeNewsRunA, { ...completeNewsRunB, collectedAt: '2026-07-06T09:00:01.000Z' }],
    },
    {
      name: 'source max date after base date',
      newsRuns: [
        completeNewsRunA,
        { ...completeNewsRunB, sourceMaxDate: addKoreanTradingDays(BASE_DATE, 1) },
      ],
    },
    {
      name: 'run collectedAt impossible date',
      newsRuns: [completeNewsRunA, { ...completeNewsRunB, collectedAt: '2026-02-30T00:00:00.000Z' }],
    },
    {
      name: 'run completedAt impossible date',
      newsRuns: [completeNewsRunA, { ...completeNewsRunB, completedAt: '2026-02-30T00:00:00.000Z' }],
    },
    {
      name: 'run collectedAt without timezone',
      newsRuns: [completeNewsRunA, { ...completeNewsRunB, collectedAt: '2026-07-06T08:25:00.000' }],
    },
    {
      name: 'run completedAt without timezone',
      newsRuns: [completeNewsRunA, { ...completeNewsRunB, completedAt: '2026-07-06T08:30:00.000' }],
    },
    {
      name: 'response SHA-256 outside lowercase 64-hex',
      newsRuns: [completeNewsRunA, { ...completeNewsRunB, responseSha256: 'A'.repeat(64) }],
    },
  ]

  it.each(invalidNewsRunCases)('abstains with news_source_invalid when referenced $name', ({ newsRuns }) => {
    const givenInput = { ...input, newsRuns }
    const actual = buildConfirmatoryFeatureVector(givenInput)

    expect(actual).toMatchObject({ abstain: true, abstainReasons: expect.arrayContaining(['news_source_invalid']) })
  })

  it.each([
    ['impossible date', '2026-02-30T00:00:00.000Z'],
    ['missing timezone', '2026-07-06T08:45:00.000'],
  ])('abstains with news_source_invalid when a referenced row has an %s timestamp', (_, collectedAt) => {
    const givenInput = {
      ...input,
      newsRuns: completeNewsRuns,
      newsObservations: input.newsObservations.map((row, index) => index === 0
        ? { ...row, collectedAt }
        : row),
    }
    const actual = buildConfirmatoryFeatureVector(givenInput)

    expect(actual).toMatchObject({ abstain: true, abstainReasons: expect.arrayContaining(['news_source_invalid']) })
  })

  it('accepts canonical millisecond UTC timestamps exactly at the cutoff boundary', () => {
    const givenInput = {
      ...input,
      newsRuns: completeNewsRuns.map((run) => ({
        ...run,
        collectedAt: CUTOFF_AT,
        completedAt: CUTOFF_AT,
      })),
      newsObservations: input.newsObservations.map((row) => ({ ...row, collectedAt: CUTOFF_AT })),
    }
    const actual = buildConfirmatoryFeatureVector(givenInput)

    expect(actual).toMatchObject({ abstain: false, abstainReasons: [] })
  })

  it('keeps vector and snapshot hash invariant under an unreferenced noisy run', () => {
    const givenInput = { ...input, newsRuns: completeNewsRuns }
    const givenNoisyInput = {
      ...givenInput,
      newsRuns: [...completeNewsRuns, {
        id: 'unreferenced-news-run',
        responseSha256: sha256Hex('unreferenced-response'),
        status: 'failed' as const,
        sourceMaxDate: '2099-12-31',
        collectedAt: '2099-12-31T23:59:58.000Z',
        completedAt: '2099-12-31T23:59:59.000Z',
      }],
    }
    const baseline = buildConfirmatoryFeatureVector(givenInput)
    const withNoise = buildConfirmatoryFeatureVector(givenNoisyInput)

    expect([withNoise.values, withNoise.featureSnapshotSha256]).toEqual([baseline.values, baseline.featureSnapshotSha256])
  })
})
