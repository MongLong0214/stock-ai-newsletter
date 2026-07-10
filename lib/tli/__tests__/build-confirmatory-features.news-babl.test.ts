import { describe, expect, it } from 'vitest'

import { sha256Hex, sha256OrderedJsonStringArray } from '@/lib/tli/canonical-json'
import {
  buildConfirmatoryFeatureVector,
  type ConfirmatoryFeatureInput,
} from '@/lib/tli/features/build-confirmatory-features'
import { getKoreanTradingDateWindow } from '@/lib/tli/trading-calendar'

const BASE_DATE = '2026-07-06'
const CUTOFF_AT = '2026-07-06T09:00:00.000Z'
const THEME_ID = '10000000-0000-4000-8000-000000000001'
const INTEREST_RUN_ID = '20000000-0000-4000-8000-000000000001'
const NEWS_RUN_ID = '30000000-0000-4000-8000-000000000001'
const BABL_OBSERVATION_ID = '50000000-0000-4000-8000-000000000001'
const BABL_PAYLOAD_HASH = sha256Hex('babl-payload')

const tradingDates = getKoreanTradingDateWindow({ baseDate: BASE_DATE, startOffset: -19, endOffset: 0 })
const newsDates = tradingDates.slice(-14)
const newsObservationIds = newsDates.map((_, index) => `news-${String(index + 1).padStart(2, '0')}`)
const newsObservations = newsDates.map((articleDate, index) => ({
  id: `news-${String(index + 1).padStart(2, '0')}`,
  collectionRunId: NEWS_RUN_ID,
  themeId: THEME_ID,
  articleDate,
  articleCount: index === 13 ? 0 : index + 1,
  queryHash: sha256Hex('keyword-group'),
  collectedAt: '2026-07-06T08:45:00.000Z',
}))

const validInput = {
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
    id: `interest-${String(index + 1).padStart(2, '0')}`,
    collectionRunId: INTEREST_RUN_ID,
    themeId: THEME_ID,
    tradingDate,
    rawValue: index + 1,
    normalized: index + 1,
    anchorScaledValue: index + 1,
  })),
  newsObservationIds,
  newsInputSha256: sha256OrderedJsonStringArray(newsObservationIds),
  newsObservations,
  newsRuns: [{
    id: NEWS_RUN_ID,
    responseSha256: sha256Hex('news-response'),
    status: 'complete',
    sourceMaxDate: BASE_DATE,
    collectedAt: '2026-07-06T08:35:00.000Z',
    completedAt: '2026-07-06T08:40:00.000Z',
  }],
  bablLock: {
    algorithmVersion: 'b-abl-v4',
    comparisonSpecVersion: 'comparison-v4-spec-v1',
    evaluationHorizonDays: 14,
    candidatePoolRule: 'source_prod_run_v1',
  },
  bablObservationId: BABL_OBSERVATION_ID,
  bablInputSha256: BABL_PAYLOAD_HASH,
  bablCandidatePool: 'archetype',
  bablMissingReason: null,
  bablObservation: {
    id: BABL_OBSERVATION_ID,
    collectionRunId: 'babl-run-1',
    themeId: THEME_ID,
    snapshotDate: BASE_DATE,
    phase: 'rising',
    algorithmVersion: 'b-abl-v4',
    comparisonSpecVersion: 'comparison-v4-spec-v1',
    evaluationHorizonDays: 14,
    candidatePool: 'archetype',
    sourcePredictionSnapshotId: 'prod-snapshot-1',
    computedAt: '2026-07-06T08:50:00.000Z',
    payloadHash: BABL_PAYLOAD_HASH,
    sourceRunStatus: 'complete',
  },
} satisfies ConfirmatoryFeatureInput

