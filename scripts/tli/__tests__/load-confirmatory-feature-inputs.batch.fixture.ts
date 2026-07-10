import { vi } from 'vitest'

import { sha256OrderedJsonStringArray } from '../../../lib/tli/canonical-json'
import { getKoreanTradingDateWindow } from '../../../lib/tli/trading-calendar'
import type {
  BablObservation, CollectionRun, ConfirmatoryFeatureBatchDataSource,
  ForecastOriginManifest, ForecastThemeInput, InterestObservation,
  NewsObservation, StudyOriginBundle, StudyThemeInput,
} from '../features/load-confirmatory-feature-inputs'

const STUDY_ORIGIN_ID = 'a0000000-0000-4000-8000-000000000001'
const FORECAST_ORIGIN_ID = 'b0000000-0000-4000-8000-000000000001'
const STUDY_CONTRACT_ID = 'c0000000-0000-4000-8000-000000000001'
const ORIGIN_DATE = '2026-07-06'
const FORECAST_CUTOFF = '2026-07-06T09:00:00.000Z'

const id = (namespace: string, index: number): string =>
  `${namespace}0000000-0000-4000-8000-${String(index).padStart(12, '0')}`

const sha = (index: number): string => index.toString(16).padStart(64, '0')

const interestDates = getKoreanTradingDateWindow({ baseDate: ORIGIN_DATE, startOffset: -19, endOffset: 0 })
const newsDates = getKoreanTradingDateWindow({ baseDate: ORIGIN_DATE, startOffset: -13, endOffset: 0 })

