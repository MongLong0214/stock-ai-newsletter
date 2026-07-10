import type {
  ConfirmatoryBablMissingReason,
  ConfirmatoryBablObservation,
  ConfirmatoryFeatureSnapshot,
  ConfirmatoryInterestObservation,
  ConfirmatoryNewsObservation,
} from '@/lib/tli/features/build-confirmatory-features'
import { compareUtf8Bytes } from '@/lib/tli/canonical-json'

import {
  buildConfirmatorySnapshots,
  ConfirmatoryFeatureBatchError,
  type ConfirmatoryManifestGraph,
  validateConfirmatoryManifestGraph,
} from './confirmatory-feature-batch-assembly'

export { ConfirmatoryFeatureBatchError }
export type { ConfirmatoryFeatureBatchErrorCode } from './confirmatory-feature-batch-assembly'

export type InterestObservation = ConfirmatoryInterestObservation
export type NewsObservation = ConfirmatoryNewsObservation
export type BablObservation = ConfirmatoryBablObservation

export type StudyOriginBundle = {
  readonly id: string
  readonly payloadSha256: string
  readonly forecastOriginManifestId: string
  readonly studyContract: {
    readonly id: string
    readonly payloadSha256: string
    readonly featureContractVersion: 'tli-attention-v2-f1'
    readonly featureContractSha256: string
    readonly bablAlgorithmVersion: string
    readonly bablComparisonSpecVersion: string
    readonly bablEvaluationHorizonDays: number
    readonly bablCandidatePoolRule: 'source_prod_run_v1'
  }
}

export type StudyThemeInput = {
  readonly studyOriginManifestId: string
  readonly themeId: string
  readonly bablObservationId: string | null
  readonly bablInputSha256: string | null
  readonly bablCandidatePool: string | null
  readonly bablMissingReason: ConfirmatoryBablMissingReason | null
}

export type ForecastOriginManifest = {
  readonly id: string
  readonly payloadSha256: string
  readonly originDate: string
  readonly forecastCutoff: string
  readonly expectedThemeIds: readonly string[]
  readonly expectedThemeCount: number
}

export type ForecastThemeInput = {
  readonly forecastOriginManifestId: string
  readonly themeId: string
  readonly keywordGroupSha256: string
  readonly forecastInterestRunId: string | null
  readonly forecastInterestResponseSha256: string | null
  readonly newsObservationIds: readonly string[]
  readonly newsInputSha256: string | null
  readonly inputStatus: 'usable' | 'abstain'
  readonly abstainReason: string | null
}

export type CollectionRun = {
  readonly id: string
  readonly source: 'naver_datalab' | 'naver_news' | 'babl_phase'
  readonly status: 'complete' | 'partial' | 'failed'
  readonly responseSha256: string | null
  readonly keywordGroupHash: string | null
  readonly sourceMaxDate: string | null
  readonly collectedAt: string
  readonly completedAt: string
}

export type ConfirmatoryFeatureBatchRequest = {
  readonly studyOriginManifestId: string
}

export interface ConfirmatoryFeatureBatchDataSource {
  readonly loadStudyOriginBundle: (
    studyOriginManifestId: string,
  ) => Promise<StudyOriginBundle | null>
  readonly loadStudyThemeInputs: (
    studyOriginManifestId: string,
  ) => Promise<readonly StudyThemeInput[]>
  readonly loadForecastOriginManifest: (
    forecastOriginManifestId: string,
  ) => Promise<ForecastOriginManifest | null>
  readonly loadForecastThemeInputs: (
    forecastOriginManifestId: string,
  ) => Promise<readonly ForecastThemeInput[]>
  readonly loadCollectionRunsByIds: (
    collectionRunIds: readonly string[],
  ) => Promise<readonly CollectionRun[]>
  readonly loadInterestObservationsByRunIds: (
    collectionRunIds: readonly string[],
  ) => Promise<readonly InterestObservation[]>
  readonly loadNewsObservationsByIds: (
    observationIds: readonly string[],
  ) => Promise<readonly NewsObservation[]>
  readonly loadBablObservationsByIds: (
    observationIds: readonly string[],
  ) => Promise<readonly BablObservation[]>
}

export type ConfirmatoryFeatureBatch = {
  readonly studyOriginManifestId: string
  readonly studyOriginManifestSha256: string
  readonly studyContractId: string
  readonly studyContractSha256: string
  readonly featureContractVersion: 'tli-attention-v2-f1'
  readonly featureContractSha256: string
  readonly forecastOriginManifestId: string
  readonly forecastOriginManifestSha256: string
  readonly originDate: string
  readonly forecastCutoff: string
  readonly snapshots: readonly ConfirmatoryFeatureSnapshot[]
}

