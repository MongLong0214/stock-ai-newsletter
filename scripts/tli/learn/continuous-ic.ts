import {
  evaluateWithWeeklyMondaySubset,
  selectWeeklyMondaySubset,
} from '../../../lib/tli/eval/metrics'
import type {
  EvalPredictionRow,
  PredictionEvaluationSummary,
} from '../../../lib/tli/eval/types'

export type ScientificM1OutcomeRow = {
  readonly id: string
  readonly themeId: string
  readonly baseDate: string
  readonly y: boolean
  readonly gLogRatio: number
}

export type ScientificM1Prediction = {
  readonly rowId: string
  readonly probability: number | null
}

export type GLogRatioIcSummary = {
  readonly raw: number | null
  readonly weeklyMonday: number | null
}

export type ScientificM1PredictionEvaluation = {
  readonly binary: PredictionEvaluationSummary
  readonly continuousGLogRatioIc: GLogRatioIcSummary
}

type ContinuousIcRow = {
  readonly id: string
  readonly themeId: string
  readonly baseDate: string
  readonly probability: number | null
  readonly gLogRatio: number
}

export class ScientificM1PredictionInputError extends Error {
  readonly name = 'ScientificM1PredictionInputError'

  constructor(readonly rowId: string, message: string) {
    super(`${message}: ${rowId}`)
  }
}

const mean = (values: readonly number[]): number | null => (
  values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length
)

const rankValues = (values: readonly number[]): number[] => {
  const sorted = values
    .map((value, index) => ({ value, index }))
    .sort((left, right) => left.value - right.value || left.index - right.index)
  const ranks = Array.from({ length: values.length }, () => 0)
  let start = 0
  while (start < sorted.length) {
    const first = sorted.at(start)
    if (first === undefined) break
    let end = start
    while (sorted.at(end + 1)?.value === first.value) end += 1
    const rank = (start + end + 2) / 2
    for (let cursor = start; cursor <= end; cursor += 1) {
      const entry = sorted.at(cursor)
      if (entry !== undefined) ranks[entry.index] = rank
    }
    start = end + 1
  }
  return ranks
}

const pearson = (left: readonly number[], right: readonly number[]): number | null => {
  if (left.length !== right.length || left.length === 0) return null
  const leftMean = mean(left)
  const rightMean = mean(right)
  if (leftMean === null || rightMean === null) return null
  let numerator = 0
  let leftSquares = 0
  let rightSquares = 0
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left.at(index)
    const rightValue = right.at(index)
    if (leftValue === undefined || rightValue === undefined) return null
    const leftDelta = leftValue - leftMean
    const rightDelta = rightValue - rightMean
    numerator += leftDelta * rightDelta
    leftSquares += leftDelta ** 2
    rightSquares += rightDelta ** 2
  }
  const denominator = Math.sqrt(leftSquares * rightSquares)
  return denominator === 0 ? null : numerator / denominator
}

export function computeDailyGLogRatioSpearmanIc(rows: readonly ContinuousIcRow[]): number | null {
  const byDate = new Map<string, ContinuousIcRow[]>()
  for (const row of rows) byDate.set(row.baseDate, [...(byDate.get(row.baseDate) ?? []), row])
  const correlations = [...byDate.values()].flatMap((dateRows) => {
    const scored = dateRows.filter((row) => (
      row.probability !== null
      && Number.isFinite(row.probability)
      && Number.isFinite(row.gLogRatio)
    ))
    if (scored.length < 2) return []
    const correlation = pearson(
      rankValues(scored.map((row) => row.probability ?? 0)),
      rankValues(scored.map((row) => row.gLogRatio)),
    )
    return correlation === null ? [] : [correlation]
  })
  return mean(correlations)
}

export function evaluateScientificM1Predictions(input: {
  readonly rows: readonly ScientificM1OutcomeRow[]
  readonly predictions: readonly ScientificM1Prediction[]
}): ScientificM1PredictionEvaluation {
  const predictionByRow = new Map<string, ScientificM1Prediction>()
  for (const prediction of input.predictions) {
    if (predictionByRow.has(prediction.rowId)) {
      throw new ScientificM1PredictionInputError(prediction.rowId, 'duplicate scientific M1 prediction')
    }
    predictionByRow.set(prediction.rowId, prediction)
  }
  const binaryRows: EvalPredictionRow[] = []
  const continuousRows: ContinuousIcRow[] = []
  for (const row of input.rows) {
    const prediction = predictionByRow.get(row.id)
    if (prediction === undefined) {
      throw new ScientificM1PredictionInputError(row.id, 'missing scientific M1 prediction')
    }
    predictionByRow.delete(row.id)
    binaryRows.push({ ...row, probability: prediction.probability })
    continuousRows.push({ ...row, probability: prediction.probability })
  }
  const extraRowId = predictionByRow.keys().next().value
  if (typeof extraRowId === 'string') {
    throw new ScientificM1PredictionInputError(extraRowId, 'prediction does not match a scientific dataset row')
  }
  return {
    binary: evaluateWithWeeklyMondaySubset(binaryRows),
    continuousGLogRatioIc: {
      raw: computeDailyGLogRatioSpearmanIc(continuousRows),
      weeklyMonday: computeDailyGLogRatioSpearmanIc(selectWeeklyMondaySubset(continuousRows)),
    },
  }
}
