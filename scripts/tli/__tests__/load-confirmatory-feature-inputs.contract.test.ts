import { describe, expect, it, vi } from 'vitest'

import {
  compareUtf8Bytes,
  sha256OrderedJsonStringArray,
} from '../../../lib/tli/canonical-json'
import { getKoreanTradingDateWindow } from '../../../lib/tli/trading-calendar'
import {
  ConfirmatoryFeatureBatchError,
  loadConfirmatoryFeatureBatch,
  type CollectionRun,
  type ConfirmatoryFeatureBatch,
  type ConfirmatoryFeatureBatchDataSource,
  type ForecastOriginManifest,
  type ForecastThemeInput,
  type StudyOriginBundle,
  type StudyThemeInput,
} from '../features/load-confirmatory-feature-inputs'

const STUDY_ORIGIN_ID = '00000000-0000-4000-8000-000000000901'
const OTHER_STUDY_ORIGIN_ID = '00000000-0000-4000-8000-000000000999'
const FORECAST_ORIGIN_ID = '00000000-0000-4000-8000-000000000902'
const STUDY_CONTRACT_ID = '00000000-0000-4000-8000-000000000903'
const THEME_ID = '00000000-0000-4000-8000-000000000904'
const INTEREST_RUN_ID = '00000000-0000-4000-8000-000000000905'
const BABL_OBSERVATION_ID = '00000000-0000-4000-8000-000000000906'
const ORIGIN_DATE = '2026-07-06'
const FORECAST_CUTOFF = '2026-07-06T09:00:00.000Z'
const hash = (character: string): string => character.repeat(64)

const STUDY_BUNDLE: StudyOriginBundle = {
  id: STUDY_ORIGIN_ID,
  payloadSha256: hash('a'),
  forecastOriginManifestId: FORECAST_ORIGIN_ID,
  studyContract: {
    id: STUDY_CONTRACT_ID,
    payloadSha256: hash('b'),
    featureContractVersion: 'tli-attention-v2-f1',
    featureContractSha256: hash('c'),
    bablAlgorithmVersion: 'babl-v1',
    bablComparisonSpecVersion: 'comparison-v4-spec-v1',
    bablEvaluationHorizonDays: 14,
    bablCandidatePoolRule: 'source_prod_run_v1',
  },
}

const STUDY_THEME_INPUT: StudyThemeInput = {
  studyOriginManifestId: STUDY_ORIGIN_ID,
  themeId: THEME_ID,
  bablObservationId: BABL_OBSERVATION_ID,
  bablInputSha256: hash('d'),
  bablCandidatePool: 'prod-pool',
  bablMissingReason: null,
}

const FORECAST_MANIFEST: ForecastOriginManifest = {
  id: FORECAST_ORIGIN_ID,
  payloadSha256: hash('e'),
  originDate: ORIGIN_DATE,
  forecastCutoff: FORECAST_CUTOFF,
  expectedThemeIds: [THEME_ID],
  expectedThemeCount: 1,
}

const interestDates = getKoreanTradingDateWindow({
  baseDate: ORIGIN_DATE,
  startOffset: -19,
  endOffset: 0,
})
const newsDates = getKoreanTradingDateWindow({
  baseDate: ORIGIN_DATE,
  startOffset: -13,
  endOffset: 0,
})
const newsIds = newsDates.map(
  (_date, index) => `00000000-0000-4000-8001-${String(index + 1).padStart(12, '0')}`,
)

const FORECAST_THEME_INPUT: ForecastThemeInput = {
  forecastOriginManifestId: FORECAST_ORIGIN_ID,
  themeId: THEME_ID,
  keywordGroupSha256: hash('f'),
  forecastInterestRunId: INTEREST_RUN_ID,
  forecastInterestResponseSha256: hash('1'),
  newsObservationIds: newsIds,
  newsInputSha256: sha256OrderedJsonStringArray(newsIds),
  inputStatus: 'usable',
  abstainReason: null,
}

const INTEREST_RUN: CollectionRun = {
  id: INTEREST_RUN_ID,
  source: 'naver_datalab',
  status: 'complete',
  responseSha256: hash('1'),
  keywordGroupHash: hash('f'),
  sourceMaxDate: ORIGIN_DATE,
  collectedAt: '2026-07-06T08:50:00.000Z',
  completedAt: '2026-07-06T08:55:00.000Z',
}

