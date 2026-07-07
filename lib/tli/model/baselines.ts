export interface BaselineGtLabelRow {
  readonly themeId: string
  readonly baseDate: string
  readonly y: boolean
}

export interface BaselineSnapshotRow {
  readonly themeId: string
  readonly snapshotDate: string
  readonly phase: string
}

export interface BaselineFeatureRow {
  readonly themeId: string
  readonly baseDate: string
  readonly values: readonly number[]
  readonly missingFlags: readonly boolean[]
  readonly abstain: boolean
  readonly y: boolean
}

export interface BaselinePrediction {
  readonly id: string
  readonly themeId: string
  readonly baseDate: string
  readonly probability: number | null
  readonly y: boolean
}

export interface BaselineMetrics {
  readonly nScored: number
  readonly totalCandidates: number
  readonly coverage: number
  readonly baseRate: number | null
  readonly brier: number | null
  readonly precision: number | null
  readonly pAt10: number | null
}

export interface BaselineReport {
  readonly baseRate: number | null
  readonly baselines: {
    readonly bAbl: BaselineMetrics
    readonly m0: BaselineMetrics
  }
}

const INTEREST_SLOPE_7D_INDEX = 0
const NEWS_MOMENTUM_INDEX = 5
const DEFAULT_P_AT_K = 10

const makeBaselineId = (themeId: string, baseDate: string) => `${themeId}|${baseDate}`

const computeBaseRate = (labels: readonly { readonly y: boolean }[]): number | null => (
  labels.length === 0 ? null : labels.filter((label) => label.y).length / labels.length
)

const getFeatureValue = (row: BaselineFeatureRow, index: number): number | null => {
  if (row.missingFlags[index]) return null
  const value = row.values[index]
  return value === undefined || !Number.isFinite(value) ? null : value
}

export function buildBAblPredictions(input: {
  readonly labels: readonly BaselineGtLabelRow[]
  readonly snapshots: readonly BaselineSnapshotRow[]
}): BaselinePrediction[] {
  const labelsByKey = new Map(input.labels.map((label) => [makeBaselineId(label.themeId, label.baseDate), label]))
  return input.snapshots.flatMap((snapshot) => {
    const label = labelsByKey.get(makeBaselineId(snapshot.themeId, snapshot.snapshotDate))
    if (!label) return []
    return [{
      id: makeBaselineId(label.themeId, label.baseDate),
      themeId: label.themeId,
      baseDate: label.baseDate,
      probability: snapshot.phase === 'rising' ? 1 : 0,
      y: label.y,
    }]
  })
}

export function scoreM0(input: {
  readonly interestSlope7d: number
  readonly newsMomentum: number
  readonly baseRate: number
}): number {
  return input.interestSlope7d > 0 && input.newsMomentum > 1
    ? input.baseRate
    : 1 - input.baseRate
}

export function buildM0Predictions(input: {
  readonly featureRows: readonly BaselineFeatureRow[]
  readonly baseRate: number | null
}): BaselinePrediction[] {
  return input.featureRows.map((row) => {
    const interestSlope7d = getFeatureValue(row, INTEREST_SLOPE_7D_INDEX)
    const newsMomentum = getFeatureValue(row, NEWS_MOMENTUM_INDEX)
    const canScore = input.baseRate !== null && interestSlope7d !== null && newsMomentum !== null
    return {
      id: makeBaselineId(row.themeId, row.baseDate),
      themeId: row.themeId,
      baseDate: row.baseDate,
      probability: canScore ? scoreM0({ interestSlope7d, newsMomentum, baseRate: input.baseRate }) : null,
      y: row.y,
    }
  })
}

export function evaluateBaselinePredictions(input: {
  readonly predictions: readonly BaselinePrediction[]
  readonly totalCandidates?: number
  readonly pAtK?: number
}): BaselineMetrics {
  const scored = input.predictions.filter((prediction) => prediction.probability !== null)
  const totalCandidates = input.totalCandidates ?? input.predictions.length
  if (scored.length === 0) {
    return {
      nScored: 0,
      totalCandidates,
      coverage: 0,
      baseRate: null,
      brier: null,
      precision: null,
      pAt10: null,
    }
  }

  const positivePredictions = scored.filter((prediction) => (
    prediction.probability !== null && prediction.probability >= 0.5
  ))
  const pAtK = input.pAtK ?? DEFAULT_P_AT_K
  const topK = [...scored]
    .sort((left, right) => {
      const probabilityDiff = (right.probability ?? 0) - (left.probability ?? 0)
      return probabilityDiff === 0 ? left.id.localeCompare(right.id) : probabilityDiff
    })
    .slice(0, pAtK)

  return {
    nScored: scored.length,
    totalCandidates,
    coverage: totalCandidates === 0 ? 0 : scored.length / totalCandidates,
    baseRate: computeBaseRate(scored),
    brier: scored.reduce((sum, prediction) => {
      const actual = prediction.y ? 1 : 0
      return sum + ((prediction.probability ?? 0) - actual) ** 2
    }, 0) / scored.length,
    precision: positivePredictions.length === 0
      ? null
      : positivePredictions.filter((prediction) => prediction.y).length / positivePredictions.length,
    pAt10: topK.length === 0 ? null : topK.filter((prediction) => prediction.y).length / topK.length,
  }
}

export function buildBaselineReport(input: {
  readonly labels: readonly BaselineGtLabelRow[]
  readonly snapshots: readonly BaselineSnapshotRow[]
  readonly featureRows: readonly BaselineFeatureRow[]
}): BaselineReport {
  const baseRate = computeBaseRate(input.labels)
  const bAblPredictions = buildBAblPredictions({ labels: input.labels, snapshots: input.snapshots })
  const m0Predictions = buildM0Predictions({ featureRows: input.featureRows, baseRate })

  return {
    baseRate,
    baselines: {
      bAbl: evaluateBaselinePredictions({
        predictions: bAblPredictions,
        totalCandidates: input.labels.length,
      }),
      m0: evaluateBaselinePredictions({
        predictions: m0Predictions,
        totalCandidates: input.featureRows.length,
      }),
    },
  }
}
