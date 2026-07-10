import { canonicalJsonV1Sha256 } from '@/lib/tli/canonical-json-v1'

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

/**
 * @deprecated Retired by the TLI v3 scientific rebuild: a hard 0/1 probability from the B-Abl phase
 * is not a calibrated comparator and is degenerate under Brier/log loss. Use
 * {@link fitBAblStrataBaseline} + {@link predictBAblStrataBaseline}. Kept only so that the existing
 * `scripts/tli/**` offline-eval and baseline-report callers keep compiling.
 */
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

/**
 * @deprecated Retired by the TLI v3 scientific rebuild: the direction is inverted (it assigns the
 * *base rate* to the bullish branch and `1 - baseRate` to the bearish branch) and it leaks the
 * pooled base rate into every fold. Use the train-only secondary baselines
 * ({@link fitPersistenceBaseline}, {@link fitClimatologyBaseline}). Kept only so that the existing
 * `scripts/tli/**` callers keep compiling.
 */
export function scoreM0(input: {
  readonly interestSlope7d: number
  readonly newsMomentum: number
  readonly baseRate: number
}): number {
  return input.interestSlope7d > 0 && input.newsMomentum > 1
    ? input.baseRate
    : 1 - input.baseRate
}

/** @deprecated Retired with {@link scoreM0}; see that symbol for the replacement contract. */
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

/** @deprecated Reports the two retired baselines; see {@link scoreM0} and {@link buildBAblPredictions}. */
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

export const B_ABL_STRATA = ['rising', 'cooling', 'other', 'missing'] as const
export const PERSISTENCE_STRATA = ['positive', 'nonpositive', 'missing'] as const
/** Climatology pools at most the 26 training origins immediately preceding the test origin. */
export const CLIMATOLOGY_MAX_TRAIN_ORIGINS = 26

export type BAblStratum = (typeof B_ABL_STRATA)[number]
export type PersistenceStratum = (typeof PERSISTENCE_STRATA)[number]
export type ScientificBaselineId = 'babl-strata-v1' | 'climatology-v1' | 'persistence-strata-v1'
export type ScientificBaselineRole = 'primary' | 'secondary_diagnostic'

/** A training row of one immutable study contract. Test rows never reach any `fit*` function. */
export interface ScientificBaselineTrainRow {
  readonly themeId: string
  readonly originDate: string
  readonly studyContractId: string
  readonly studyContractSha256: string
  /** `null` when the study lock has no exact-matching B-Abl observation (0 rows or several). */
  readonly bablPhase: string | null
  readonly interestReturn10d: number | null
  readonly y: boolean
}

/** Scoring input. Carries no label, so a comparator can never read the outcome it predicts. */
export interface ScientificBaselinePredictRow {
  readonly id: string
  readonly themeId: string
  readonly originDate: string
  readonly bablPhase: string | null
  readonly interestReturn10d: number | null
}

export interface StratumFit {
  readonly stratum: string
  readonly trainRowCount: number
  readonly trainPositiveCount: number
  readonly probability: number
  readonly usedGlobalFallback: boolean
}

export interface StrataBaselineArtifact<S extends string> {
  readonly baselineId: ScientificBaselineId
  readonly role: ScientificBaselineRole
  readonly studyContractId: string
  readonly studyContractSha256: string
  readonly trainRowCount: number
  readonly trainPositiveCount: number
  readonly globalFallbackProbability: number
  readonly strata: Readonly<Record<S, StratumFit>>
  readonly artifactSha256: string
}

export interface ClimatologyBaselineArtifact {
  readonly baselineId: 'climatology-v1'
  readonly role: 'secondary_diagnostic'
  readonly studyContractId: string
  readonly studyContractSha256: string
  readonly trainOriginsUsed: readonly string[]
  readonly trainRowCount: number
  readonly trainPositiveCount: number
  readonly probability: number
  readonly artifactSha256: string
}

export interface ScientificBaselineFit {
  readonly primary: StrataBaselineArtifact<BAblStratum>
  readonly secondary: {
    readonly climatology: ClimatologyBaselineArtifact | null
    readonly persistence: StrataBaselineArtifact<PersistenceStratum>
  }
}