const NEWS_RUNS: readonly CollectionRun[] = newsDates.map((_date, index) => ({
  id: `news-run-${index}`,
  source: 'naver_news',
  status: 'complete',
  responseSha256: hash(String((index % 8) + 2)),
  keywordGroupHash: hash('f'),
  sourceMaxDate: ORIGIN_DATE,
  collectedAt: '2026-07-06T08:40:00.000Z',
  completedAt: '2026-07-06T08:44:00.000Z',
}))
const collectionRunIds = [
  INTEREST_RUN_ID,
  ...NEWS_RUNS.map((run) => run.id),
].sort(compareUtf8Bytes)

const interestObservations = interestDates.map((tradingDate, index) => ({
  id: `interest-${tradingDate}`,
  collectionRunId: INTEREST_RUN_ID,
  themeId: THEME_ID,
  tradingDate,
  rawValue: index + 1,
  normalized: index + 1,
  anchorScaledValue: null,
}))
const newsObservations = newsDates.map((articleDate, index) => ({
  id: `00000000-0000-4000-8001-${String(index + 1).padStart(12, '0')}`,
  collectionRunId: `news-run-${index}`,
  themeId: THEME_ID,
  articleDate,
  articleCount: index,
  queryHash: hash('f'),
  collectedAt: '2026-07-06T08:45:00.000Z',
}))
const bablObservations = [{
  id: BABL_OBSERVATION_ID,
  collectionRunId: '00000000-0000-4000-8000-000000000907',
  themeId: THEME_ID,
  snapshotDate: ORIGIN_DATE,
  phase: 'rising',
  algorithmVersion: 'babl-v1',
  comparisonSpecVersion: 'comparison-v4-spec-v1',
  evaluationHorizonDays: 14,
  candidatePool: 'prod-pool',
  sourcePredictionSnapshotId: '00000000-0000-4000-8000-000000000908',
  computedAt: '2026-07-06T08:40:00.000Z',
  payloadHash: hash('d'),
  sourceRunStatus: 'complete' as const,
}]

const createDataSource = (
  studyThemeInputs: readonly StudyThemeInput[] = [STUDY_THEME_INPUT],
) => ({
  loadStudyOriginBundle: vi.fn(async (id: string) => id === STUDY_ORIGIN_ID ? STUDY_BUNDLE : null),
  loadStudyThemeInputs: vi.fn(async () => studyThemeInputs),
  loadForecastOriginManifest: vi.fn(async (id: string) => id === FORECAST_ORIGIN_ID ? FORECAST_MANIFEST : null),
  loadForecastThemeInputs: vi.fn(async () => [FORECAST_THEME_INPUT]),
  loadCollectionRunsByIds: vi.fn(async () => [INTEREST_RUN, ...NEWS_RUNS]),
  loadInterestObservationsByRunIds: vi.fn(async () => interestObservations),
  loadNewsObservationsByIds: vi.fn(async () => newsObservations),
  loadBablObservationsByIds: vi.fn(async () => bablObservations),
  loadLatestForecastOriginManifest: vi.fn(async (): Promise<ForecastOriginManifest | null> => FORECAST_MANIFEST),
}) satisfies ConfirmatoryFeatureBatchDataSource & {
  readonly loadLatestForecastOriginManifest: () => Promise<ForecastOriginManifest | null>
}

const captureFailure = async (
  promise: Promise<ConfirmatoryFeatureBatch>,
): Promise<ConfirmatoryFeatureBatchError | null> => {
  try {
    await promise
    return null
  } catch (error) {
    if (error instanceof ConfirmatoryFeatureBatchError) return error
    throw error
  }
}

