import { sha256OrderedJsonStringArray } from '../../../lib/tli/canonical-json'
import type { ConfirmatoryFeatureInput } from '../../../lib/tli/features/build-confirmatory-features'
import { getKoreanTradingDateWindow } from '../../../lib/tli/trading-calendar'
import type { FixtureOriginRef, FixtureOriginStack } from './fixture-origins'
import {
  deterministicUuid,
  FEATURE_CONTRACT_SHA256,
  FEATURE_CONTRACT_VERSION,
  sha256Identity,
  signalForTheme,
  STUDY_CONTRACT_ID,
} from './fixture-identities'

export type FixtureSignalMode = 'known_signal' | 'no_signal'

const timestamp = (date: string, hour: string): string => `${date}T${hour}:00:00.000Z`

export function buildFixtureFeatureInput(input: {
  readonly stack: FixtureOriginStack
  readonly origin: FixtureOriginRef
  readonly themeId: string
  readonly mode: FixtureSignalMode
}): ConfirmatoryFeatureInput {
  const signal = input.mode === 'known_signal' ? signalForTheme(input.themeId) : 0
  const identity = `${input.origin.originDate}:${input.themeId}`
  const interestRunId = deterministicUuid('feature-interest-run', identity)
  const newsRunId = deterministicUuid('feature-news-run', identity)
  const interestDates = getKoreanTradingDateWindow({
    baseDate: input.origin.originDate,
    startOffset: -19,
    endOffset: 0,
  })
  const newsDates = getKoreanTradingDateWindow({
    baseDate: input.origin.originDate,
    startOffset: -13,
    endOffset: 0,
  })
  const newsObservationIds = newsDates.map((_date, index) => (
    deterministicUuid('feature-news-observation', `${identity}:${index}`)
  ))
  const bablObservationId = deterministicUuid('feature-babl-observation', identity)
  const bablInputSha256 = sha256Identity('feature-babl-input', identity)
  return {
    studyOriginManifestId: input.origin.studyOriginManifestId,
    studyOriginManifestSha256: input.origin.studyOriginManifestSha256,
    studyContractId: STUDY_CONTRACT_ID,
    studyContractSha256: input.stack.studyContractSha256,
    featureContractVersion: FEATURE_CONTRACT_VERSION,
    featureContractSha256: FEATURE_CONTRACT_SHA256,
    forecastOriginManifestId: input.origin.forecastManifestId,
    forecastOriginManifestSha256: input.origin.forecastManifestSha256,
    themeId: input.themeId,
    baseDate: input.origin.originDate,
    cutoffAt: input.origin.forecastCutoff,
    interestRun: {
      id: interestRunId,
      responseSha256: sha256Identity('feature-interest-response', identity),
      status: 'complete',
      sourceMaxDate: input.origin.originDate,
      completedAt: timestamp(input.origin.originDate, '08'),
    },
    interestObservations: interestDates.map((tradingDate, index) => ({
      id: deterministicUuid('feature-interest-observation', `${identity}:${index}`),
      collectionRunId: interestRunId,
      themeId: input.themeId,
      tradingDate,
      rawValue: 100 + signal * (index + 1),
      normalized: 0,
      anchorScaledValue: null,
    })),
    newsObservationIds,
    newsInputSha256: sha256OrderedJsonStringArray(newsObservationIds),
    newsObservations: newsDates.map((articleDate, index) => ({
      id: newsObservationIds[index] ?? deterministicUuid('unreachable-news', index),
      collectionRunId: newsRunId,
      themeId: input.themeId,
      articleDate,
      articleCount: 20 + Math.round(signal * 2) * (index < 7 ? 0 : 1),
      queryHash: sha256Identity('feature-news-query', identity),
      collectedAt: timestamp(input.origin.originDate, '08'),
    })),
    newsRuns: [{
      id: newsRunId,
      responseSha256: sha256Identity('feature-news-response', identity),
      status: 'complete',
      sourceMaxDate: input.origin.originDate,
      collectedAt: timestamp(input.origin.originDate, '08'),
      completedAt: `${input.origin.originDate}T08:30:00.000Z`,
    }],
    bablLock: {
      algorithmVersion: 'b-abl-v4',
      comparisonSpecVersion: 'comparison-v4-spec-v1',
      evaluationHorizonDays: 14,
      candidatePoolRule: 'source_prod_run_v1',
    },
    bablObservationId,
    bablInputSha256,
    bablCandidatePool: 'archetype',
    bablMissingReason: null,
    bablObservation: {
      id: bablObservationId,
      collectionRunId: deterministicUuid('feature-babl-run', identity),
      themeId: input.themeId,
      snapshotDate: input.origin.originDate,
      phase: 'sideways',
      algorithmVersion: 'b-abl-v4',
      comparisonSpecVersion: 'comparison-v4-spec-v1',
      evaluationHorizonDays: 14,
      candidatePool: 'archetype',
      sourcePredictionSnapshotId: deterministicUuid('feature-babl-snapshot', identity),
      computedAt: `${input.origin.originDate}T08:40:00.000Z`,
      payloadHash: bablInputSha256,
      sourceRunStatus: 'complete',
    },
  }
}

export const buildFixtureOutcome = (themeId: string): boolean => signalForTheme(themeId) > 0
