import { compareUtf8Bytes } from '@/lib/tli/canonical-json'
import {
  buildConfirmatoryFeatureVector,
  type ConfirmatoryFeatureInput,
  type ConfirmatoryFeatureSnapshot,
  type ConfirmatoryInterestRun,
  type ConfirmatoryNewsRun,
} from '@/lib/tli/features/build-confirmatory-features'

import type {
  BablObservation,
  CollectionRun,
  ForecastOriginManifest,
  ForecastThemeInput,
  InterestObservation,
  NewsObservation,
  StudyOriginBundle,
  StudyThemeInput,
} from './load-confirmatory-feature-inputs'

export type ConfirmatoryFeatureBatchErrorCode = 'INVALID_REQUEST' | 'STUDY_ORIGIN_NOT_FOUND'
  | 'FORECAST_ORIGIN_NOT_FOUND' | 'MANIFEST_INCONSISTENT'

export class ConfirmatoryFeatureBatchError extends Error {
  readonly name = 'ConfirmatoryFeatureBatchError'

  constructor(
    readonly code: ConfirmatoryFeatureBatchErrorCode,
    message: string,
  ) {
    super(message)
  }
}

export type ConfirmatoryThemeBinding = {
  readonly study: StudyThemeInput
  readonly forecast: ForecastThemeInput
}

export type ConfirmatoryManifestGraph = {
  readonly bundle: StudyOriginBundle
  readonly forecast: ForecastOriginManifest
  readonly themes: readonly ConfirmatoryThemeBinding[]
}

const inconsistent = (message: string): never => {
  throw new ConfirmatoryFeatureBatchError('MANIFEST_INCONSISTENT', message)
}

const uniqueSorted = (values: readonly string[]): readonly string[] => [...new Set(values)].sort(compareUtf8Bytes)

const hasValidBablShape = (input: StudyThemeInput): boolean => {
  const hasObservation = input.bablObservationId !== null
    && input.bablInputSha256 !== null
    && input.bablCandidatePool !== null
    && input.bablMissingReason === null
  const isMissing = input.bablObservationId === null
    && input.bablInputSha256 === null
    && input.bablCandidatePool === null
    && input.bablMissingReason !== null
  return hasObservation || isMissing
}

const hasValidForecastShape = (input: ForecastThemeInput): boolean => {
  const isUsable = input.inputStatus === 'usable'
    && input.forecastInterestRunId !== null
    && input.forecastInterestResponseSha256 !== null
    && input.newsInputSha256 !== null
    && input.abstainReason === null
  const isAbstain = input.inputStatus === 'abstain'
    && input.forecastInterestRunId === null
    && input.forecastInterestResponseSha256 === null
    && input.newsObservationIds.length === 0
    && input.newsInputSha256 === null
    && input.abstainReason !== null
  return input.keywordGroupSha256.length > 0 && (isUsable || isAbstain)
}

const hasValidForecastTime = (forecast: ForecastOriginManifest): boolean => {
  const origin = Date.parse(`${forecast.originDate}T00:00:00.000Z`)
  const cutoff = Date.parse(forecast.forecastCutoff)
  return /^\d{4}-\d{2}-\d{2}$/.test(forecast.originDate)
    && Number.isFinite(origin)
    && new Date(origin).toISOString().slice(0, 10) === forecast.originDate
    && Number.isFinite(cutoff)
    && cutoff === origin + 9 * 60 * 60 * 1_000
}

export function validateConfirmatoryManifestGraph(input: {
  readonly requestedStudyOriginId: string
  readonly bundle: StudyOriginBundle
  readonly studyThemes: readonly StudyThemeInput[]
  readonly forecast: ForecastOriginManifest
  readonly forecastThemes: readonly ForecastThemeInput[]
}): ConfirmatoryManifestGraph {
  const { bundle, forecast } = input
  const expectedIds = forecast.expectedThemeIds
  if (
    bundle.id !== input.requestedStudyOriginId
    || bundle.forecastOriginManifestId !== forecast.id
    || bundle.studyContract.featureContractVersion !== 'tli-attention-v2-f1'
    || !hasValidForecastTime(forecast)
    || !Number.isSafeInteger(forecast.expectedThemeCount)
    || forecast.expectedThemeCount <= 0
    || forecast.expectedThemeCount !== expectedIds.length
    || new Set(expectedIds).size !== expectedIds.length
  ) {
    inconsistent('Confirmatory parent manifests are inconsistent')
  }

  const studyByTheme = new Map<string, StudyThemeInput>()
  for (const child of input.studyThemes) {
    if (
      child.studyOriginManifestId !== bundle.id
      || studyByTheme.has(child.themeId)
      || !hasValidBablShape(child)
    ) {
      inconsistent('Confirmatory study-theme children are inconsistent')
    }
    studyByTheme.set(child.themeId, child)
  }

  const forecastByTheme = new Map<string, ForecastThemeInput>()
  for (const child of input.forecastThemes) {
    if (
      child.forecastOriginManifestId !== forecast.id
      || forecastByTheme.has(child.themeId)
      || !hasValidForecastShape(child)
    ) {
      inconsistent('Confirmatory forecast-theme children are inconsistent')
    }
    forecastByTheme.set(child.themeId, child)
  }

  if (studyByTheme.size !== expectedIds.length || forecastByTheme.size !== expectedIds.length) {
    inconsistent('Confirmatory theme counts do not match the frozen parent')
  }

  const themes: ConfirmatoryThemeBinding[] = []
  for (const themeId of [...expectedIds].sort(compareUtf8Bytes)) {
    const study = studyByTheme.get(themeId)
      ?? inconsistent('Confirmatory theme sets do not match the frozen parent')
    const themeForecast = forecastByTheme.get(themeId)
      ?? inconsistent('Confirmatory theme sets do not match the frozen parent')
    themes.push({ study, forecast: themeForecast })
  }
  return { bundle, forecast, themes }
}

