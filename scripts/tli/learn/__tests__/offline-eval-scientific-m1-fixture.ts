import {
  canonicalJsonV1Sha256,
  compareUtf8Bytes,
  sha256CanonicalJson,
  sha256OrderedJsonStringArray,
} from '../../../../lib/tli/canonical-json'
import type { StudyOrigin } from '../../../../lib/tli/eval/types'
import type { ConfirmatoryFeatureInput } from '../../../../lib/tli/features/build-confirmatory-features'
import { getKoreanTradingDateWindow } from '../../../../lib/tli/trading-calendar'
import {
  CONFIRMATORY_HORIZON_DAYS,
  CONFIRMATORY_LABELER_VERSION,
  CONFIRMATORY_QUERY_CONTRACT,
  DATASET_MANIFEST_VERSION,
  type DatasetRow,
  type LoadedDataset,
} from '../dataset-manifest'

export const CYCLE_ID = 'abcdefab-0000-4000-8000-000000000001'
export const STUDY_CONTRACT_ID = '20000000-0000-4000-8000-000000000001'
export const STUDY_CONTRACT_SHA256 = 'a'.repeat(64)
export const FEATURE_CONTRACT_SHA256 = 'b'.repeat(64)
export const FEATURE_CONTRACT_VERSION = 'tli-attention-v2-f1'

export type FixtureDriver = 'known_signal' | 'shuffled_no_signal'

const THEME_SIGNALS = [-3, -2.5, -2, -1.5, -1, -0.5, 0.5, 1, 1.5, 2, 2.5, 3] as const
const LABEL_CONTRACT_SHA256 = 'c'.repeat(64)

const uuid = (group: number, serial: number): string => (
  `${group.toString(16).padStart(8, '0')}-0000-4000-8000-${serial.toString().padStart(12, '0')}`
)