describe('loadConfirmatoryFeatureBatch contract', () => {
  it('returns the frozen happy shape from the exact study-origin ID', async () => {
    // Given
    const dataSource = createDataSource()

    // When
    const batch = await loadConfirmatoryFeatureBatch({ studyOriginManifestId: STUDY_ORIGIN_ID }, dataSource)

    // Then
    expect(batch).toMatchObject({
      studyOriginManifestId: STUDY_ORIGIN_ID,
      studyOriginManifestSha256: hash('a'),
      studyContractId: STUDY_CONTRACT_ID,
      studyContractSha256: hash('b'),
      featureContractVersion: 'tli-attention-v2-f1',
      featureContractSha256: hash('c'),
      forecastOriginManifestId: FORECAST_ORIGIN_ID,
      forecastOriginManifestSha256: hash('e'),
      originDate: ORIGIN_DATE,
      forecastCutoff: FORECAST_CUTOFF,
      snapshots: [{ provenance: { themeId: THEME_ID } }],
    })
    expect(dataSource.loadStudyOriginBundle).toHaveBeenCalledWith(STUDY_ORIGIN_ID)
    expect(dataSource.loadStudyThemeInputs).toHaveBeenCalledWith(STUDY_ORIGIN_ID)
    expect(dataSource.loadForecastOriginManifest).toHaveBeenCalledWith(FORECAST_ORIGIN_ID)
    expect(dataSource.loadForecastThemeInputs).toHaveBeenCalledWith(FORECAST_ORIGIN_ID)
    expect(dataSource.loadCollectionRunsByIds).toHaveBeenCalledWith(collectionRunIds)
    expect(dataSource.loadInterestObservationsByRunIds).toHaveBeenCalledWith([INTEREST_RUN_ID])
    expect(dataSource.loadNewsObservationsByIds).toHaveBeenCalledWith(newsIds)
    expect(dataSource.loadBablObservationsByIds).toHaveBeenCalledWith([BABL_OBSERVATION_ID])
    expect(dataSource.loadLatestForecastOriginManifest).not.toHaveBeenCalled()
  })

  it('rejects a forecast UUID passed as the study-origin UUID', async () => {
    // Given
    const dataSource = createDataSource()

    // When
    const error = await captureFailure(loadConfirmatoryFeatureBatch({ studyOriginManifestId: FORECAST_ORIGIN_ID }, dataSource))

    // Then
    expect(error?.code).toBe('STUDY_ORIGIN_NOT_FOUND')
    expect(dataSource.loadForecastOriginManifest).not.toHaveBeenCalled()
    expect(dataSource.loadLatestForecastOriginManifest).not.toHaveBeenCalled()
  })

  it('rejects runtime and cycle selectors outside the one-field request', async () => {
    // Given
    const dataSource = createDataSource()
    const request = { studyOriginManifestId: STUDY_ORIGIN_ID, runtimeId: 'runtime-1', cycleId: 'cycle-1' }

    // When
    const error = await captureFailure(loadConfirmatoryFeatureBatch(request, dataSource))

    // Then
    expect(error?.code).toBe('INVALID_REQUEST')
    expect(dataSource.loadStudyOriginBundle).not.toHaveBeenCalled()
    expect(dataSource.loadLatestForecastOriginManifest).not.toHaveBeenCalled()
  })

  it('rejects a study child belonging to another parent manifest', async () => {
    // Given
    const dataSource = createDataSource([{
      ...STUDY_THEME_INPUT,
      studyOriginManifestId: OTHER_STUDY_ORIGIN_ID,
    }])

    // When
    const error = await captureFailure(loadConfirmatoryFeatureBatch({ studyOriginManifestId: STUDY_ORIGIN_ID }, dataSource))

    // Then
    expect(error?.code).toBe('MANIFEST_INCONSISTENT')
    expect(dataSource.loadLatestForecastOriginManifest).not.toHaveBeenCalled()
  })

  it('rejects a missing frozen forecast manifest without latest-row fallback', async () => {
    // Given
    const dataSource = createDataSource()
    dataSource.loadForecastOriginManifest.mockResolvedValueOnce(null)

    // When
    const error = await captureFailure(loadConfirmatoryFeatureBatch({ studyOriginManifestId: STUDY_ORIGIN_ID }, dataSource))

    // Then
    expect(error?.code).toBe('FORECAST_ORIGIN_NOT_FOUND')
    expect(dataSource.loadLatestForecastOriginManifest).not.toHaveBeenCalled()
  })

  it.each([
    {
      name: 'empty theme set',
      manifest: { ...FORECAST_MANIFEST, expectedThemeIds: [], expectedThemeCount: 0 },
      studyThemes: [],
      forecastThemes: [],
    },
    {
      name: 'cutoff outside origin-date 18:00 KST',
      manifest: { ...FORECAST_MANIFEST, forecastCutoff: '2026-07-06T08:59:59.999Z' },
      studyThemes: [STUDY_THEME_INPUT],
      forecastThemes: [FORECAST_THEME_INPUT],
    },
  ])('rejects a frozen parent with $name', async ({ manifest, studyThemes, forecastThemes }) => {
    const dataSource = createDataSource()
    dataSource.loadForecastOriginManifest.mockResolvedValueOnce(manifest)
    dataSource.loadStudyThemeInputs.mockResolvedValueOnce(studyThemes)
    dataSource.loadForecastThemeInputs.mockResolvedValueOnce(forecastThemes)

    const error = await captureFailure(loadConfirmatoryFeatureBatch({ studyOriginManifestId: STUDY_ORIGIN_ID }, dataSource))

    expect(error?.code).toBe('MANIFEST_INCONSISTENT')
  })
})