const singleMatching = <T>(
  values: readonly T[],
  matches: (value: T) => boolean,
): T | null => {
  const selected = values.filter(matches)
  return selected.length === 1 ? selected.at(0) ?? null : null
}

const isAtOrBefore = (value: string, cutoff: string): boolean => {
  const timestamp = Date.parse(value)
  const cutoffTimestamp = Date.parse(cutoff)
  return Number.isFinite(timestamp)
    && Number.isFinite(cutoffTimestamp)
    && timestamp <= cutoffTimestamp
}

const resolveInterestRun = (input: {
  readonly binding: ConfirmatoryThemeBinding
  readonly runs: readonly CollectionRun[]
  readonly cutoff: string
}): ConfirmatoryInterestRun | null => {
  const runId = input.binding.forecast.forecastInterestRunId
  const responseSha = input.binding.forecast.forecastInterestResponseSha256
  if (runId === null || responseSha === null) return null
  const run = singleMatching(input.runs, (candidate) => candidate.id === runId)
  if (
    run === null
    || run.source !== 'naver_datalab'
    || run.responseSha256 !== responseSha
    || run.keywordGroupHash !== input.binding.forecast.keywordGroupSha256
    || run.sourceMaxDate === null
    || !isAtOrBefore(run.collectedAt, input.cutoff)
  ) return null
  return {
    id: run.id,
    responseSha256: responseSha,
    status: run.status,
    sourceMaxDate: run.sourceMaxDate,
    completedAt: run.completedAt,
  }
}

const resolveNewsRuns = (input: {
  readonly binding: ConfirmatoryThemeBinding
  readonly observations: readonly NewsObservation[]
  readonly runs: readonly CollectionRun[]
}): readonly ConfirmatoryNewsRun[] => uniqueSorted(input.observations.map(
  (observation) => observation.collectionRunId,
)).flatMap((runId) => {
  const run = singleMatching(input.runs, (candidate) => candidate.id === runId)
  if (
    run === null
    || run.source !== 'naver_news'
    || run.responseSha256 === null
    || run.keywordGroupHash !== input.binding.forecast.keywordGroupSha256
    || run.sourceMaxDate === null
  ) return []
  return [{
    id: run.id,
    responseSha256: run.responseSha256,
    status: run.status,
    sourceMaxDate: run.sourceMaxDate,
    collectedAt: run.collectedAt,
    completedAt: run.completedAt,
  }]
})

export function buildConfirmatorySnapshots(input: {
  readonly graph: ConfirmatoryManifestGraph
  readonly runs: readonly CollectionRun[]
  readonly interestObservations: readonly InterestObservation[]
  readonly newsObservations: readonly NewsObservation[]
  readonly bablObservations: readonly BablObservation[]
}): readonly ConfirmatoryFeatureSnapshot[] {
  const { bundle, forecast } = input.graph
  return input.graph.themes.map((binding) => {
    const frozenInterestId = binding.forecast.forecastInterestRunId
    const interestObservations = input.interestObservations.filter((row) =>
      row.collectionRunId === frozenInterestId && row.themeId === binding.forecast.themeId)
    const newsObservations = input.newsObservations.filter((row) =>
      row.themeId === binding.forecast.themeId
      && binding.forecast.newsObservationIds.includes(row.id)
      && row.queryHash === binding.forecast.keywordGroupSha256)
    const bablObservation = binding.study.bablObservationId === null
      ? null
      : singleMatching(input.bablObservations, (row) =>
          row.id === binding.study.bablObservationId
          && row.themeId === binding.study.themeId)
    const builderInput = {
      studyOriginManifestId: bundle.id,
      studyOriginManifestSha256: bundle.payloadSha256,
      studyContractId: bundle.studyContract.id,
      studyContractSha256: bundle.studyContract.payloadSha256,
      featureContractVersion: bundle.studyContract.featureContractVersion,
      featureContractSha256: bundle.studyContract.featureContractSha256,
      forecastOriginManifestId: forecast.id,
      forecastOriginManifestSha256: forecast.payloadSha256,
      themeId: binding.forecast.themeId,
      baseDate: forecast.originDate,
      cutoffAt: forecast.forecastCutoff,
      interestRun: resolveInterestRun({ binding, runs: input.runs, cutoff: forecast.forecastCutoff }),
      interestObservations,
      newsObservationIds: binding.forecast.newsObservationIds,
      newsInputSha256: binding.forecast.newsInputSha256,
      newsObservations,
      newsRuns: resolveNewsRuns({ binding, observations: newsObservations, runs: input.runs }),
      bablLock: {
        algorithmVersion: bundle.studyContract.bablAlgorithmVersion,
        comparisonSpecVersion: bundle.studyContract.bablComparisonSpecVersion,
        evaluationHorizonDays: bundle.studyContract.bablEvaluationHorizonDays,
        candidatePoolRule: bundle.studyContract.bablCandidatePoolRule,
      },
      bablObservationId: binding.study.bablObservationId,
      bablInputSha256: binding.study.bablInputSha256,
      bablCandidatePool: binding.study.bablCandidatePool,
      bablMissingReason: binding.study.bablMissingReason,
      bablObservation,
    } satisfies ConfirmatoryFeatureInput
    return buildConfirmatoryFeatureVector(builderInput)
  })
}
