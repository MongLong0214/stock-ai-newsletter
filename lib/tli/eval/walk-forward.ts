import { canonicalJsonV1Sha256, type CanonicalJsonValue } from '@/lib/tli/canonical-json-v1'
import { addKoreanTradingDays } from '@/lib/tli/trading-calendar'
import type {
  DateRange,
  EvalObservation,
  InnerOofFold,
  InnerOofSplit,
  StudyEvalRow,
  StudyOrigin,
  StudyWalkForwardFold,
  StudyWalkForwardSplit,
  WalkForwardFold,
} from './types'

/** Origins reserved as the initial train block; testing starts at the 14th origin. */
export const INITIAL_TRAIN_ORIGIN_COUNT = 13
/** A candidate may not start below this many clean origins for one study contract. */
export const MIN_CLEAN_ORIGIN_COUNT = 26
export const MIN_OOS_TEST_ORIGIN_COUNT = 13
/** Inner/OOF split: `K = min(8, N - 8)`, invalid below 5. */
export const MAX_INNER_FOLD_COUNT = 8
export const INNER_TRAIN_ORIGIN_RESERVE = 8
export const MIN_INNER_FOLD_COUNT = 5

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

const isIsoDate = (value: string): boolean => ISO_DATE_PATTERN.test(value)

const dateRange = <T extends EvalObservation>(rows: readonly T[]): DateRange | null => {
  if (rows.length === 0) return null
  const dates = rows.map((row) => row.baseDate).sort()
  return { start: dates[0], end: dates[dates.length - 1] }
}

const clusterCount = <T extends EvalObservation>(rows: readonly T[]): number => (
  new Set(rows.map((row) => row.themeId)).size
)

const rowsForDates = <T extends EvalObservation>(rows: readonly T[], dates: ReadonlySet<string>): T[] => (
  rows.filter((row) => dates.has(row.baseDate))
)

/**
 * @deprecated Retired by the TLI v3 scientific rebuild: the integer `-5` trading-day purge
 * heuristic cannot prove label/source availability at the test forecast cutoff. Use
 * {@link createStudyWalkForwardFolds} with {@link isTrainRowAvailable}. Kept only so that the
 * existing `scripts/tli/learn/*` offline-eval callers keep compiling.
 */
export function createWalkForwardFolds<T extends EvalObservation>(
  rows: readonly T[],
  options: {
    readonly foldCount?: number
    readonly purgeGapTradingDays?: number
    readonly testWindowDateCount?: number
  } = {},
): WalkForwardFold<T>[] {
  const sortedRows = [...rows].sort((left, right) => (
    left.baseDate === right.baseDate ? left.id.localeCompare(right.id) : left.baseDate.localeCompare(right.baseDate)
  ))
  const dates = [...new Set(sortedRows.map((row) => row.baseDate))]
  const foldCount = options.foldCount ?? 3
  const testWindowDateCount = options.testWindowDateCount ?? Math.max(1, Math.floor(dates.length / (foldCount + 2)))
  const purgeGapTradingDays = options.purgeGapTradingDays ?? 5
  const folds: WalkForwardFold<T>[] = []

  for (let index = 0; index < foldCount; index++) {
    const testStartIndex = dates.length - testWindowDateCount * (foldCount - index)
    if (testStartIndex <= 0) continue
    const testDates = dates.slice(testStartIndex, testStartIndex + testWindowDateCount)
    const testStart = testDates[0]
    if (!testStart) continue
    const purgeCutoff = addKoreanTradingDays(testStart, -purgeGapTradingDays)
    const trainDateSet = new Set(dates.filter((date) => date <= purgeCutoff))
    const purgeDateSet = new Set(dates.filter((date) => date > purgeCutoff && date < testStart))
    const testDateSet = new Set(testDates)
    const train = rowsForDates(sortedRows, trainDateSet)
    const test = rowsForDates(sortedRows, testDateSet)
    const testRange = dateRange(test)
    if (train.length === 0 || testRange === null) continue
    folds.push({
      foldId: `wf-${folds.length + 1}`,
      train,
      purge: rowsForDates(sortedRows, purgeDateSet),
      test,
      trainDateRange: dateRange(train),
      testDateRange: testRange,
      trainClusterCount: clusterCount(train),
      testClusterCount: clusterCount(test),
    })
  }

  return folds
}

