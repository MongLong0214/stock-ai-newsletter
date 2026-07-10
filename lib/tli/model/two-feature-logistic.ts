import { canonicalJsonV1Sha256 } from '@/lib/tli/canonical-json-v1'
import { createInnerOofSplit } from '@/lib/tli/eval/walk-forward'

/**
 * Secondary diagnostic baseline (c): a regularized logistic that uses only `interest_slope_7d`
 * and `news_momentum` yet applies the *same* fold / preprocess / C-selection / Platt contract as
 * the confirmatory candidate. It is diagnostic-only and is never a promotion-gate input.
 *
 * Contract parity with the Python candidate core (`m1_calibration*.py`):
 * - preprocess: train-only per-feature median/MAD, missing/nonfinite imputed to the train median,
 *   design columns are the two scaled features followed by the two missing flags.
 * - base estimator: L2 logistic (sklearn `C` parametrisation) minimising `0.5·‖w‖² + C·Σ logloss`
 *   with an unpenalised intercept, solved to the same optimum by Newton-Raphson.
 * - C selection: inner one-origin OOF folds, pre-calibration Brier averaged within each validation
 *   origin then equal-weighted across origins, minimum-Brier C with the smaller C as tiebreak.
 * - calibration: a time-blocked OOF Platt fit on the selected C's margins with origin-balanced
 *   weights, stored as `a = -coef`, `b = -intercept` and applied as `sigmoid(-(a·m + b))`.
 *
 * Unlike the candidate it degrades gracefully instead of throwing: a fold that cannot honour the
 * contract (too few inner origins, an OOF class/origin floor miss, a single-class fit) yields a
 * `not_computed` result with a reason, so the whole offline-eval report never fails on a diagnostic.
 */

export const TWO_FEATURE_LOGISTIC_FEATURE_NAMES = ['interest_slope_7d', 'news_momentum'] as const
export const TWO_FEATURE_REGULARIZATION_CANDIDATES = [0.01, 0.1, 1.0, 10.0] as const

/** Inner OOF class/origin floors, identical to the candidate `validate_cross_fitted_margins`. */
export const TWO_FEATURE_MIN_OOF_CLASS_COUNT = 30
export const TWO_FEATURE_MIN_OOF_ORIGIN_COUNT = 5

const CALIBRATION_EPS = 1e-6
const NEWTON_MAX_ITER = 200
const NEWTON_TOLERANCE = 1e-10
const FEATURE_COUNT = 2

export interface TwoFeatureLogisticTrainRow {
  readonly themeId: string
  readonly originDate: string
  readonly interestSlope7d: number | null
  readonly newsMomentum: number | null
  readonly y: boolean
}

export interface TwoFeatureLogisticPredictRow {
  readonly id: string
  readonly themeId: string
  readonly originDate: string
  readonly interestSlope7d: number | null
  readonly newsMomentum: number | null
}

export interface TwoFeatureCandidateScore {
  readonly c: number
  readonly meanBrier: number
  readonly foldBriers: readonly number[]
}

export interface TwoFeatureLogisticArtifact {
  readonly baselineId: 'logistic-two-feature-v1'
  readonly role: 'secondary_diagnostic'
  readonly featureNames: typeof TWO_FEATURE_LOGISTIC_FEATURE_NAMES
  readonly studyContractId: string
  readonly studyContractSha256: string
  readonly innerOofSplitOriginsSha256: string
  readonly selectedC: number
  readonly candidateScores: readonly TwoFeatureCandidateScore[]
  readonly scaler: { readonly median: readonly number[]; readonly mad: readonly number[] }
  readonly coefficients: { readonly intercept: number; readonly weights: readonly number[] }
  readonly calibrator: { readonly a: number; readonly b: number }
  readonly trainRowCount: number
  readonly trainOrigins: readonly string[]
  readonly oofRowCount: number
  readonly oofPositiveCount: number
  readonly oofNegativeCount: number
  readonly artifactSha256: string
}

export type TwoFeatureLogisticSkipReason =
  | 'insufficient_train_origins'
  | 'inner_oof_split_invalid'
  | 'single_class_fit'
  | 'oof_class_floor'
  | 'oof_origin_floor'
  | 'nonfinite_fit'

export interface TwoFeatureLogisticPrediction {
  readonly id: string
  readonly themeId: string
  readonly originDate: string
  readonly probability: number
}

export type TwoFeatureLogisticResult =
  | {
    readonly status: 'computed'
    readonly artifact: TwoFeatureLogisticArtifact
    readonly predict: (row: TwoFeatureLogisticPredictRow) => number
  }
  | { readonly status: 'not_computed'; readonly reason: TwoFeatureLogisticSkipReason }

class TwoFeatureContractSkip extends Error {
  constructor(readonly reason: TwoFeatureLogisticSkipReason) {
    super(reason)
  }
}