const createThemeFixture = (index: number) => {
  const themeId = id('1', index)
  const interestRunId = id('2', index)
  const alternateInterestRunId = id('3', index)
  const backfillRunId = id('4', index)
  const newsRunId = id('9', index)
  const futureNewsRunId = id('e', index)
  const keywordGroupSha256 = sha(2_000 + index)
  const newsRunResponseSha256 = sha(4_000 + index)
  const newsObservationIds = newsDates.map((_, slot) =>
    id('5', (index - 1) * newsDates.length + slot + 1))
  const newsInputSha256 = sha256OrderedJsonStringArray(newsObservationIds)
  const interestRun: CollectionRun = {
    id: interestRunId, source: 'naver_datalab', status: 'complete',
    responseSha256: sha(1_000 + index), keywordGroupHash: keywordGroupSha256,
    sourceMaxDate: ORIGIN_DATE, collectedAt: '2026-07-06T08:30:00.000Z',
    completedAt: '2026-07-06T08:40:00.000Z',
  }
  const alternateInterestRun: CollectionRun = {
    ...interestRun, id: alternateInterestRunId,
    responseSha256: sha(3_000 + index), collectedAt: '2026-07-06T08:31:00.000Z',
    completedAt: '2026-07-06T08:41:00.000Z',
  }
  const backfillInterestRun: CollectionRun = {
    ...interestRun, id: backfillRunId,
    responseSha256: sha(6_000 + index), collectedAt: '2026-07-06T09:00:01.000Z',
    completedAt: '2026-07-06T09:00:02.000Z',
  }
  const newsRun: CollectionRun = {
    id: newsRunId, source: 'naver_news', status: 'complete',
    responseSha256: newsRunResponseSha256, keywordGroupHash: keywordGroupSha256,
    sourceMaxDate: ORIGIN_DATE, collectedAt: '2026-07-06T08:43:00.000Z', completedAt: '2026-07-06T08:44:00.000Z',
  }
  const futureNewsRun: CollectionRun = {
    ...newsRun, id: futureNewsRunId, status: 'failed', responseSha256: null,
    collectedAt: '2026-07-06T09:00:01.000Z',
    completedAt: '2026-07-06T09:00:02.000Z',
  }
  const interestObservations: readonly InterestObservation[] = interestDates.map(
    (tradingDate, slot) => ({
      id: id('7', (index - 1) * interestDates.length + slot + 1),
      collectionRunId: interestRunId,
      themeId,
      tradingDate,
      rawValue: index + slot,
      normalized: 10_000 + slot,
      anchorScaledValue: 20_000 + slot,
    }),
  )
  const alternateInterestObservations: readonly InterestObservation[] =
    interestDates.map((tradingDate, slot) => ({
      id: id('8', (index - 1) * interestDates.length + slot + 1),
      collectionRunId: alternateInterestRunId,
      themeId,
      tradingDate,
      rawValue: (index + slot) * 1_000,
      normalized: 30_000 + slot,
      anchorScaledValue: 40_000 + slot,
    }))
  const newsObservations: readonly NewsObservation[] = newsDates.map(
    (articleDate, slot) => ({
      id: id('5', (index - 1) * newsDates.length + slot + 1),
      collectionRunId: newsRunId,
      themeId,
      articleDate,
      articleCount: index + slot,
      queryHash: keywordGroupSha256,
      collectedAt: '2026-07-06T08:45:00.000Z',
    }),
  )

  return {
    themeId,
    interestRun,
    alternateInterestRun,
    backfillInterestRun,
    newsRun,
    newsRunResponseSha256,
    futureNewsRun,
    interestObservations,
    alternateInterestObservations,
    backfillInterestObservation: {
      id: id('d', index),
      collectionRunId: backfillRunId,
      themeId,
      tradingDate: interestDates.at(0) ?? ORIGIN_DATE,
      rawValue: 999_999,
      normalized: 999_999,
      anchorScaledValue: 999_999,
    } satisfies InterestObservation,
    newsObservations,
    lateNewsObservation: {
      id: id('6', index),
      collectionRunId: futureNewsRunId,
      themeId,
      articleDate: ORIGIN_DATE,
      articleCount: 999_999,
      queryHash: sha(5_000 + index),
      collectedAt: '2026-07-06T09:00:01.000Z',
    } satisfies NewsObservation,
    studyThemeInput: {
      studyOriginManifestId: STUDY_ORIGIN_ID,
      themeId,
      bablObservationId: null,
      bablInputSha256: null,
      bablCandidatePool: null,
      bablMissingReason: 'no_matching_observation',
    } satisfies StudyThemeInput,
    forecastThemeInput: {
      forecastOriginManifestId: FORECAST_ORIGIN_ID,
      themeId,
      keywordGroupSha256,
      forecastInterestRunId: interestRunId,
      forecastInterestResponseSha256: interestRun.responseSha256,
      newsObservationIds,
      newsInputSha256,
      inputStatus: 'usable',
      abstainReason: null,
    } satisfies ForecastThemeInput,
  }
}