/**
 * Purge/availability predicate. A train row is usable for a test origin only when all three hold:
 * `max(future_dates) < test origin date`, `label.finalized_at <= test forecast cutoff`, and
 * `label_source_run.completed_at <= test forecast cutoff`.
 *
 * Fail-closed: a row with no future dates, a malformed date, or an unparseable timestamp is purged
 * rather than trusted, because an unverifiable row cannot be proven leak-free.
 */
export function isTrainRowAvailable(row: StudyEvalRow, testOrigin: StudyOrigin): boolean {
  if (!isIsoDate(testOrigin.originDate)) return false
  if (row.futureDates.length === 0) return false
  if (!row.futureDates.every(isIsoDate)) return false

  const maxFutureDate = row.futureDates.reduce((max, date) => (date > max ? date : max), row.futureDates[0])
  if (maxFutureDate >= testOrigin.originDate) return false

  const forecastCutoff = Date.parse(testOrigin.forecastCutoff)
  const finalizedAt = Date.parse(row.labelFinalizedAt)
  const sourceCompletedAt = Date.parse(row.labelSourceRunCompletedAt)
  if (!Number.isFinite(forecastCutoff) || !Number.isFinite(finalizedAt) || !Number.isFinite(sourceCompletedAt)) return false

  return finalizedAt <= forecastCutoff && sourceCompletedAt <= forecastCutoff
}

export function distinctOriginDates<T extends EvalObservation>(rows: readonly T[]): string[] {
  return [...new Set(rows.map((row) => row.baseDate))].sort()
}

/** SHA-256 of the `canonical-json-v1` bytes of a split's origin lists, for the fold/model manifest. */
export function computeSplitOriginsSha256(split: CanonicalJsonValue): string {
  return canonicalJsonV1Sha256(split)
}

const sortedUniqueOrigins = (origins: readonly string[], context: string): string[] => {
  for (const origin of origins) {
    if (!isIsoDate(origin)) throw new Error(`${context}: origin "${origin}" is not an ISO date`)
  }
  const sorted = [...origins].sort()
  for (let index = 1; index < sorted.length; index++) {
    if (sorted[index] === sorted[index - 1]) throw new Error(`${context}: duplicate origin "${sorted[index]}"`)
  }
  return sorted
}

/**
 * Inner/OOF split of one outer train block (or the prospective full train block): the last
 * `K = min(8, N - 8)` origins each become a one-origin validation fold trained only on strictly
 * earlier origins. `K < 5` is an invalid fold and hard-fails instead of silently shrinking.
 */
export function createInnerOofSplit(origins: readonly string[]): InnerOofSplit {
  const sorted = sortedUniqueOrigins(origins, 'inner-oof-split')
  const originCount = sorted.length
  const foldCount = Math.min(MAX_INNER_FOLD_COUNT, originCount - INNER_TRAIN_ORIGIN_RESERVE)
  if (foldCount < MIN_INNER_FOLD_COUNT) {
    throw new Error(
      `inner-oof-split: K=${foldCount} < ${MIN_INNER_FOLD_COUNT} for N=${originCount} distinct origins`,
    )
  }

  const folds: InnerOofFold[] = []
  for (let index = 0; index < foldCount; index++) {
    const validationIndex = originCount - foldCount + index
    folds.push({
      foldId: `inner-${(index + 1).toString().padStart(2, '0')}`,
      validationOrigin: sorted[validationIndex],
      trainOrigins: sorted.slice(0, validationIndex),
    })
  }

  return {
    originCount,
    foldCount,
    folds,
    splitOriginsSha256: computeSplitOriginsSha256({
      kind: 'inner-oof-split-v1',
      originCount,
      foldCount,
      folds: folds.map((fold) => ({
        validationOrigin: fold.validationOrigin,
        trainOrigins: fold.trainOrigins,
      })),
    }),
  }
}

