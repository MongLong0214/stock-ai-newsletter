import { describe, expect, it } from 'vitest'

import { sha256Hex, sha256OrderedJsonStringArray } from '@/lib/tli/canonical-json'
import {
  buildConfirmatoryFeatureVector,
  type ConfirmatoryFeatureInput,
  type ConfirmatoryInterestObservation,
  type ConfirmatoryInterestRun,
  type ConfirmatoryNewsObservation,
} from '@/lib/tli/features/build-confirmatory-features'
import { addKoreanTradingDays, getKoreanTradingDateWindow } from '@/lib/tli/trading-calendar'

const BASE_DATE = '2026-07-06'
const CUTOFF_AT = '2026-07-06T09:00:00.000Z'
const THEME_ID = '10000000-0000-4000-8000-000000000021'
const INTEREST_RUN_ID = '20000000-0000-4000-8000-000000000021'
const OTHER_RUN_ID = '21000000-0000-4000-8000-000000000021'
const NEWS_RUN_ID = '30000000-0000-4000-8000-000000000021'
const INTEREST_DATES = getKoreanTradingDateWindow({
  baseDate: BASE_DATE,
  startOffset: -20,
  endOffset: -1,
})
const NEWS_DATES = getKoreanTradingDateWindow({
  baseDate: BASE_DATE,
  startOffset: -13,
  endOffset: 0,
})
const NEWS_IDS = NEWS_DATES.map((_, index) => `news-interest-${index + 1}`)
const EXPECTED_INTEREST_VALUES = [
  1 / 17,
  1 / 19 - 1 / 17,
  1,
  Math.log(2),
  0,
] as const

const makeInterestRows = (options: {
  readonly dates?: readonly string[]
  readonly runId?: string
  readonly rawValues?: readonly number[]
} = {}): readonly ConfirmatoryInterestObservation[] => {
  const dates = options.dates ?? INTEREST_DATES
  return dates.map((tradingDate, index) => ({
    id: `${options.runId ?? INTEREST_RUN_ID}-interest-${index + 1}`,
    collectionRunId: options.runId ?? INTEREST_RUN_ID,
    themeId: THEME_ID,
    tradingDate,
    rawValue: options.rawValues?.[index] ?? index + 1,
    normalized: 900 - index,
    anchorScaledValue: 9_000 - index,
  }))
}

const newsObservations = NEWS_DATES.map((articleDate, index) => ({
  id: `news-interest-${index + 1}`,
  collectionRunId: NEWS_RUN_ID,
  themeId: THEME_ID,
  articleDate,
  articleCount: index + 1,
  queryHash: sha256Hex('interest-keyword-group'),
  collectedAt: '2026-07-06T08:45:00.000Z',
})) satisfies readonly ConfirmatoryNewsObservation[]

const interestRun = {
  id: INTEREST_RUN_ID,
  responseSha256: sha256Hex('interest-response'),
  status: 'complete',
  sourceMaxDate: addKoreanTradingDays(BASE_DATE, -1),
  completedAt: '2026-07-06T08:30:00.000Z',
} satisfies ConfirmatoryInterestRun

