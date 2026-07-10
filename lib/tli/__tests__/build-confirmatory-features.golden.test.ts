import { describe, expect, it } from 'vitest'

import { canonicalJsonV1Sha256, sha256OrderedJsonStringArray } from '@/lib/tli/canonical-json'
import {
  CONFIRMATORY_FEATURE_NAMES,
  buildConfirmatoryFeatureVector,
  type ConfirmatoryFeatureInput,
} from '@/lib/tli/features/build-confirmatory-features'
import { getKoreanTradingDateWindow } from '@/lib/tli/trading-calendar'

const BASE_DATE = '2026-07-06'
const FORECAST_CUTOFF = '2026-07-06T09:00:00.000Z'
const THEME_ID = '10000000-0000-4000-8000-000000000001'
const INTEREST_RUN_ID = '20000000-0000-4000-8000-000000000001'
const NEWS_RUN_ID = '30000000-0000-4000-8000-000000000001'
const BABL_RUN_ID = '40000000-0000-4000-8000-000000000001'
const BABL_OBSERVATION_ID = '50000000-0000-4000-8000-000000000001'

const sha = (character: string): string => character.repeat(64)
const id = (prefix: string, index: number): string =>
  `${prefix}0000000-0000-4000-8000-${String(index).padStart(12, '0')}`

const tradingDates = getKoreanTradingDateWindow({
  baseDate: BASE_DATE,
  startOffset: -20,
  endOffset: 0,
})
const interestDates = tradingDates.slice(0, 20)
const newsDates = tradingDates.slice(-14)
const newsObservationIds = newsDates.map((_, index) => id('7', index + 1))
const NEWS_RESPONSE_SHA256 = sha('e')

const input = {
  studyOriginManifestId: '60000000-0000-4000-8000-000000000001',
  studyOriginManifestSha256: sha('a'),
  studyContractId: '61000000-0000-4000-8000-000000000001',
  studyContractSha256: sha('b'),
  featureContractVersion: 'tli-attention-v2-f1',
  featureContractSha256: sha('c'),
  forecastOriginManifestId: '62000000-0000-4000-8000-000000000001',
  forecastOriginManifestSha256: sha('d'),
  themeId: THEME_ID,
  baseDate: BASE_DATE,
  cutoffAt: FORECAST_CUTOFF,
  interestRun: {
    id: INTEREST_RUN_ID,
    responseSha256: sha('f'),
    status: 'complete',
    sourceMaxDate: interestDates.at(-1) ?? BASE_DATE,
    completedAt: '2026-07-06T08:30:00.000Z',
  },
  interestObservations: interestDates.map((tradingDate, index) => ({
    id: id('8', index + 1),
    collectionRunId: INTEREST_RUN_ID,
    themeId: THEME_ID,
    tradingDate,
    rawValue: index + 1,
    normalized: 1_000 - index,
    anchorScaledValue: 10_000 - index,
  })),
  newsObservationIds,
  newsInputSha256: sha256OrderedJsonStringArray(newsObservationIds),
  newsObservations: newsDates.map((articleDate, index) => ({
    id: id('7', index + 1),
    collectionRunId: NEWS_RUN_ID,
    themeId: THEME_ID,
    articleDate,
    articleCount: index + 1,
    queryHash: sha('9'),
    collectedAt: '2026-07-06T08:45:00.000Z',
  })),
  newsRuns: [{
    id: NEWS_RUN_ID,
    responseSha256: NEWS_RESPONSE_SHA256,
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
  bablInputSha256: sha('2'),
  bablCandidatePool: 'archetype',
  bablMissingReason: null,
  bablObservation: {
    id: BABL_OBSERVATION_ID,
    collectionRunId: BABL_RUN_ID,
    themeId: THEME_ID,
    snapshotDate: BASE_DATE,
    phase: 'rising',
    algorithmVersion: 'b-abl-v4',
    comparisonSpecVersion: 'comparison-v4-spec-v1',
    evaluationHorizonDays: 14,
    candidatePool: 'archetype',
    sourcePredictionSnapshotId: '51000000-0000-4000-8000-000000000001',
    computedAt: '2026-07-06T08:50:00.000Z',
    payloadHash: sha('2'),
    sourceRunStatus: 'complete',
  },
} satisfies ConfirmatoryFeatureInput

describe('buildConfirmatoryFeatureVector golden contract', () => {
  it('builds the exact ordered ten-slot raw-interest vector with provenance when frozen sources match', () => {
    // Given: one frozen study-origin input with raw interest 1..20, news 1..14, and exact rising B-Abl.

    // When: the pure confirmatory feature vector is built.
    const result = buildConfirmatoryFeatureVector(input)

    // Then: only the preregistered ten raw-derived slots, source ages, provenance, and canonical hash remain.
    const expectedBody = {
      featureNames: [
        'interest_slope_7d',
        'interest_accel',
        'dvi_7d',
        'interest_return_10d',
        'interest_drawdown_20d',
        'news_volume_7d',
        'news_momentum',
        'babl_phase_signal',
        'interest_source_age_days',
        'news_source_age_days',
      ],
      values: [
        0.058823529411764705,
        -0.006191950464396287,
        1,
        0.6931471805599453,
        0,
        4.356708826689592,
        1.75,
        1,
        1,
        0,
      ],
      missingFlags: [false, false, false, false, false, false, false, false, false, false],
      abstain: false,
      abstainReasons: [],
      provenance: {
        studyOriginManifestId: input.studyOriginManifestId,
        studyOriginManifestSha256: input.studyOriginManifestSha256,
        studyContractId: input.studyContractId,
        studyContractSha256: input.studyContractSha256,
        featureContractVersion: input.featureContractVersion,
        featureContractSha256: input.featureContractSha256,
        forecastOriginManifestId: input.forecastOriginManifestId,
        forecastOriginManifestSha256: input.forecastOriginManifestSha256,
        themeId: input.themeId,
        baseDate: input.baseDate,
        cutoffAt: input.cutoffAt,
        interestRunId: input.interestRun.id,
        interestResponseSha256: input.interestRun.responseSha256,
        interestSourceMaxDate: input.interestRun.sourceMaxDate,
        interestSourceAgeDays: 1,
        newsObservationIds: input.newsObservationIds,
        newsInputSha256: input.newsInputSha256,
        newsSourceMaxDate: BASE_DATE,
        newsSourceAgeDays: 0,
        newsRunIds: [NEWS_RUN_ID],
        newsRunResponseSha256s: [NEWS_RESPONSE_SHA256],
        bablObservationId: input.bablObservationId,
        bablInputSha256: input.bablInputSha256,
        bablCandidatePool: input.bablCandidatePool,
      },
    }

    expect(CONFIRMATORY_FEATURE_NAMES).toEqual(expectedBody.featureNames)
    expect(result).toEqual({
      ...expectedBody,
      featureSnapshotSha256: canonicalJsonV1Sha256(expectedBody),
    })
  })
})
