import { describe, expect, it } from 'vitest'

import { canonicalJsonV1Sha256, sha256OrderedJsonStringArray } from '@/lib/tli/canonical-json'
import {
  buildConfirmatoryFeatureVector,
  type ConfirmatoryFeatureInput,
  type ConfirmatoryFeatureSnapshot,
} from '@/lib/tli/features/build-confirmatory-features'
import { getKoreanTradingDateWindow } from '@/lib/tli/trading-calendar'

const BASE_DATE = '2026-07-06'
const CUTOFF_AT = '2026-07-06T09:00:00.000Z'
const THEME_ID = '10000000-0000-4000-8000-000000000011'
const INTEREST_RUN_ID = '20000000-0000-4000-8000-000000000011'
const NEWS_RUN_ID = '30000000-0000-4000-8000-000000000011'
const BABL_OBSERVATION_ID = '40000000-0000-4000-8000-000000000011'

const sha = (character: string): string => character.repeat(64)
const uuid = (prefix: string, index: number): string =>
  `${prefix}0000000-0000-4000-8000-${String(index).padStart(12, '0')}`

const tradingDates = getKoreanTradingDateWindow({
  baseDate: BASE_DATE,
  startOffset: -20,
  endOffset: 0,
})
const interestDates = tradingDates.slice(0, 20)
const newsDates = tradingDates.slice(-14)
const newsObservationIds = newsDates.map((_, index) => uuid('7', index + 101))
const NEWS_RESPONSE_SHA256 = sha('f')