const readStudyOriginManifestId = (request: unknown): string => {
  if (typeof request !== 'object' || request === null) {
    throw new ConfirmatoryFeatureBatchError('INVALID_REQUEST', 'Request must be an object')
  }
  const ownKeys = Reflect.ownKeys(request)
  if (ownKeys.length !== 1 || ownKeys.at(0) !== 'studyOriginManifestId') {
    throw new ConfirmatoryFeatureBatchError(
      'INVALID_REQUEST',
      'Request must contain only studyOriginManifestId',
    )
  }
  if (!('studyOriginManifestId' in request)) {
    throw new ConfirmatoryFeatureBatchError('INVALID_REQUEST', 'Study-origin ID is missing')
  }
  const manifestId = request.studyOriginManifestId
  if (typeof manifestId !== 'string' || manifestId.trim().length === 0) {
    throw new ConfirmatoryFeatureBatchError('INVALID_REQUEST', 'Study-origin ID must be non-empty')
  }
  return manifestId
}

const uniqueSorted = (values: readonly string[]): readonly string[] =>
  [...new Set(values)].sort(compareUtf8Bytes)

const collectFrozenSourceIds = (graph: ConfirmatoryManifestGraph) => ({
  interestRunIds: uniqueSorted(graph.themes.flatMap((theme) =>
    theme.forecast.forecastInterestRunId === null
      ? []
      : [theme.forecast.forecastInterestRunId])),
  newsObservationIds: uniqueSorted(graph.themes.flatMap(
    (theme) => theme.forecast.newsObservationIds,
  )),
  bablObservationIds: uniqueSorted(graph.themes.flatMap((theme) =>
    theme.study.bablObservationId === null ? [] : [theme.study.bablObservationId])),
})

const collectSelectedNewsRunIds = (input: {
  readonly graph: ConfirmatoryManifestGraph
  readonly observations: readonly NewsObservation[]
}): readonly string[] => {
  const themesByObservationId = new Map<string, Set<string>>()
  for (const theme of input.graph.themes) {
    for (const observationId of theme.forecast.newsObservationIds) {
      const themeIds = themesByObservationId.get(observationId) ?? new Set<string>()
      themeIds.add(theme.forecast.themeId)
      themesByObservationId.set(observationId, themeIds)
    }
  }
  return uniqueSorted(input.observations.flatMap((observation) =>
    themesByObservationId.get(observation.id)?.has(observation.themeId) === true
      ? [observation.collectionRunId]
      : []))
}

export async function loadConfirmatoryFeatureBatch(
  request: ConfirmatoryFeatureBatchRequest,
  dataSource: ConfirmatoryFeatureBatchDataSource,
): Promise<ConfirmatoryFeatureBatch> {
  const studyOriginManifestId = readStudyOriginManifestId(request)
  const bundle = await dataSource.loadStudyOriginBundle(studyOriginManifestId)
  if (bundle === null) {
    throw new ConfirmatoryFeatureBatchError(
      'STUDY_ORIGIN_NOT_FOUND',
      `Study-origin manifest was not found: ${studyOriginManifestId}`,
    )
  }

  const [studyThemes, forecast] = await Promise.all([
    dataSource.loadStudyThemeInputs(studyOriginManifestId),
    dataSource.loadForecastOriginManifest(bundle.forecastOriginManifestId),
  ])
  if (forecast === null) {
    throw new ConfirmatoryFeatureBatchError(
      'FORECAST_ORIGIN_NOT_FOUND',
      `Frozen forecast-origin manifest was not found: ${bundle.forecastOriginManifestId}`,
    )
  }
  const forecastThemes = await dataSource.loadForecastThemeInputs(forecast.id)
  const graph = validateConfirmatoryManifestGraph({
    requestedStudyOriginId: studyOriginManifestId,
    bundle,
    studyThemes,
    forecast,
    forecastThemes,
  })
  const frozenIds = collectFrozenSourceIds(graph)
  const [interestObservations, newsObservations, bablObservations] = await Promise.all([
    dataSource.loadInterestObservationsByRunIds(frozenIds.interestRunIds),
    dataSource.loadNewsObservationsByIds(frozenIds.newsObservationIds),
    dataSource.loadBablObservationsByIds(frozenIds.bablObservationIds),
  ])
  const selectedNewsRunIds = collectSelectedNewsRunIds({ graph, observations: newsObservations })
  const collectionRunIds = [...new Set([
    ...frozenIds.interestRunIds,
    ...selectedNewsRunIds,
  ])].sort(compareUtf8Bytes)
  const runs = await dataSource.loadCollectionRunsByIds(collectionRunIds)
  const snapshots = buildConfirmatorySnapshots({
    graph,
    runs,
    interestObservations,
    newsObservations,
    bablObservations,
  })

  return {
    studyOriginManifestId: bundle.id,
    studyOriginManifestSha256: bundle.payloadSha256,
    studyContractId: bundle.studyContract.id,
    studyContractSha256: bundle.studyContract.payloadSha256,
    featureContractVersion: bundle.studyContract.featureContractVersion,
    featureContractSha256: bundle.studyContract.featureContractSha256,
    forecastOriginManifestId: forecast.id,
    forecastOriginManifestSha256: forecast.payloadSha256,
    originDate: forecast.originDate,
    forecastCutoff: forecast.forecastCutoff,
    snapshots,
  }
}
