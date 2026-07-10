import {
  compareUtf8Bytes,
  sha256OrderedJsonStringArray,
} from '@/lib/tli/canonical-json'
import {
  countKoreanTradingDaysBetween,
  getKoreanTradingDateWindow,
} from '@/lib/tli/trading-calendar'

import {
  isCanonicalSha256,
  isCanonicalTimestampAtOrBefore,
} from './confirmatory-feature-canonical'
import type {
  ConfirmatoryBablObservation,
  ConfirmatoryFeatureInput,
  ConfirmatoryNewsObservation,
  ConfirmatoryNewsRun,
} from './confirmatory-feature-types'

export type ResolvedInterestSource = {
  readonly rawValues: readonly (number | null)[]
  readonly sourceAgeDays: number | null
  readonly runId: string | null
  readonly responseSha256: string | null
  readonly sourceMaxDate: string | null
  readonly abstainReasons: readonly string[]
}

export type ResolvedNewsSource = {
  readonly articleCounts: readonly (number | null)[]
  readonly sourceMaxDate: string | null
  readonly sourceAgeDays: number | null
  readonly runIds: readonly string[]
  readonly runResponseSha256s: readonly string[]
  readonly abstainReasons: readonly string[]
}

export type ResolvedBablSource = {
  readonly value: number
  readonly missing: boolean
}

type ResolvedNewsRuns = {
  readonly sourceMaxDate: string
  readonly responseSha256s: readonly string[]
}

const emptyNumericWindow = (length: number): readonly null[] =>
  Array.from({ length }, () => null)

const parseDateOnly = (value: string): number | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const parsed = Date.parse(`${value}T00:00:00.000Z`)
  if (!Number.isFinite(parsed)) return null
  return new Date(parsed).toISOString().slice(0, 10) === value ? parsed : null
}

export function resolveInterestSource(
  input: ConfirmatoryFeatureInput,
): ResolvedInterestSource {
  const run = input.interestRun
  if (run === null) {
    return {
      rawValues: emptyNumericWindow(20),
      sourceAgeDays: null,
      runId: null,
      responseSha256: null,
      sourceMaxDate: null,
      abstainReasons: ['interest_run_missing'],
    }
  }

  const sourceDateIsValid = parseDateOnly(run.sourceMaxDate) !== null
    && parseDateOnly(input.baseDate) !== null
  const timestampIsValid = isCanonicalTimestampAtOrBefore(run.completedAt, input.cutoffAt)
  const responseHashIsValid = isCanonicalSha256(run.responseSha256)
  const identityIsCanonical = sourceDateIsValid && timestampIsValid && responseHashIsValid
  const expectedDates = identityIsCanonical
    ? getKoreanTradingDateWindow({
        baseDate: run.sourceMaxDate,
        startOffset: -19,
        endOffset: 0,
      })
    : []
  const matchingRows = input.interestObservations.filter(
    (row) => row.collectionRunId === run.id && row.themeId === input.themeId,
  )
  const rawValues = identityIsCanonical
    ? expectedDates.map((tradingDate) => {
        const rowsForDate = matchingRows.filter((row) => row.tradingDate === tradingDate)
        const rowForDate = rowsForDate.length === 1 ? rowsForDate.at(0) : undefined
        return rowForDate === undefined ? null : rowForDate.rawValue
      })
    : emptyNumericWindow(20)
  const sourceAgeDays = identityIsCanonical
    ? countKoreanTradingDaysBetween({
        fromDate: run.sourceMaxDate,
        toDate: input.baseDate,
      })
    : null
  const abstainReasons: string[] = []

  if (run.status !== 'complete') abstainReasons.push('interest_run_not_complete')
  if (!timestampIsValid) {
    abstainReasons.push('interest_run_after_cutoff')
  }
  if (!responseHashIsValid) abstainReasons.push('interest_response_invalid')
  if (sourceAgeDays === null || sourceAgeDays < 0 || sourceAgeDays > 1) {
    abstainReasons.push('interest_source_age_out_of_range')
  }
  if (matchingRows.length !== 20 || rawValues.some((value) => value === null)) {
    abstainReasons.push('interest_history_invalid')
  }

  return {
    rawValues,
    sourceAgeDays,
    runId: identityIsCanonical ? run.id : null,
    responseSha256: identityIsCanonical ? run.responseSha256 : null,
    sourceMaxDate: identityIsCanonical ? run.sourceMaxDate : null,
    abstainReasons,
  }
}

const resolveSelectedNewsRows = (
  input: ConfirmatoryFeatureInput,
): readonly (ConfirmatoryNewsObservation | null)[] =>
  input.newsObservationIds.map((observationId) => {
    const matchingRows = input.newsObservations.filter(
      (row) => row.id === observationId && row.themeId === input.themeId,
    )
    const matchingRow = matchingRows.length === 1 ? matchingRows.at(0) : undefined
    return matchingRow ?? null
  })

const collectNewsRunIds = (
  rows: readonly (ConfirmatoryNewsObservation | null)[],
): readonly string[] => {
  const runIds = new Set<string>()
  for (const row of rows) {
    if (row !== null) runIds.add(row.collectionRunId)
  }
  return [...runIds].sort(compareUtf8Bytes)
}