const frozenInput = {
  studyOriginManifestId: '50000000-0000-4000-8000-000000000011',
  studyOriginManifestSha256: sha('a'),
  studyContractId: '51000000-0000-4000-8000-000000000011',
  studyContractSha256: sha('b'),
  featureContractVersion: 'tli-attention-v2-f1',
  featureContractSha256: sha('c'),
  forecastOriginManifestId: '52000000-0000-4000-8000-000000000011',
  forecastOriginManifestSha256: sha('d'),
  themeId: THEME_ID,
  baseDate: BASE_DATE,
  cutoffAt: CUTOFF_AT,
  interestRun: {
    id: INTEREST_RUN_ID,
    responseSha256: sha('e'),
    status: 'complete',
    sourceMaxDate: interestDates.at(-1) ?? BASE_DATE,
    completedAt: '2026-07-06T08:30:00.000Z',
  },
  interestObservations: interestDates.map((tradingDate, index) => ({
    id: uuid('8', index + 101),
    collectionRunId: INTEREST_RUN_ID,
    themeId: THEME_ID,
    tradingDate,
    rawValue: index + 10,
    normalized: 900 - index,
    anchorScaledValue: 9_000 - index,
  })),
  newsObservationIds,
  newsInputSha256: sha256OrderedJsonStringArray(newsObservationIds),
  newsObservations: newsDates.map((articleDate, index) => ({
    id: uuid('7', index + 101),
    collectionRunId: NEWS_RUN_ID,
    themeId: THEME_ID,
    articleDate,
    articleCount: index,
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
  bablInputSha256: sha('1'),
  bablCandidatePool: 'archetype',
  bablMissingReason: null,
  bablObservation: {
    id: BABL_OBSERVATION_ID,
    collectionRunId: '41000000-0000-4000-8000-000000000011',
    themeId: THEME_ID,
    snapshotDate: BASE_DATE,
    phase: 'rising',
    algorithmVersion: 'b-abl-v4',
    comparisonSpecVersion: 'comparison-v4-spec-v1',
    evaluationHorizonDays: 14,
    candidatePool: 'archetype',
    sourcePredictionSnapshotId: '42000000-0000-4000-8000-000000000011',
    computedAt: '2026-07-06T08:50:00.000Z',
    payloadHash: sha('1'),
    sourceRunStatus: 'complete',
  },
} satisfies ConfirmatoryFeatureInput

type SelectionKey<Key> = Key extends string
  ? Lowercase<Key> extends `${string}cycle${string}` | `${string}runtime${string}` | `${string}latest${string}`
    ? Key
    : never
  : never

type DeepSelectionKey<Value> = Value extends readonly (infer Item)[]
  ? DeepSelectionKey<Item>
  : Value extends object
    ? { [Key in keyof Value]: SelectionKey<Key> | DeepSelectionKey<Value[Key]> }[keyof Value]
    : never

type LeakedSelectionKey = DeepSelectionKey<ConfirmatoryFeatureInput>
const PURE_INPUT_SELECTION_SENTINEL: [LeakedSelectionKey] extends [never] ? true : false = true

type SnapshotConsumers = {
  readonly dataset: ConfirmatoryFeatureSnapshot
  readonly outerFold: ConfirmatoryFeatureSnapshot
  readonly power: ConfirmatoryFeatureSnapshot
  readonly fullFit: ConfirmatoryFeatureSnapshot
  readonly cycle: ConfirmatoryFeatureSnapshot
}

describe('buildConfirmatoryFeatureVector provenance contract', () => {
  it('exposes canonical frozen provenance in one reusable dataset/fold/cycle snapshot', () => {
    // Given: a study-origin input whose source identities were frozen before the outcome.

    // When: the pure builder creates the feature snapshot.
    const result = buildConfirmatoryFeatureVector(frozenInput)
    const consumers = {
      dataset: result,
      outerFold: result,
      power: result,
      fullFit: result,
      cycle: result,
    } satisfies SnapshotConsumers
    const { featureSnapshotSha256, ...canonicalSnapshot } = result

    // Then: every downstream consumer receives the exact identities, source ages, and canonical hash.
    expect(result.provenance).toEqual({
      studyOriginManifestId: frozenInput.studyOriginManifestId,
      studyOriginManifestSha256: frozenInput.studyOriginManifestSha256,
      studyContractId: frozenInput.studyContractId,
      studyContractSha256: frozenInput.studyContractSha256,
      featureContractVersion: frozenInput.featureContractVersion,
      featureContractSha256: frozenInput.featureContractSha256,
      forecastOriginManifestId: frozenInput.forecastOriginManifestId,
      forecastOriginManifestSha256: frozenInput.forecastOriginManifestSha256,
      themeId: THEME_ID,
      baseDate: BASE_DATE,
      cutoffAt: CUTOFF_AT,
      interestRunId: INTEREST_RUN_ID,
      interestResponseSha256: frozenInput.interestRun.responseSha256,
      interestSourceMaxDate: frozenInput.interestRun.sourceMaxDate,
      interestSourceAgeDays: 1,
      newsObservationIds,
      newsInputSha256: frozenInput.newsInputSha256,
      newsSourceMaxDate: BASE_DATE,
      newsSourceAgeDays: 0,
      newsRunIds: [NEWS_RUN_ID],
      newsRunResponseSha256s: [NEWS_RESPONSE_SHA256],
      bablObservationId: BABL_OBSERVATION_ID,
      bablInputSha256: frozenInput.bablInputSha256,
      bablCandidatePool: frozenInput.bablCandidatePool,
    })
    expect(featureSnapshotSha256).toMatch(/^[0-9a-f]{64}$/)
    expect(featureSnapshotSha256).toBe(canonicalJsonV1Sha256(canonicalSnapshot))
    expect(Object.values(consumers).every((snapshot) => snapshot === result)).toBe(true)
  })

  it('keeps the vector and hash immutable when unreferenced backfill and cutoff-plus-one rows appear', () => {
    // Given: a frozen snapshot plus later rows whose run/observation IDs are absent from its manifest.
    const frozen = buildConfirmatoryFeatureVector(frozenInput)

    // When: an apparent pre-cutoff backfill and cutoff+1s news row are present in the candidate pools.
    const withNoise = buildConfirmatoryFeatureVector({
      ...frozenInput,
      interestObservations: [
        ...frozenInput.interestObservations,
        {
          id: '90000000-0000-4000-8000-000000000011',
          collectionRunId: '91000000-0000-4000-8000-000000000011',
          themeId: THEME_ID,
          tradingDate: frozenInput.interestRun.sourceMaxDate,
          rawValue: 999_999,
          normalized: 999_999,
          anchorScaledValue: 999_999,
        },
      ],
      newsObservations: [
        ...frozenInput.newsObservations,
        {
          id: '92000000-0000-4000-8000-000000000011',
          collectionRunId: '93000000-0000-4000-8000-000000000011',
          themeId: THEME_ID,
          articleDate: BASE_DATE,
          articleCount: 999_999,
          queryHash: sha('8'),
          collectedAt: '2026-07-06T09:00:01.000Z',
        },
      ],
    })

    // Then: source-ID selection makes both the scientific vector and its content address immutable.
    expect(withNoise.values).toEqual(frozen.values)
    expect(withNoise.provenance).toEqual(frozen.provenance)
    expect(withNoise.featureSnapshotSha256).toBe(frozen.featureSnapshotSha256)
  })

  it('changes the feature hash when a frozen provenance hash changes', () => {
    // Given: two otherwise identical frozen source snapshots.
    const original = buildConfirmatoryFeatureVector(frozenInput)

    // When: the immutable forecast-manifest content hash differs.
    const changed = buildConfirmatoryFeatureVector({
      ...frozenInput,
      forecastOriginManifestSha256: sha('0'),
    })

    // Then: the vector stays scientific-data equivalent, but its provenance-bound hash changes.
    expect(changed.values).toEqual(original.values)
    expect(changed.provenance.forecastOriginManifestSha256).toBe(sha('0'))
    expect(changed.featureSnapshotSha256).not.toBe(original.featureSnapshotSha256)
  })

  it('has no cycle, runtime, or latest-selection input surface', () => {
    // Given: the exported pure input type and a runtime fixture matching that type.

    // When: compile-time deep keys and runtime object keys are inspected.
    const runtimeSelectionKeys = JSON.stringify(frozenInput).match(/"[^"]*(?:cycle|runtime|latest)[^"]*":/gi)

    // Then: neither the input shape nor a second selector argument can choose data after freezing.
    expect(PURE_INPUT_SELECTION_SENTINEL).toBe(true)
    expect(runtimeSelectionKeys).toBeNull()
    expect(buildConfirmatoryFeatureVector).toHaveLength(1)
  })
})