const makeInput = (
  overrides: Partial<ConfirmatoryFeatureInput> = {},
): ConfirmatoryFeatureInput => ({
  studyOriginManifestId: 'study-origin-interest',
  studyOriginManifestSha256: sha256Hex('study-origin-interest'),
  studyContractId: 'study-contract-interest',
  studyContractSha256: sha256Hex('study-contract-interest'),
  featureContractVersion: 'tli-attention-v2-f1',
  featureContractSha256: sha256Hex('feature-contract-interest'),
  forecastOriginManifestId: 'forecast-origin-interest',
  forecastOriginManifestSha256: sha256Hex('forecast-origin-interest'),
  themeId: THEME_ID,
  baseDate: BASE_DATE,
  cutoffAt: CUTOFF_AT,
  interestRun,
  interestObservations: makeInterestRows(),
  newsObservationIds: NEWS_IDS,
  newsInputSha256: sha256OrderedJsonStringArray(NEWS_IDS),
  newsObservations,
  newsRuns: [{
    id: NEWS_RUN_ID,
    responseSha256: sha256Hex('news-response-interest'),
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
  bablObservationId: null,
  bablInputSha256: null,
  bablCandidatePool: null,
  bablMissingReason: 'no_matching_observation',
  bablObservation: null,
  ...overrides,
})

describe('confirmatory interest calendar and freshness', () => {
  it('preserves a missing KOSPI slot and refuses to fill it from another run', () => {
    // Given: one frozen run missing a recent required date plus an exact-date row from another run.
    const missingDate = addKoreanTradingDays(BASE_DATE, -3)
    const frozenRows = makeInterestRows().filter((row) => row.tradingDate !== missingDate)
    const otherRunRow = makeInterestRows({
      dates: [missingDate],
      runId: OTHER_RUN_ID,
      rawValues: [999_999],
    })

    // When: the builder reindexes the frozen run to the exact twenty Korean trading slots.
    const result = buildConfirmatoryFeatureVector(makeInput({
      interestObservations: [...frozenRows, ...otherRunRow],
    }))

    // Then: the gap remains missing instead of being compressed or stitched.
    expect(result.abstain).toBe(true)
    expect(result.values[0]).toBe(0)
    expect(result.missingFlags[0]).toBe(true)
  })

  it('abstains when the frozen interest run has fewer than twenty observations', () => {
    // Given: only nineteen rows belonging to the frozen run.
    const input = makeInput({ interestObservations: makeInterestRows().slice(1) })

    // When: the builder checks primary-source completeness.
    const result = buildConfirmatoryFeatureVector(input)

    // Then: an incomplete interest history is not eligible for a confirmatory vector.
    expect(result.abstain).toBe(true)
  })

  it('abstains when interest source age is greater than one trading day', () => {
    // Given: an exact twenty-slot run ending two Korean trading days before the base date.
    const staleDates = getKoreanTradingDateWindow({
      baseDate: BASE_DATE,
      startOffset: -21,
      endOffset: -2,
    })
    const input = makeInput({
      interestRun: { ...interestRun, sourceMaxDate: addKoreanTradingDays(BASE_DATE, -2) },
      interestObservations: makeInterestRows({ dates: staleDates }),
    })

    // When: the builder measures freshness against the base-date KOSPI calendar.
    const result = buildConfirmatoryFeatureVector(input)

    // Then: age two is retained as provenance but fails the primary-source freshness gate.
    expect(result.provenance.interestSourceAgeDays).toBe(2)
    expect(result.values[8]).toBe(2)
    expect(result.abstain).toBe(true)
  })

  it('abstains when the frozen interest source completes one second after cutoff', () => {
    // Given: an otherwise exact source whose terminal timestamp is cutoff plus one second.
    const input = makeInput({
      interestRun: { ...interestRun, completedAt: '2026-07-06T09:00:01.000Z' },
    })

    // When: the PIT cutoff is enforced.
    const result = buildConfirmatoryFeatureVector(input)

    // Then: post-cutoff source bytes are ineligible.
    expect(result.abstain).toBe(true)
  })

  it.each([
    ['calendar-impossible canonical-looking timestamp', '2026-02-30T00:00:00.000Z'],
    ['zone-less timestamp', '2026-07-06T08:20:00'],
  ] as const)('abstains for a %s', (_, completedAt) => {
    // Given: an interest run whose completion timestamp is not canonical RFC 3339 UTC.
    const input = makeInput({ interestRun: { ...interestRun, completedAt } })

    // When: the source timestamp crosses the confirmatory boundary.
    const result = buildConfirmatoryFeatureVector(input)

    // Then: parseable-but-noncanonical timestamps cannot make a primary source eligible.
    expect(result.abstain).toBe(true)
  })

  it('abstains without emitting a malformed interest response hash as provenance', () => {
    // Given: an otherwise complete run whose response identity is not lowercase SHA-256.
    const input = makeInput({
      interestRun: { ...interestRun, responseSha256: 'not-a-sha256' },
    })

    // When: the primary interest source is resolved.
    const result = buildConfirmatoryFeatureVector(input)

    // Then: the source fails closed and its malformed identity is absent from output provenance.
    expect({
      abstain: result.abstain,
      provenanceHash: result.provenance.interestResponseSha256,
    }).toEqual({ abstain: true, provenanceHash: null })
  })

  it('accepts a canonical millisecond UTC completion exactly at cutoff', () => {
    // Given: a complete run whose canonical .sssZ timestamp equals the immutable cutoff.
    const input = makeInput({
      interestRun: { ...interestRun, completedAt: CUTOFF_AT },
    })

    // When: the inclusive PIT boundary is evaluated.
    const result = buildConfirmatoryFeatureVector(input)

    // Then: the canonical boundary remains eligible and retains its valid response identity.
    expect(result.abstain).toBe(false)
    expect(result.provenance.interestResponseSha256).toBe(interestRun.responseSha256)
  })

  it('abstains and marks interest slots missing when the frozen source is absent', () => {
    // Given: the manifest has no usable primary interest run.
    const input = makeInput({ interestRun: null, interestObservations: [] })

    // When: the builder assembles the source-bound vector.
    const result = buildConfirmatoryFeatureVector(input)

    // Then: missing primary interest fails closed and uses finite missing placeholders.
    expect(result.abstain).toBe(true)
    expect(result.values[8]).toBe(0)
    expect(result.missingFlags.slice(0, 5)).toEqual([true, true, true, true, true])
    expect(result.missingFlags[8]).toBe(true)
  })

  it('converts nonfinite slope and drawdown results to zero plus missing flags', () => {
    // Given: twenty dated rows with one nonfinite raw value in both formula windows.
    const rawValues = INTEREST_DATES.map((_, index) => (
      index === INTEREST_DATES.length - 2 ? Number.POSITIVE_INFINITY : index + 1
    ))

    // When: the raw-interest formulas are evaluated.
    const result = buildConfirmatoryFeatureVector(makeInput({
      interestObservations: makeInterestRows({ rawValues }),
    }))

    // Then: nonfinite outputs never cross the feature boundary.
    expect(result.values[0]).toBe(0)
    expect(result.values[4]).toBe(0)
    expect(result.missingFlags[0]).toBe(true)
    expect(result.missingFlags[4]).toBe(true)
    expect(result.abstain).toBe(false)
  })

  it('marks a twenty-day all-zero drawdown missing while primary sources remain present', () => {
    // Given: an exact frozen interest history whose twenty raw values are all zero.
    const rawValues = INTEREST_DATES.map(() => 0)

    // When: the max-zero drawdown boundary is evaluated with both primary sources present.
    const result = buildConfirmatoryFeatureVector(makeInput({
      interestObservations: makeInterestRows({ rawValues }),
    }))

    // Then: drawdown uses a finite placeholder and missing flag without source abstention.
    expect(result.values[4]).toBe(0)
    expect(result.missingFlags[4]).toBe(true)
    expect(result.provenance.interestRunId).toBe(INTEREST_RUN_ID)
    expect(result.provenance.newsObservationIds).toEqual(NEWS_IDS)
    expect(result.abstain).toBe(false)
  })

  it('ignores normalized and anchor-scaled diagnostics in every interest formula', () => {
    // Given: raw values 1..20 paired with hostile diagnostic scales.
    const observations = makeInterestRows().map((row, index) => ({
      ...row,
      normalized: index % 2 === 0 ? Number.NaN : Number.POSITIVE_INFINITY,
      anchorScaledValue: index % 2 === 0 ? -1e30 : 1e30,
    }))

    // When: confirmatory interest features are built.
    const result = buildConfirmatoryFeatureVector(makeInput({ interestObservations: observations }))

    // Then: only raw_value determines the five preregistered interest formulas.
    expect(result.values.slice(0, 5)).toEqual(EXPECTED_INTEREST_VALUES)
    expect(result.missingFlags.slice(0, 5)).toEqual([false, false, false, false, false])
    expect(result.abstain).toBe(false)
  })

  it('reads only frozen-run rows when a differently scaled complete run is also loaded', () => {
    // Given: exact frozen rows plus another run covering all dates at a radically different scale.
    const otherRunRows = makeInterestRows({
      runId: OTHER_RUN_ID,
      rawValues: INTEREST_DATES.map((_, index) => 1_000_000 + index * 10_000),
    })

    // When: the pure assembly receives the batched row pool.
    const result = buildConfirmatoryFeatureVector(makeInput({
      interestObservations: [...makeInterestRows(), ...otherRunRows],
    }))

    // Then: no mixed-run or latest-run selection changes the frozen scientific vector.
    expect(result.values.slice(0, 5)).toEqual(EXPECTED_INTEREST_VALUES)
    expect(result.provenance.interestRunId).toBe(INTEREST_RUN_ID)
    expect(result.abstain).toBe(false)
  })
})