/** Jeffreys smoothing `(positive + 0.5) / (n + 1)`, which is always inside the open `(0,1)`. */
export function jeffreysProbability(positiveCount: number, count: number): number {
  if (!Number.isInteger(positiveCount) || !Number.isInteger(count)) {
    throw new Error('jeffreys-probability: counts must be integers')
  }
  if (positiveCount < 0 || count < positiveCount) {
    throw new Error(`jeffreys-probability: invalid counts positive=${positiveCount} n=${count}`)
  }
  return (positiveCount + 0.5) / (count + 1)
}

const assertOpenUnitProbability = (probability: number, context: string): number => {
  if (!Number.isFinite(probability) || probability <= 0 || probability >= 1) {
    throw new Error(`${context}: probability ${probability} is outside the open interval (0,1)`)
  }
  return probability
}

export function toBAblStratum(phase: string | null | undefined): BAblStratum {
  if (phase === null || phase === undefined || phase === '') return 'missing'
  if (phase === 'rising') return 'rising'
  if (phase === 'cooling') return 'cooling'
  return 'other'
}

export function toPersistenceStratum(interestReturn10d: number | null | undefined): PersistenceStratum {
  if (interestReturn10d === null || interestReturn10d === undefined || !Number.isFinite(interestReturn10d)) return 'missing'
  return interestReturn10d > 0 ? 'positive' : 'nonpositive'
}

const resolveStudyContract = (
  rows: readonly ScientificBaselineTrainRow[],
  context: string,
): { readonly studyContractId: string; readonly studyContractSha256: string } => {
  if (rows.length === 0) throw new Error(`${context}: cannot fit a baseline on 0 training rows`)
  const [first] = rows
  for (const row of rows) {
    if (row.studyContractId !== first.studyContractId || row.studyContractSha256 !== first.studyContractSha256) {
      throw new Error(`${context}: mixed study contracts "${first.studyContractId}" and "${row.studyContractId}"`)
    }
  }
  return { studyContractId: first.studyContractId, studyContractSha256: first.studyContractSha256 }
}

const countPositive = (rows: readonly ScientificBaselineTrainRow[]): number => rows.filter((row) => row.y).length

function fitStrataJeffreys<S extends string>(input: {
  readonly baselineId: ScientificBaselineId
  readonly role: ScientificBaselineRole
  readonly rows: readonly ScientificBaselineTrainRow[]
  readonly strata: readonly S[]
  readonly stratumOf: (row: ScientificBaselineTrainRow) => S
}): StrataBaselineArtifact<S> {
  const contract = resolveStudyContract(input.rows, input.baselineId)
  const trainRowCount = input.rows.length
  const trainPositiveCount = countPositive(input.rows)
  const globalFallbackProbability = assertOpenUnitProbability(
    jeffreysProbability(trainPositiveCount, trainRowCount),
    `${input.baselineId}.globalFallback`,
  )

  const strata = {} as Record<S, StratumFit>
  for (const stratum of input.strata) {
    const stratumRows = input.rows.filter((row) => input.stratumOf(row) === stratum)
    const positiveCount = countPositive(stratumRows)
    const usedGlobalFallback = stratumRows.length === 0
    strata[stratum] = {
      stratum,
      trainRowCount: stratumRows.length,
      trainPositiveCount: positiveCount,
      probability: usedGlobalFallback
        ? globalFallbackProbability
        : assertOpenUnitProbability(
          jeffreysProbability(positiveCount, stratumRows.length),
          `${input.baselineId}.${stratum}`,
        ),
      usedGlobalFallback,
    }
  }

  const body = {
    baselineId: input.baselineId,
    role: input.role,
    studyContractId: contract.studyContractId,
    studyContractSha256: contract.studyContractSha256,
    trainRowCount,
    trainPositiveCount,
    globalFallbackProbability,
    strata,
  }
  return { ...body, artifactSha256: canonicalJsonV1Sha256(body) }
}

/**
 * Primary comparator: B-Abl `rising | cooling | other | missing` strata fit with Jeffreys smoothing
 * on train rows only. An unseen stratum falls back to the same smoothing of the whole-train
 * prevalence, so the comparator never abstains for a missing B-Abl tuple.
 */