const sigmoid = (value: number): number => 1 / (1 + Math.exp(-Math.max(-709, Math.min(709, value))))

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((left, right) => left - right)
  const size = sorted.length
  const mid = Math.floor(size / 2)
  return size % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

interface PreprocessingStats {
  readonly medians: readonly number[]
  readonly mads: readonly number[]
}

const featureValues = (row: { readonly interestSlope7d: number | null; readonly newsMomentum: number | null }): readonly (number | null)[] => (
  [row.interestSlope7d, row.newsMomentum]
)

const isObserved = (value: number | null): value is number => value !== null && Number.isFinite(value)

const fitPreprocessor = (rows: readonly TwoFeatureLogisticTrainRow[]): PreprocessingStats => {
  const medians: number[] = []
  const mads: number[] = []
  for (let slot = 0; slot < FEATURE_COUNT; slot += 1) {
    const observed = rows.map((row) => featureValues(row)[slot]).filter(isObserved)
    if (observed.length === 0) throw new TwoFeatureContractSkip('nonfinite_fit')
    const slotMedian = median(observed)
    const slotMad = median(observed.map((value) => Math.abs(value - slotMedian)))
    if (!Number.isFinite(slotMedian) || !Number.isFinite(slotMad)) throw new TwoFeatureContractSkip('nonfinite_fit')
    medians.push(slotMedian)
    mads.push(slotMad)
  }
  return { medians, mads }
}

const transformDesign = (
  row: { readonly interestSlope7d: number | null; readonly newsMomentum: number | null },
  stats: PreprocessingStats,
): readonly number[] => {
  const scaled: number[] = []
  const flags: number[] = []
  const values = featureValues(row)
  for (let slot = 0; slot < FEATURE_COUNT; slot += 1) {
    const raw = values[slot]
    const missing = !isObserved(raw)
    const imputed = missing ? stats.medians[slot] : raw
    const divisor = stats.mads[slot] > 0 ? stats.mads[slot] : 1
    scaled.push((imputed - stats.medians[slot]) / divisor)
    flags.push(missing ? 1 : 0)
  }
  return [...scaled, ...flags]
}

/** Gaussian elimination with partial pivoting for the small Newton systems. */
const solveLinearSystem = (matrix: number[][], vector: number[]): number[] => {
  const size = vector.length
  const augmented = matrix.map((rowValues, index) => [...rowValues, vector[index]])
  for (let column = 0; column < size; column += 1) {
    let pivot = column
    for (let candidate = column + 1; candidate < size; candidate += 1) {
      if (Math.abs(augmented[candidate][column]) > Math.abs(augmented[pivot][column])) pivot = candidate
    }
    if (Math.abs(augmented[pivot][column]) < 1e-14) throw new TwoFeatureContractSkip('nonfinite_fit')
    const swap = augmented[column]
    augmented[column] = augmented[pivot]
    augmented[pivot] = swap
    for (let target = 0; target < size; target += 1) {
      if (target === column) continue
      const factor = augmented[target][column] / augmented[column][column]
      for (let element = column; element <= size; element += 1) {
        augmented[target][element] -= factor * augmented[column][element]
      }
    }
  }
  return augmented.map((rowValues, index) => rowValues[size] / rowValues[index])
}

interface LinearModel {
  readonly intercept: number
  readonly weights: readonly number[]
}

interface LogisticFitOptions {
  /** `l2` mirrors the sklearn base estimator (`0.5·‖w‖² + C·Σ logloss`); `none` mirrors Platt. */
  readonly penalty: 'l2' | 'none'
  /** sklearn `C` for the base estimator; `1` for the unregularised Platt fit. */
  readonly scale: number
  readonly sampleWeights?: readonly number[]
}

/**
 * Newton-Raphson logistic regression that reaches the same convex optimum lbfgs targets. With the
 * `l2` penalty it minimises `0.5·‖w‖² + C·Σ logloss` (unpenalised intercept) like the sklearn base
 * estimator; with `none` it is the plain weighted logistic used for Platt calibration.
 */