/**
 * One-origin expanding outer folds over a single study contract's clean eligible weekly origins:
 * the first 13 origins are the initial train block and every origin from the 14th on becomes a
 * one-origin test fold trained only on strictly earlier origins. Theme rows of one origin are never
 * split across train and test because assignment happens at origin granularity.
 */
export function createStudyWalkForwardFolds<T extends StudyEvalRow>(input: {
  readonly origins: readonly StudyOrigin[]
  readonly rows: readonly T[]
}): StudyWalkForwardSplit<T> {
  const originDates = sortedUniqueOrigins(input.origins.map((origin) => origin.originDate), 'study-walk-forward')
  if (originDates.length < MIN_CLEAN_ORIGIN_COUNT) {
    throw new Error(
      `study-walk-forward: ${originDates.length} clean origins < ${MIN_CLEAN_ORIGIN_COUNT} required to start a candidate`,
    )
  }

  const originByDate = new Map(input.origins.map((origin) => [origin.originDate, origin]))
  for (const origin of input.origins) {
    if (!Number.isFinite(Date.parse(origin.forecastCutoff))) {
      throw new Error(`study-walk-forward: origin "${origin.originDate}" has an unparseable forecast cutoff`)
    }
  }
  for (const row of input.rows) {
    if (!originByDate.has(row.baseDate)) {
      throw new Error(`study-walk-forward: row "${row.id}" has base date "${row.baseDate}" outside the study origins`)
    }
  }

  const sortedRows = [...input.rows].sort((left, right) => (
    left.baseDate === right.baseDate ? left.id.localeCompare(right.id) : left.baseDate.localeCompare(right.baseDate)
  ))

  const folds: StudyWalkForwardFold<T>[] = []
  for (let index = INITIAL_TRAIN_ORIGIN_COUNT; index < originDates.length; index++) {
    const testOriginDate = originDates[index]
    const testOrigin = originByDate.get(testOriginDate)
    if (!testOrigin) throw new Error(`study-walk-forward: missing origin "${testOriginDate}"`)

    const candidateTrainOrigins = originDates.slice(0, index)
    const candidateTrainOriginSet = new Set(candidateTrainOrigins)
    const candidateTrainRows = sortedRows.filter((row) => candidateTrainOriginSet.has(row.baseDate))
    const train = candidateTrainRows.filter((row) => isTrainRowAvailable(row, testOrigin))
    const purged = candidateTrainRows.filter((row) => !isTrainRowAvailable(row, testOrigin))
    const test = sortedRows.filter((row) => row.baseDate === testOriginDate)
    const trainOrigins = distinctOriginDates(train)
    const sequence = folds.length + 1

    folds.push({
      foldId: `outer-${sequence.toString().padStart(2, '0')}`,
      sequence,
      testOrigin,
      candidateTrainOrigins,
      trainOrigins,
      train,
      purged,
      test,
      splitOriginsSha256: computeSplitOriginsSha256({
        kind: 'outer-fold-split-v1',
        sequence,
        testOrigin: testOriginDate,
        trainOrigins,
      }),
    })
  }

  if (folds.length < MIN_OOS_TEST_ORIGIN_COUNT) {
    throw new Error(`study-walk-forward: ${folds.length} OOS test origins < ${MIN_OOS_TEST_ORIGIN_COUNT} required`)
  }

  return {
    originCount: originDates.length,
    initialTrainOriginCount: INITIAL_TRAIN_ORIGIN_COUNT,
    testOriginCount: folds.length,
    folds,
    splitOriginsSha256: computeSplitOriginsSha256({
      kind: 'study-walk-forward-split-v1',
      originCount: originDates.length,
      initialTrainOriginCount: INITIAL_TRAIN_ORIGIN_COUNT,
      folds: folds.map((fold) => ({
        sequence: fold.sequence,
        testOrigin: fold.testOrigin.originDate,
        trainOrigins: fold.trainOrigins,
      })),
    }),
  }
}