describe('confirmatory news observations', () => {
  it('keeps an explicit zero observed in the exact ordered 14-id snapshot', () => {
    // Given: fourteen ordered observations whose manifest id hash includes an explicit final zero.
    // When: the pure confirmatory vector is built.
    const result = buildConfirmatoryFeatureVector(validInput)

    // Then: zero participates in both formulas and is not represented as missing.
    expect(result.values[5]).toBeCloseTo(Math.log(1 + 63), 12)
    expect(result.values[6]).toBeCloseTo((63 - 28) / 28, 12)
    expect(result.missingFlags.slice(5, 7)).toEqual([false, false])
    expect(result.abstain).toBe(false)
  })

  const thirteenIds = newsObservationIds.slice(0, 13)
  const reversedIds = [...newsObservationIds].reverse()
  const invalidNewsCases = [
    {
      name: 'wrong observation count',
      input: {
        ...validInput,
        newsObservationIds: thirteenIds,
        newsInputSha256: sha256OrderedJsonStringArray(thirteenIds),
        newsObservations: newsObservations.slice(0, 13),
      },
    },
    {
      name: 'wrong manifest order with a matching ordered hash',
      input: {
        ...validInput,
        newsObservationIds: reversedIds,
        newsInputSha256: sha256OrderedJsonStringArray(reversedIds),
      },
    },
    {
      name: 'wrong ordered-id hash',
      input: { ...validInput, newsInputSha256: sha256Hex('wrong-news-input') },
    },
    {
      name: 'source collected after cutoff',
      input: {
        ...validInput,
        newsObservations: newsObservations.map((observation, index) => index === 13
          ? { ...observation, collectedAt: '2026-07-06T09:00:01.000Z' }
          : observation),
      },
    },
  ] satisfies readonly { readonly name: string; readonly input: ConfirmatoryFeatureInput }[]

  it.each(invalidNewsCases)('abstains for $name', ({ input }) => {
    // Given: otherwise valid primary sources with exactly one news contract violation.
    // When: the pure confirmatory vector is built.
    const result = buildConfirmatoryFeatureVector(input)

    // Then: invalid primary news provenance fails closed.
    expect(result.abstain).toBe(true)
  })

  it('distinguishes a missing news source from an observed zero', () => {
    // Given: no frozen news ids, input hash, or observation rows.
    const input = {
      ...validInput,
      newsObservationIds: [],
      newsInputSha256: null,
      newsObservations: [],
    } satisfies ConfirmatoryFeatureInput

    // When: the pure confirmatory vector is built.
    const result = buildConfirmatoryFeatureVector(input)

    // Then: missing primary news abstains instead of becoming a zero count.
    expect(result.abstain).toBe(true)
    expect(result.missingFlags.slice(5, 7)).toEqual([true, true])
  })
})

describe('confirmatory B-Abl phase signal', () => {
  it.each([
    ['rising', 1],
    ['cooling', -1],
    ['peaking', 0],
  ] as const)('maps %s to %i when the frozen tuple matches', (phase, expected) => {
    // Given: one complete observation matching the locked algorithm/spec/horizon and source pool.
    const input = {
      ...validInput,
      bablObservation: { ...validInput.bablObservation, phase },
    } satisfies ConfirmatoryFeatureInput

    // When: the pure confirmatory vector is built.
    const result = buildConfirmatoryFeatureVector(input)

    // Then: the phase maps to the preregistered numeric signal without missingness.
    expect(result.values[7]).toBe(expected)
    expect(result.missingFlags[7]).toBe(false)
    expect(result.abstain).toBe(false)
  })

  const mismatchedBablCases = [
    {
      name: 'algorithm lock',
      input: { ...validInput, bablLock: { ...validInput.bablLock, algorithmVersion: 'b-abl-v5' } },
    },
    {
      name: 'comparison spec lock',
      input: { ...validInput, bablLock: { ...validInput.bablLock, comparisonSpecVersion: 'comparison-v5' } },
    },
    {
      name: 'evaluation horizon lock',
      input: { ...validInput, bablLock: { ...validInput.bablLock, evaluationHorizonDays: 21 } },
    },
    {
      name: 'source-selected candidate pool',
      input: { ...validInput, bablCandidatePool: 'peer' },
    },
    {
      name: 'manifest payload hash',
      input: { ...validInput, bablInputSha256: sha256Hex('wrong-babl-payload') },
    },
    {
      name: 'malformed but equal input and payload hash',
      input: {
        ...validInput,
        bablInputSha256: 'malformed-hash',
        bablObservation: { ...validInput.bablObservation, payloadHash: 'malformed-hash' },
      },
    },
  ] satisfies readonly { readonly name: string; readonly input: ConfirmatoryFeatureInput }[]

  it.each(mismatchedBablCases)('uses optional missing semantics for a mismatched $name', ({ input }) => {
    // Given: valid interest/news and one B-Abl tuple or payload mismatch.
    // When: the pure confirmatory vector is built.
    const result = buildConfirmatoryFeatureVector(input)

    // Then: optional B-Abl becomes zero+missing and never causes abstention by itself.
    expect(result.values[7]).toBe(0)
    expect(result.missingFlags[7]).toBe(true)
    expect(result.abstain).toBe(false)
  })

  it('uses zero+missing without abstaining when B-Abl is absent', () => {
    // Given: the study binding explicitly records no matching optional observation.
    const input = {
      ...validInput,
      bablObservationId: null,
      bablInputSha256: null,
      bablCandidatePool: null,
      bablMissingReason: 'no_matching_observation',
      bablObservation: null,
    } satisfies ConfirmatoryFeatureInput

    // When: the pure confirmatory vector is built.
    const result = buildConfirmatoryFeatureVector(input)

    // Then: B-Abl alone does not abstain.
    expect(result.values[7]).toBe(0)
    expect(result.missingFlags[7]).toBe(true)
    expect(result.abstain).toBe(false)
  })
})