const resolveReferencedNewsRuns = (
  input: ConfirmatoryFeatureInput,
  runIds: readonly string[],
): ResolvedNewsRuns | null => {
  const baseDate = parseDateOnly(input.baseDate)
  if (baseDate === null || runIds.length === 0 || runIds.some((runId) => runId.length === 0)) {
    return null
  }

  const runs: ConfirmatoryNewsRun[] = []
  for (const runId of runIds) {
    const matchingRuns = input.newsRuns.filter((run) => run.id === runId)
    const run = matchingRuns.length === 1 ? matchingRuns.at(0) : undefined
    if (run === undefined) return null
    runs.push(run)
  }

  let sourceMaxDate: string | null = null
  let sourceMaxTimestamp = Number.NEGATIVE_INFINITY
  for (const run of runs) {
    const sourceTimestamp = parseDateOnly(run.sourceMaxDate)
    const runIsValid = run.status === 'complete'
      && isCanonicalSha256(run.responseSha256)
      && isCanonicalTimestampAtOrBefore(run.collectedAt, input.cutoffAt)
      && isCanonicalTimestampAtOrBefore(run.completedAt, input.cutoffAt)
      && sourceTimestamp !== null
      && sourceTimestamp <= baseDate
    if (!runIsValid || sourceTimestamp === null) return null
    if (sourceTimestamp > sourceMaxTimestamp) {
      sourceMaxTimestamp = sourceTimestamp
      sourceMaxDate = run.sourceMaxDate
    }
  }

  return sourceMaxDate === null
    ? null
    : { sourceMaxDate, responseSha256s: runs.map((run) => run.responseSha256) }
}

const invalidNewsSource = (): ResolvedNewsSource => ({
  articleCounts: emptyNumericWindow(14),
  sourceMaxDate: null,
  sourceAgeDays: null,
  runIds: [],
  runResponseSha256s: [],
  abstainReasons: ['news_source_invalid'],
})

export function resolveNewsSource(input: ConfirmatoryFeatureInput): ResolvedNewsSource {
  if (parseDateOnly(input.baseDate) === null) return invalidNewsSource()
  const expectedDates = getKoreanTradingDateWindow({
    baseDate: input.baseDate,
    startOffset: -13,
    endOffset: 0,
  })
  const selectedRows = resolveSelectedNewsRows(input)
  const orderedIdsAreValid = input.newsObservationIds.length === 14
    && new Set(input.newsObservationIds).size === 14
    && input.newsInputSha256 !== null
    && sha256OrderedJsonStringArray(input.newsObservationIds) === input.newsInputSha256
  const rowsAreValid = selectedRows.length === 14
    && selectedRows.every((row, index) => {
      const expectedDate = expectedDates.at(index)
      return row !== null
        && expectedDate !== undefined
        && row.articleDate === expectedDate
        && isCanonicalTimestampAtOrBefore(row.collectedAt, input.cutoffAt)
    })
  const runIds = collectNewsRunIds(selectedRows)
  const resolvedRuns = rowsAreValid ? resolveReferencedNewsRuns(input, runIds) : null

  if (!orderedIdsAreValid || !rowsAreValid || resolvedRuns === null) {
    return invalidNewsSource()
  }

  return {
    articleCounts: selectedRows.map((row) => row === null ? null : row.articleCount),
    sourceMaxDate: resolvedRuns.sourceMaxDate,
    sourceAgeDays: countKoreanTradingDaysBetween({
      fromDate: resolvedRuns.sourceMaxDate,
      toDate: input.baseDate,
    }),
    runIds,
    runResponseSha256s: resolvedRuns.responseSha256s,
    abstainReasons: [],
  }
}

const isBablObservationUsable = (
  input: ConfirmatoryFeatureInput,
  observation: ConfirmatoryBablObservation,
): boolean =>
  input.bablObservationId !== null
  && input.bablInputSha256 !== null
  && input.bablCandidatePool !== null
  && input.bablMissingReason === null
  && isCanonicalSha256(input.bablInputSha256)
  && isCanonicalSha256(observation.payloadHash)
  && observation.id === input.bablObservationId
  && observation.payloadHash === input.bablInputSha256
  && observation.candidatePool === input.bablCandidatePool
  && observation.themeId === input.themeId
  && observation.snapshotDate === input.baseDate
  && observation.algorithmVersion === input.bablLock.algorithmVersion
  && observation.comparisonSpecVersion === input.bablLock.comparisonSpecVersion
  && observation.evaluationHorizonDays === input.bablLock.evaluationHorizonDays
  && observation.sourcePredictionSnapshotId.length > 0
  && observation.sourceRunStatus === 'complete'
  && isCanonicalTimestampAtOrBefore(observation.computedAt, input.cutoffAt)

export function resolveBablSource(input: ConfirmatoryFeatureInput): ResolvedBablSource {
  const observation = input.bablObservation
  if (observation === null || !isBablObservationUsable(input, observation)) {
    return { value: 0, missing: true }
  }

  if (observation.phase === 'rising') return { value: 1, missing: false }
  if (observation.phase === 'cooling') return { value: -1, missing: false }
  return { value: 0, missing: false }
}
