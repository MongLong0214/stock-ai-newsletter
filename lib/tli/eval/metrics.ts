import type { EvalObservation, EvalPredictionRow, PredictionEvaluationSummary, PredictionMetrics } from './types'

const DEFAULT_ECE_BINS = 5
const DEFAULT_ECE_MIN_BIN_SIZE = 30

const mean = (values: readonly number[]): number | null => (
  values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length
)

const finiteProbability = (row: EvalPredictionRow): number | null => (
  row.probability === null || !Number.isFinite(row.probability) ? null : row.probability
)

const brierError = (probability: number, y: boolean): number => (probability - (y ? 1 : 0)) ** 2

const groupByDate = (rows: readonly EvalPredictionRow[]): EvalPredictionRow[][] => {
  const byDate = new Map<string, EvalPredictionRow[]>()
  for (const row of rows) {
    byDate.set(row.baseDate, [...(byDate.get(row.baseDate) ?? []), row])
  }
  return [...byDate.values()]
}

export function computeQuantileEce(
  rows: readonly EvalPredictionRow[],
  options: { readonly binCount?: number; readonly minBinSize?: number } = {},
): { readonly ece: number | null; readonly binCount: number } {
  const scored = rows.flatMap((row) => {
    const probability = finiteProbability(row)
    return probability === null ? [] : [{ probability, actual: row.y ? 1 : 0 }]
  }).sort((left, right) => left.probability - right.probability)
  const minBinSize = options.minBinSize ?? DEFAULT_ECE_MIN_BIN_SIZE
  if (scored.length < minBinSize) return { ece: null, binCount: 0 }
  const binCount = Math.max(1, Math.min(options.binCount ?? DEFAULT_ECE_BINS, Math.floor(scored.length / minBinSize)))
  let ece = 0
  for (let index = 0; index < binCount; index++) {
    const start = Math.floor(index * scored.length / binCount)
    const end = Math.floor((index + 1) * scored.length / binCount)
    const bin = scored.slice(start, end)
    const predicted = mean(bin.map((row) => row.probability)) ?? 0
    const actual = mean(bin.map((row) => row.actual)) ?? 0
    ece += (bin.length / scored.length) * Math.abs(predicted - actual)
  }
  // N2: fail-closed — a corrupt/non-finite ECE must read as worst-case (1), not best-case (0),
  // matching the same contract as lib/tli/forecast/calibration.ts's computeECE.
  return { ece: Number.isFinite(ece) ? ece : 1, binCount }
}

const rankValues = (values: readonly number[]): number[] => {
  const sorted = values.map((value, index) => ({ value, index })).sort((left, right) => left.value - right.value)
  const ranks = Array.from({ length: values.length }, () => 0)
  let index = 0
  while (index < sorted.length) {
    let end = index
    while (end + 1 < sorted.length && sorted[end + 1].value === sorted[index].value) end++
    const rank = (index + end + 2) / 2
    for (let cursor = index; cursor <= end; cursor++) ranks[sorted[cursor].index] = rank
    index = end + 1
  }
  return ranks
}

const pearson = (left: readonly number[], right: readonly number[]): number | null => {
  const leftMean = mean(left)
  const rightMean = mean(right)
  if (leftMean === null || rightMean === null) return null
  let numerator = 0
  let leftSum = 0
  let rightSum = 0
  for (let index = 0; index < left.length; index++) {
    const leftDelta = left[index] - leftMean
    const rightDelta = right[index] - rightMean
    numerator += leftDelta * rightDelta
    leftSum += leftDelta ** 2
    rightSum += rightDelta ** 2
  }
  const denominator = Math.sqrt(leftSum * rightSum)
  return denominator === 0 ? null : numerator / denominator
}

export function computeDailySpearmanIc(rows: readonly EvalPredictionRow[]): number | null {
  const correlations = groupByDate(rows).flatMap((dateRows) => {
    const scored = dateRows.flatMap((row) => {
      const probability = finiteProbability(row)
      return probability === null ? [] : [{ probability, actual: row.y ? 1 : 0 }]
    })
    if (scored.length < 2) return []
    const correlation = pearson(
      rankValues(scored.map((row) => row.probability)),
      rankValues(scored.map((row) => row.actual)),
    )
    return correlation === null ? [] : [correlation]
  })
  return mean(correlations)
}

export function computeDailyRisingPrecisionAtK(rows: readonly EvalPredictionRow[], k = 10): number | null {
  const values = groupByDate(rows).flatMap((dateRows) => {
    const top = dateRows.flatMap((row) => {
      const probability = finiteProbability(row)
      return probability === null ? [] : [{ probability, y: row.y, id: row.id }]
    }).sort((left, right) => right.probability - left.probability || left.id.localeCompare(right.id)).slice(0, k)
    return top.length === 0 ? [] : [top.filter((row) => row.y).length / top.length]
  })
  return mean(values)
}

export function evaluatePredictionRows(
  rows: readonly EvalPredictionRow[],
  options: { readonly eceMinBinSize?: number; readonly pAtK?: number } = {},
): PredictionMetrics {
  const scored = rows.flatMap((row) => {
    const probability = finiteProbability(row)
    return probability === null ? [] : [{ ...row, probability }]
  })
  const ece = computeQuantileEce(scored, { minBinSize: options.eceMinBinSize })
  return {
    totalCandidates: rows.length,
    nScored: scored.length,
    coverage: rows.length === 0 ? 0 : scored.length / rows.length,
    baseRate: mean(scored.map((row) => (row.y ? 1 : 0))),
    brier: mean(scored.map((row) => brierError(row.probability, row.y))),
    ece: ece.ece,
    eceBinCount: ece.binCount,
    eceUpper95: null,
    ic: computeDailySpearmanIc(scored),
    risingPAt10: computeDailyRisingPrecisionAtK(scored, options.pAtK ?? 10),
  }
}

export function selectWeeklyMondaySubset<T extends EvalObservation>(rows: readonly T[]): T[] {
  return rows.filter((row) => new Date(`${row.baseDate}T00:00:00.000Z`).getUTCDay() === 1)
}

export function evaluateWithWeeklyMondaySubset(
  rows: readonly EvalPredictionRow[],
  options: { readonly eceMinBinSize?: number; readonly pAtK?: number } = {},
): PredictionEvaluationSummary {
  const weeklyMonday = selectWeeklyMondaySubset(rows)
  return {
    rawN: rows.length,
    nonOverlappingN: weeklyMonday.length,
    raw: evaluatePredictionRows(rows, options),
    weeklyMonday: evaluatePredictionRows(weeklyMonday, options),
  }
}

export function toBrierError(probability: number, y: boolean): number {
  return brierError(probability, y)
}

export function getFiniteProbability(row: EvalPredictionRow): number | null {
  return finiteProbability(row)
}