export function fitBAblStrataBaseline(input: {
  readonly rows: readonly ScientificBaselineTrainRow[]
}): StrataBaselineArtifact<BAblStratum> {
  return fitStrataJeffreys({
    baselineId: 'babl-strata-v1',
    role: 'primary',
    rows: input.rows,
    strata: B_ABL_STRATA,
    stratumOf: (row) => toBAblStratum(row.bablPhase),
  })
}

/** Secondary diagnostic: `interest_return_10d > 0 | <= 0 | missing` strata, train-only Jeffreys. */
export function fitPersistenceBaseline(input: {
  readonly rows: readonly ScientificBaselineTrainRow[]
}): StrataBaselineArtifact<PersistenceStratum> {
  return fitStrataJeffreys({
    baselineId: 'persistence-strata-v1',
    role: 'secondary_diagnostic',
    rows: input.rows,
    strata: PERSISTENCE_STRATA,
    stratumOf: (row) => toPersistenceStratum(row.interestReturn10d),
  })
}

/**
 * Secondary diagnostic: Jeffreys smoothing of every label in at most the 26 training origins
 * immediately preceding the test origin. Returns `null` when there are 0 prior origins.
 */
export function fitClimatologyBaseline(input: {
  readonly rows: readonly ScientificBaselineTrainRow[]
  readonly maxOrigins?: number
}): ClimatologyBaselineArtifact | null {
  if (input.rows.length === 0) return null
  const contract = resolveStudyContract(input.rows, 'climatology-v1')
  const maxOrigins = input.maxOrigins ?? CLIMATOLOGY_MAX_TRAIN_ORIGINS
  const trainOriginsUsed = [...new Set(input.rows.map((row) => row.originDate))].sort().slice(-maxOrigins)
  const usedOriginSet = new Set(trainOriginsUsed)
  const pooledRows = input.rows.filter((row) => usedOriginSet.has(row.originDate))
  const trainPositiveCount = countPositive(pooledRows)

  const body = {
    baselineId: 'climatology-v1',
    role: 'secondary_diagnostic',
    studyContractId: contract.studyContractId,
    studyContractSha256: contract.studyContractSha256,
    trainOriginsUsed,
    trainRowCount: pooledRows.length,
    trainPositiveCount,
    probability: assertOpenUnitProbability(
      jeffreysProbability(trainPositiveCount, pooledRows.length),
      'climatology-v1',
    ),
  } as const
  return { ...body, artifactSha256: canonicalJsonV1Sha256(body) }
}

const predictStratum = <S extends string>(artifact: StrataBaselineArtifact<S>, stratum: S): number => {
  const fit = artifact.strata[stratum]
  if (!fit) throw new Error(`${artifact.baselineId}: stratum "${stratum}" is missing from the fitted artifact`)
  return assertOpenUnitProbability(fit.probability, `${artifact.baselineId}.${stratum}`)
}

export function predictBAblStrataBaseline(
  artifact: StrataBaselineArtifact<BAblStratum>,
  row: ScientificBaselinePredictRow,
): number {
  return predictStratum(artifact, toBAblStratum(row.bablPhase))
}

export function predictPersistenceBaseline(
  artifact: StrataBaselineArtifact<PersistenceStratum>,
  row: ScientificBaselinePredictRow,
): number {
  return predictStratum(artifact, toPersistenceStratum(row.interestReturn10d))
}

export function predictClimatologyBaseline(artifact: ClimatologyBaselineArtifact): number {
  return assertOpenUnitProbability(artifact.probability, artifact.baselineId)
}

/** Fits the primary comparator and the diagnostic secondaries from one outer fold's train rows. */
export function fitScientificBaselines(input: {
  readonly rows: readonly ScientificBaselineTrainRow[]
  readonly climatologyMaxOrigins?: number
}): ScientificBaselineFit {
  return {
    primary: fitBAblStrataBaseline({ rows: input.rows }),
    secondary: {
      climatology: fitClimatologyBaseline({ rows: input.rows, maxOrigins: input.climatologyMaxOrigins }),
      persistence: fitPersistenceBaseline({ rows: input.rows }),
    },
  }
}