const addDays = (date: string, days: number): string => {
  const value = new Date(`${date}T00:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

export const ORIGINS = Array.from({ length: 26 }, (_unused, index): StudyOrigin => {
  const originDate = addDays('2025-02-04', index * 14)
  return { originDate, forecastCutoff: `${originDate}T09:00:00.000Z` }
})

const themeIds = THEME_SIGNALS.map((_signal, index) => uuid(0x30000000, index + 1))
const originId = (index: number): string => uuid(0x40000000, index + 1)
const forecastId = (index: number): string => uuid(0x50000000, index + 1)
const hashIdentity = (kind: string, index: number): string => canonicalJsonV1Sha256({ kind, index })
const readThemeSignal = (index: number): number => {
  const signal = THEME_SIGNALS[index]
  if (signal === undefined) throw new RangeError('fixture theme index is outside the balanced panel')
  return signal
}

const featureSignal = (driver: FixtureDriver, originIndex: number, themeIndex: number): number => (
  driver === 'known_signal'
    ? readThemeSignal(themeIndex)
    : readThemeSignal((themeIndex + (originIndex % (THEME_SIGNALS.length - 1)) + 1) % THEME_SIGNALS.length)
)

const sourceIds = (rowIndex: number) => ({
  interestRunId: uuid(0x60000000, rowIndex + 1),
  newsRunId: uuid(0x61000000, rowIndex + 1),
  bablRunId: uuid(0x62000000, rowIndex + 1),
  bablObservationId: uuid(0x63000000, rowIndex + 1),
})

const buildFeatureInput = (
  driver: FixtureDriver,
  originIndex: number,
  themeIndex: number,
): ConfirmatoryFeatureInput => {
  const origin = ORIGINS[originIndex]
  const themeId = themeIds[themeIndex]
  if (origin === undefined || themeId === undefined) throw new RangeError('fixture index is outside the frozen schedule')
  const rowIndex = originIndex * THEME_SIGNALS.length + themeIndex
  const signal = featureSignal(driver, originIndex, themeIndex)
  const ids = sourceIds(rowIndex)
  const interestDates = getKoreanTradingDateWindow({ baseDate: origin.originDate, startOffset: -19, endOffset: 0 })
  const newsDates = getKoreanTradingDateWindow({ baseDate: origin.originDate, startOffset: -13, endOffset: 0 })
  const newsObservationIds = newsDates.map((_date, index) => uuid(0x70000000 + rowIndex, index + 1))
  const bablInputSha256 = hashIdentity('babl-input', rowIndex)
  return {
    studyOriginManifestId: originId(originIndex),
    studyOriginManifestSha256: hashIdentity('study-origin', originIndex),
    studyContractId: STUDY_CONTRACT_ID,
    studyContractSha256: STUDY_CONTRACT_SHA256,
    featureContractVersion: FEATURE_CONTRACT_VERSION,
    featureContractSha256: FEATURE_CONTRACT_SHA256,
    forecastOriginManifestId: forecastId(originIndex),
    forecastOriginManifestSha256: hashIdentity('forecast-origin', originIndex),
    themeId,
    baseDate: origin.originDate,
    cutoffAt: origin.forecastCutoff,
    interestRun: {
      id: ids.interestRunId,
      responseSha256: hashIdentity('interest-response', rowIndex),
      status: 'complete',
      sourceMaxDate: interestDates.at(-1) ?? origin.originDate,
      completedAt: `${origin.originDate}T08:00:00.000Z`,
    },
    interestObservations: interestDates.map((tradingDate, index) => ({
      id: uuid(0x71000000 + rowIndex, index + 1),
      collectionRunId: ids.interestRunId,
      themeId,
      tradingDate,
      rawValue: 100 + signal * (index + 1),
      normalized: 0,
      anchorScaledValue: null,
    })),
    newsObservationIds,
    newsInputSha256: sha256OrderedJsonStringArray(newsObservationIds),
    newsObservations: newsDates.map((articleDate, index) => ({
      id: newsObservationIds[index] ?? '',
      collectionRunId: ids.newsRunId,
      themeId,
      articleDate,
      articleCount: index < 7 ? 20 : 20 + signal * 2,
      queryHash: hashIdentity('news-query', rowIndex),
      collectedAt: `${origin.originDate}T08:10:00.000Z`,
    })),
    newsRuns: [{
      id: ids.newsRunId,
      responseSha256: hashIdentity('news-response', rowIndex),
      status: 'complete',
      sourceMaxDate: newsDates.at(-1) ?? origin.originDate,
      collectedAt: `${origin.originDate}T08:10:00.000Z`,
      completedAt: `${origin.originDate}T08:20:00.000Z`,
    }],
    bablLock: {
      algorithmVersion: 'b-abl-v4',
      comparisonSpecVersion: 'comparison-v4-spec-v1',
      evaluationHorizonDays: 14,
      candidatePoolRule: 'source_prod_run_v1',
    },
    bablObservationId: ids.bablObservationId,
    bablInputSha256,
    bablCandidatePool: 'archetype',
    bablMissingReason: null,
    bablObservation: {
      id: ids.bablObservationId,
      collectionRunId: ids.bablRunId,
      themeId,
      snapshotDate: origin.originDate,
      phase: 'sideways',
      algorithmVersion: 'b-abl-v4',
      comparisonSpecVersion: 'comparison-v4-spec-v1',
      evaluationHorizonDays: 14,
      candidatePool: 'archetype',
      sourcePredictionSnapshotId: uuid(0x64000000, rowIndex + 1),
      computedAt: `${origin.originDate}T08:30:00.000Z`,
      payloadHash: bablInputSha256,
      sourceRunStatus: 'complete',
    },
  }
}

const rowTimestamp = (date: string, hour: string): string => `${date}T${hour}:00:00.000Z`

const buildDatasetRow = (originIndex: number, themeIndex: number): DatasetRow => {
  const origin = ORIGINS[originIndex]
  const themeId = themeIds[themeIndex]
  const firstTestOrigin = ORIGINS[13]
  const firstInnerValidationOrigin = ORIGINS[8]
  if (
    origin === undefined
    || themeId === undefined
    || firstTestOrigin === undefined
    || firstInnerValidationOrigin === undefined
  ) {
    throw new RangeError('fixture index is outside the frozen schedule')
  }
  const futureDates = getKoreanTradingDateWindow({ baseDate: origin.originDate, startOffset: 1, endOffset: 5 })
  const lastFutureDate = futureDates.at(-1) ?? origin.originDate
  const overlapSentinel = originIndex === 2 && themeIndex === 0
  const lateFinalizedSentinel = originIndex === 1 && themeIndex === 0
  const lateSourceSentinel = originIndex === 0 && themeIndex === 0
  const innerOverlapSentinel = originIndex === 3 && themeIndex === 0
  const innerLateFinalizedSentinel = originIndex === 4 && themeIndex === 0
  const innerLateSourceSentinel = originIndex === 5 && themeIndex === 0
  const labelSignal = readThemeSignal(themeIndex)
  return {
    id: `label-${originIndex.toString().padStart(2, '0')}-${themeIndex}`,
    themeId,
    baseDate: origin.originDate,
    horizonDays: CONFIRMATORY_HORIZON_DAYS,
    forecastOriginManifestId: forecastId(originIndex),
    studyOriginManifestId: originId(originIndex),
    labelSourceRunId: uuid(0x65000000, originIndex * THEME_SIGNALS.length + themeIndex + 1),
    finalizedAt: lateFinalizedSentinel
      ? `${firstTestOrigin.originDate}T09:00:00.001Z`
      : innerLateFinalizedSentinel
        ? `${firstInnerValidationOrigin.originDate}T09:00:00.001Z`
      : rowTimestamp(lastFutureDate, '10'),
    labelSourceRunCompletedAt: lateSourceSentinel
      ? `${firstTestOrigin.originDate}T09:00:00.001Z`
      : innerLateSourceSentinel
        ? `${firstInnerValidationOrigin.originDate}T09:00:00.001Z`
      : rowTimestamp(lastFutureDate, '11'),
    yBinary: labelSignal > 0,
    gLogRatio: labelSignal,
    pastDates: getKoreanTradingDateWindow({ baseDate: origin.originDate, startOffset: -19, endOffset: 0 }),
    futureDates: overlapSentinel
      ? [firstTestOrigin.originDate]
      : innerOverlapSentinel
        ? [firstInnerValidationOrigin.originDate]
        : futureDates,
  }
}

const canonicalDatasetRow = (row: DatasetRow) => ({
  base_date: row.baseDate,
  theme_id: row.themeId,
  id: row.id,
  horizon_days: row.horizonDays,
  labeler_version: CONFIRMATORY_LABELER_VERSION,
  forecast_origin_manifest_id: row.forecastOriginManifestId,
  study_origin_manifest_id: row.studyOriginManifestId,
  label_source_run_id: row.labelSourceRunId,
  finalized_at: row.finalizedAt,
  label_source_run_completed_at: row.labelSourceRunCompletedAt,
  y_binary: row.yBinary,
  g_log_ratio: row.gLogRatio,
  past_dates: [...row.pastDates],
  future_dates: [...row.futureDates],
})

const sortedUnique = (values: readonly string[]): string[] => [...new Set(values)].sort(compareUtf8Bytes)

export const buildScientificM1Fixture = (driver: FixtureDriver = 'known_signal') => {
  const rows = ORIGINS.flatMap((_origin, originIndex) => (
    THEME_SIGNALS.map((_signal, themeIndex) => buildDatasetRow(originIndex, themeIndex))
  ))
  const manifest: LoadedDataset['manifest'] = {
    manifest_version: DATASET_MANIFEST_VERSION,
    study_contract_id: STUDY_CONTRACT_ID,
    study_contract_sha256: STUDY_CONTRACT_SHA256,
    labeler_version: CONFIRMATORY_LABELER_VERSION,
    label_contract_sha256: LABEL_CONTRACT_SHA256,
    feature_contract_version: FEATURE_CONTRACT_VERSION,
    feature_contract_sha256: FEATURE_CONTRACT_SHA256,
    horizon_days: CONFIRMATORY_HORIZON_DAYS,
    as_of_cutoff: '2026-01-31T23:59:59.999Z',
    query_contract: CONFIRMATORY_QUERY_CONTRACT,
    row_count: rows.length,
    unique_key_count: rows.length,
    min_base_date: rows.at(0)?.baseDate ?? null,
    max_base_date: rows.at(-1)?.baseDate ?? null,
    forecast_origin_manifest_ids: sortedUnique(rows.map((row) => row.forecastOriginManifestId)),
    study_origin_manifest_ids: sortedUnique(rows.map((row) => row.studyOriginManifestId)),
    label_source_run_ids: sortedUnique(rows.map((row) => row.labelSourceRunId)),
    ordered_rows_sha256: sha256CanonicalJson(rows.map(canonicalDatasetRow)),
  }
  const dataset: LoadedDataset = {
    manifest,
    manifestSha256: sha256CanonicalJson(manifest),
    rows,
  }
  return {
    cycleId: CYCLE_ID,
    dataset,
    origins: ORIGINS,
    featureInputs: ORIGINS.flatMap((_origin, originIndex) => (
      THEME_SIGNALS.map((_signal, themeIndex) => buildFeatureInput(driver, originIndex, themeIndex))
    )),
  }
}
