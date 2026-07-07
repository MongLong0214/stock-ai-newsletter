import { addKoreanTradingDays } from '@/lib/tli/trading-calendar'
import type { DateRange, EvalObservation, WalkForwardFold } from './types'

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