const fitLogistic = (
  designs: readonly (readonly number[])[],
  outcomes: readonly number[],
  options: LogisticFitOptions,
): LinearModel => {
  if (new Set(outcomes).size !== 2) throw new TwoFeatureContractSkip('single_class_fit')
  const columns = designs[0].length
  const dimension = columns + 1
  const theta = new Array<number>(dimension).fill(0)
  for (let iteration = 0; iteration < NEWTON_MAX_ITER; iteration += 1) {
    const gradient = new Array<number>(dimension).fill(0)
    const hessian = Array.from({ length: dimension }, () => new Array<number>(dimension).fill(0))
    for (let index = 0; index < designs.length; index += 1) {
      const design = designs[index]
      const rowWeight = options.sampleWeights ? options.sampleWeights[index] : 1
      let eta = theta[columns]
      for (let column = 0; column < columns; column += 1) eta += theta[column] * design[column]
      const probability = sigmoid(eta)
      const residual = probability - outcomes[index]
      const variance = probability * (1 - probability)
      const augmented = [...design, 1]
      for (let rowIndex = 0; rowIndex < dimension; rowIndex += 1) {
        gradient[rowIndex] += options.scale * rowWeight * residual * augmented[rowIndex]
        for (let colIndex = 0; colIndex < dimension; colIndex += 1) {
          hessian[rowIndex][colIndex] += options.scale * rowWeight * variance * augmented[rowIndex] * augmented[colIndex]
        }
      }
    }
    // L2 penalty on the weight block only (the intercept, index `columns`, is unpenalised).
    if (options.penalty === 'l2') {
      for (let column = 0; column < columns; column += 1) {
        gradient[column] += theta[column]
        hessian[column][column] += 1
      }
    }
    const step = solveLinearSystem(hessian, gradient)
    let maxStep = 0
    for (let index = 0; index < dimension; index += 1) {
      theta[index] -= step[index]
      maxStep = Math.max(maxStep, Math.abs(step[index]))
    }
    if (maxStep < NEWTON_TOLERANCE) break
  }
  if (!theta.every(Number.isFinite)) throw new TwoFeatureContractSkip('nonfinite_fit')
  return { intercept: theta[columns], weights: theta.slice(0, columns) }
}

const fitBaseEstimator = (
  designs: readonly (readonly number[])[],
  outcomes: readonly number[],
  c: number,
): LinearModel => fitLogistic(designs, outcomes, { penalty: 'l2', scale: c })

const decisionFunction = (model: LinearModel, design: readonly number[]): number => (
  design.reduce((sum, value, index) => sum + value * model.weights[index], model.intercept)
)

interface PlattFit {
  readonly a: number
  readonly b: number
}

/** Unregularised 1-D logistic on OOF margins with origin-balanced weights; stored as `a=-coef,b=-intercept`. */
const fitPlattCalibrator = (input: {
  readonly margins: readonly number[]
  readonly outcomes: readonly number[]
  readonly origins: readonly string[]
}): PlattFit => {
  const originCounts = new Map<string, number>()
  for (const origin of input.origins) originCounts.set(origin, (originCounts.get(origin) ?? 0) + 1)
  const sampleWeights = input.origins.map((origin) => 1 / (originCounts.get(origin) ?? 1))
  const designs = input.margins.map((margin) => [margin])
  const model = fitLogistic(designs, input.outcomes, { penalty: 'none', scale: 1, sampleWeights })
  return { a: -model.weights[0], b: -model.intercept }
}

const predictCalibrated = (calibrator: PlattFit, margin: number): number => {
  const probability = sigmoid(-(calibrator.a * margin + calibrator.b))
  return Math.min(1 - CALIBRATION_EPS, Math.max(CALIBRATION_EPS, probability))
}

interface CrossFittedMargins {
  readonly margins: readonly number[]
  readonly outcomes: readonly number[]
  readonly origins: readonly string[]
}

const evaluateCandidate = (input: {
  readonly c: number
  readonly rowsByOrigin: ReadonlyMap<string, readonly TwoFeatureLogisticTrainRow[]>
  readonly folds: ReturnType<typeof createInnerOofSplit>['folds']
}): { readonly score: TwoFeatureCandidateScore; readonly oof: CrossFittedMargins } => {
  const foldBriers: number[] = []
  const margins: number[] = []
  const outcomes: number[] = []
  const origins: string[] = []
  for (const fold of input.folds) {
    const trainRows = fold.trainOrigins.flatMap((origin) => input.rowsByOrigin.get(origin) ?? [])
    const validationRows = input.rowsByOrigin.get(fold.validationOrigin) ?? []
    if (trainRows.length === 0 || validationRows.length === 0) throw new TwoFeatureContractSkip('inner_oof_split_invalid')
    const stats = fitPreprocessor(trainRows)
    const model = fitBaseEstimator(
      trainRows.map((row) => transformDesign(row, stats)),
      trainRows.map((row) => (row.y ? 1 : 0)),
      input.c,
    )
    let squaredError = 0
    for (const row of validationRows) {
      const margin = decisionFunction(model, transformDesign(row, stats))
      const outcome = row.y ? 1 : 0
      squaredError += (sigmoid(margin) - outcome) ** 2
      margins.push(margin)
      outcomes.push(outcome)
      origins.push(fold.validationOrigin)
    }
    foldBriers.push(squaredError / validationRows.length)
  }
  const meanBrier = foldBriers.reduce((sum, value) => sum + value, 0) / foldBriers.length
  return {
    score: { c: input.c, meanBrier, foldBriers },
    oof: { margins, outcomes, origins },
  }
}