export function createConfirmatoryBatchFixture(themeCount: number) {
  const themes = Array.from({ length: themeCount }, (_, index) =>
    createThemeFixture(index + 1))
  const themeIds = themes.map((theme) => theme.themeId)
  const studyBundle: StudyOriginBundle = {
    id: STUDY_ORIGIN_ID,
    payloadSha256: sha(10),
    forecastOriginManifestId: FORECAST_ORIGIN_ID,
    studyContract: {
      id: STUDY_CONTRACT_ID,
      payloadSha256: sha(11),
      featureContractVersion: 'tli-attention-v2-f1',
      featureContractSha256: sha(12),
      bablAlgorithmVersion: 'b-abl-v4',
      bablComparisonSpecVersion: 'comparison-v4-spec-v1',
      bablEvaluationHorizonDays: 14,
      bablCandidatePoolRule: 'source_prod_run_v1',
    },
  }
  const forecastManifest: ForecastOriginManifest = {
    id: FORECAST_ORIGIN_ID,
    payloadSha256: sha(13),
    originDate: ORIGIN_DATE,
    forecastCutoff: FORECAST_CUTOFF,
    expectedThemeIds: themeIds,
    expectedThemeCount: themeCount,
  }

  const createDataSource = (includeNoise: boolean) => {
    const requestedCollectionRunIds: string[] = []
    const requestedInterestObservationRunIds: string[] = []
    const requestedNewsObservationIds: string[] = []
    const requestedBablObservationIds: string[] = []
    const collectionRuns = themes.flatMap((theme) => includeNoise
      ? [
          theme.interestRun, theme.newsRun, theme.alternateInterestRun,
          theme.backfillInterestRun, theme.futureNewsRun,
        ]
      : [theme.interestRun, theme.newsRun])
    const interestObservations = themes.flatMap((theme) => includeNoise
      ? [
          ...theme.interestObservations,
          ...theme.alternateInterestObservations,
          theme.backfillInterestObservation,
        ]
      : theme.interestObservations)
    const newsObservations = themes.flatMap((theme) => includeNoise
      ? [...theme.newsObservations, theme.lateNewsObservation]
      : theme.newsObservations)
    const bablObservations: readonly BablObservation[] = []
    const dataSource = {
      loadStudyOriginBundle: vi.fn(async (manifestId: string) =>
        manifestId === STUDY_ORIGIN_ID ? studyBundle : null),
      loadStudyThemeInputs: vi.fn(async (manifestId: string) =>
        manifestId === STUDY_ORIGIN_ID
          ? themes.slice().reverse().map((theme) => theme.studyThemeInput)
          : []),
      loadForecastOriginManifest: vi.fn(async (manifestId: string) =>
        manifestId === FORECAST_ORIGIN_ID ? forecastManifest : null),
      loadForecastThemeInputs: vi.fn(async (manifestId: string) =>
        manifestId === FORECAST_ORIGIN_ID
          ? themes.slice().reverse().map((theme) => theme.forecastThemeInput)
          : []),
      loadCollectionRunsByIds: vi.fn(async (runIds: readonly string[]) => {
        requestedCollectionRunIds.push(...runIds)
        return collectionRuns
      }),
      loadInterestObservationsByRunIds: vi.fn(async (runIds: readonly string[]) => {
        requestedInterestObservationRunIds.push(...runIds)
        return interestObservations
      }),
      loadNewsObservationsByIds: vi.fn(async (observationIds: readonly string[]) => {
        requestedNewsObservationIds.push(...observationIds)
        return newsObservations
      }),
      loadBablObservationsByIds: vi.fn(async (observationIds: readonly string[]) => {
        requestedBablObservationIds.push(...observationIds)
        return bablObservations
      }),
    } satisfies ConfirmatoryFeatureBatchDataSource

    return {
      ...dataSource,
      requestedIds: {
        collectionRunIds: requestedCollectionRunIds,
        interestObservationRunIds: requestedInterestObservationRunIds,
        newsObservationIds: requestedNewsObservationIds,
        bablObservationIds: requestedBablObservationIds,
      },
      loadLatestForecastOriginManifest: vi.fn(async () => forecastManifest),
      loadStudyOriginBundleByTuple: vi.fn(async () => studyBundle),
      loadInterestObservationsForTheme: vi.fn(async () => interestObservations),
      loadNewsObservationsForTheme: vi.fn(async () => newsObservations),
      loadBablObservationsForTheme: vi.fn(async () => bablObservations),
    }
  }

  return {
    request: { studyOriginManifestId: STUDY_ORIGIN_ID },
    themeIds,
    interestRunIds: themes.map((theme) => theme.interestRun.id),
    alternateInterestRunIds: themes.map((theme) => theme.alternateInterestRun.id),
    newsRunIds: themes.map((theme) => theme.newsRun.id),
    newsRunResponseSha256s: themes.map((theme) => theme.newsRunResponseSha256),
    futureNewsRunIds: themes.map((theme) => theme.futureNewsRun.id),
    newsObservationIds: themes.flatMap(
      (theme) => theme.forecastThemeInput.newsObservationIds),
    newsObservationIdsByTheme: themes.map(
      (theme) => theme.forecastThemeInput.newsObservationIds),
    newsInputHashes: themes.map((theme) => theme.forecastThemeInput.newsInputSha256),
    lateNewsObservationIds: themes.map((theme) => theme.lateNewsObservation.id),
    createDataSource,
  }
}