const enforceOofFloors = (oof: CrossFittedMargins): void => {
  const positive = oof.outcomes.filter((outcome) => outcome === 1).length
  const negative = oof.outcomes.length - positive
  if (positive < TWO_FEATURE_MIN_OOF_CLASS_COUNT || negative < TWO_FEATURE_MIN_OOF_CLASS_COUNT) {
    throw new TwoFeatureContractSkip('oof_class_floor')
  }
  if (new Set(oof.origins).size < TWO_FEATURE_MIN_OOF_ORIGIN_COUNT) {
    throw new TwoFeatureContractSkip('oof_origin_floor')
  }
}

const distinctSortedOrigins = (rows: readonly TwoFeatureLogisticTrainRow[]): string[] => (
  [...new Set(rows.map((row) => row.originDate))].sort()
)

const fitComputed = (input: {
  readonly trainRows: readonly TwoFeatureLogisticTrainRow[]
  readonly studyContractId: string
  readonly studyContractSha256: string
}): { readonly artifact: TwoFeatureLogisticArtifact; readonly predict: (row: TwoFeatureLogisticPredictRow) => number } => {
  const origins = distinctSortedOrigins(input.trainRows)
  if (origins.length < 13) throw new TwoFeatureContractSkip('insufficient_train_origins')
  let split: ReturnType<typeof createInnerOofSplit>
  try {
    split = createInnerOofSplit(origins)
  } catch {
    throw new TwoFeatureContractSkip('inner_oof_split_invalid')
  }
  const rowsByOrigin = new Map<string, TwoFeatureLogisticTrainRow[]>()
  for (const row of input.trainRows) {
    const bucket = rowsByOrigin.get(row.originDate) ?? []
    bucket.push(row)
    rowsByOrigin.set(row.originDate, bucket)
  }

  const evaluations = TWO_FEATURE_REGULARIZATION_CANDIDATES.map((c) => evaluateCandidate({ c, rowsByOrigin, folds: split.folds }))
  for (const evaluation of evaluations) enforceOofFloors(evaluation.oof)
  const selectedIndex = evaluations.reduce((best, evaluation, index) => {
    const current = evaluations[best].score
    return (evaluation.score.meanBrier < current.meanBrier
      || (evaluation.score.meanBrier === current.meanBrier && evaluation.score.c < current.c))
      ? index
      : best
  }, 0)
  const selected = evaluations[selectedIndex]

  const calibrator = fitPlattCalibrator(selected.oof)
  const fullStats = fitPreprocessor(input.trainRows)
  const fullModel = fitBaseEstimator(
    input.trainRows.map((row) => transformDesign(row, fullStats)),
    input.trainRows.map((row) => (row.y ? 1 : 0)),
    selected.score.c,
  )
  const oofPositiveCount = selected.oof.outcomes.filter((outcome) => outcome === 1).length

  const body = {
    baselineId: 'logistic-two-feature-v1' as const,
    role: 'secondary_diagnostic' as const,
    featureNames: TWO_FEATURE_LOGISTIC_FEATURE_NAMES,
    studyContractId: input.studyContractId,
    studyContractSha256: input.studyContractSha256,
    innerOofSplitOriginsSha256: split.splitOriginsSha256,
    selectedC: selected.score.c,
    candidateScores: evaluations.map((evaluation) => evaluation.score),
    scaler: { median: fullStats.medians, mad: fullStats.mads },
    coefficients: { intercept: fullModel.intercept, weights: fullModel.weights },
    calibrator,
    trainRowCount: input.trainRows.length,
    trainOrigins: origins,
    oofRowCount: selected.oof.outcomes.length,
    oofPositiveCount,
    oofNegativeCount: selected.oof.outcomes.length - oofPositiveCount,
  }
  const artifact: TwoFeatureLogisticArtifact = { ...body, artifactSha256: canonicalJsonV1Sha256(body) }
  const predict = (row: TwoFeatureLogisticPredictRow): number => (
    predictCalibrated(calibrator, decisionFunction(fullModel, transformDesign(row, fullStats)))
  )
  return { artifact, predict }
}

/**
 * Fits the diagnostic 2-feature logistic on one fold's (or the prospective cycle's) train rows.
 * Returns a `computed` result with a train-only artifact and a scoring closure, or a `not_computed`
 * result carrying the reason the contract could not be honoured.
 */
export function fitTwoFeatureLogistic(input: {
  readonly trainRows: readonly TwoFeatureLogisticTrainRow[]
  readonly studyContractId: string
  readonly studyContractSha256: string
}): TwoFeatureLogisticResult {
  try {
    return { status: 'computed', ...fitComputed(input) }
  } catch (error) {
    if (error instanceof TwoFeatureContractSkip) return { status: 'not_computed', reason: error.reason }
    throw error
  }
}
