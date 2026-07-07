import { FEATURE_NAMES } from '@/lib/tli/features/build-features'
import type { FeatureVector } from '@/lib/tli/features/build-features'
import { predictM1T1Probability } from '@/lib/tli/model/predict'
import type { M1ModelArtifact } from '@/lib/tli/model/m1'
import type { PredictionResult } from '@/lib/tli/prediction'

export const TLI_V3_HORIZON_DAYS = 5
export const TLI_V3_LABELER_VERSION = 'gta-v1'
export const TLI_V3_BASELINE_MODEL_VERSION = 'b-abl-v1'
export const TLI_V3_BASELINE_PARAM_VERSION = 'tli-v3-baseline-v1'
export const TLI_V3_M1_PARAM_VERSION = 'tli-v3-m1-shadow-v1'

export type ThemePredictionServingRole = 'champion' | 'challenger' | 'shadow'
export type ThemePredictionScoreStatus = 'pending' | 'scored' | 'censored' | 'excluded'

export interface ThemePredictionV3FeaturePayload {
  readonly featureSchema: readonly string[]
  readonly values: readonly number[]
  readonly missingFlags: readonly boolean[]
}

export interface ThemePredictionV3DraftRow {
  readonly themeId: string
  readonly predictionDate: string
  readonly horizonDays: number
  readonly servingRole: string
  readonly pRise: number | null
  readonly ciLower: number | null
  readonly ciUpper: number | null
  readonly abstain: boolean
  readonly abstainReasons: readonly string[]
  readonly features: ThemePredictionV3FeaturePayload
  readonly modelVersion: string
  readonly labelerVersion: string
  readonly paramVersion: string
  readonly scoreStatus: string
}

export interface ThemePredictionV3Row extends Omit<ThemePredictionV3DraftRow, 'servingRole' | 'scoreStatus'> {
  readonly servingRole: ThemePredictionServingRole
  readonly scoreStatus: ThemePredictionScoreStatus
}

export class ThemePredictionV3ConstraintError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ThemePredictionV3ConstraintError'
  }
}

function parseServingRole(value: string): ThemePredictionServingRole {
  switch (value) {
    case 'champion':
    case 'challenger':
    case 'shadow':
      return value
    default:
      throw new ThemePredictionV3ConstraintError(`serving_role CHECK violation: ${value}`)
  }
}

function parseScoreStatus(value: string): ThemePredictionScoreStatus {
  switch (value) {
    case 'pending':
    case 'scored':
    case 'censored':
    case 'excluded':
      return value
    default:
      throw new ThemePredictionV3ConstraintError(`score_status CHECK violation: ${value}`)
  }
}

export function parsePredictionPhase(value: string): PredictionResult['phase'] {
  switch (value) {
    case 'rising':
    case 'hot':
    case 'cooling':
      return value
    default:
      throw new ThemePredictionV3ConstraintError(`prediction phase is not v3-compatible: ${value}`)
  }
}

function assertProbability(field: string, value: number | null): void {
  if (value === null) return
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new ThemePredictionV3ConstraintError(`${field} CHECK violation: ${value}`)
  }
}

function assertFeaturePayload(features: ThemePredictionV3FeaturePayload): void {
  if (
    features.featureSchema.length !== FEATURE_NAMES.length ||
    features.values.length !== FEATURE_NAMES.length ||
    features.missingFlags.length !== FEATURE_NAMES.length
  ) {
    throw new ThemePredictionV3ConstraintError('features payload length mismatch')
  }
}

export function parseThemePredictionV3Row(draft: ThemePredictionV3DraftRow): ThemePredictionV3Row {
  const servingRole = parseServingRole(draft.servingRole)
  const scoreStatus = parseScoreStatus(draft.scoreStatus)
  assertProbability('p_rise', draft.pRise)
  assertProbability('ci_lower', draft.ciLower)
  assertProbability('ci_upper', draft.ciUpper)
  assertFeaturePayload(draft.features)
  if (!draft.abstain && draft.pRise === null) {
    throw new ThemePredictionV3ConstraintError('p_rise CHECK violation: non-abstain rows require p_rise')
  }
  if (draft.ciLower !== null && draft.ciUpper !== null && draft.ciLower > draft.ciUpper) {
    throw new ThemePredictionV3ConstraintError('ci CHECK violation: ci_lower must be <= ci_upper')
  }
  return {
    ...draft,
    servingRole,
    scoreStatus,
  }
}

const featurePayload = (featureVector: FeatureVector): ThemePredictionV3FeaturePayload => ({
  featureSchema: FEATURE_NAMES,
  values: featureVector.values,
  missingFlags: featureVector.missingFlags,
})

/** b_abl 휴리스틱 채점 — champion/challenger/shadow 어느 serving_role로도 기록 가능한 일반형 (A1) */
export function buildBaselinePredictionV3Row(input: {
  readonly themeId: string
  readonly predictionDate: string
  readonly prediction: Pick<PredictionResult, 'phase'>
  readonly featureVector: FeatureVector
  readonly servingRole?: ThemePredictionServingRole
  readonly modelVersion?: string
}): ThemePredictionV3Row {
  return parseThemePredictionV3Row({
    themeId: input.themeId,
    predictionDate: input.predictionDate,
    horizonDays: TLI_V3_HORIZON_DAYS,
    servingRole: input.servingRole ?? 'champion',
    pRise: input.prediction.phase === 'rising' ? 1 : 0,
    ciLower: null,
    ciUpper: null,
    abstain: false,
    abstainReasons: [],
    features: featurePayload(input.featureVector),
    modelVersion: input.modelVersion ?? TLI_V3_BASELINE_MODEL_VERSION,
    labelerVersion: TLI_V3_LABELER_VERSION,
    paramVersion: TLI_V3_BASELINE_PARAM_VERSION,
    scoreStatus: 'pending',
  })
}

export function buildBaselineChampionPredictionV3Row(input: {
  readonly themeId: string
  readonly predictionDate: string
  readonly prediction: Pick<PredictionResult, 'phase'>
  readonly featureVector: FeatureVector
}): ThemePredictionV3Row {
  return buildBaselinePredictionV3Row(input)
}

/** m1_logistic 채점 — champion/challenger/shadow 어느 serving_role로도 기록 가능한 일반형 (A1) */
export function buildM1PredictionV3Row(input: {
  readonly themeId: string
  readonly predictionDate: string
  readonly featureVector: FeatureVector
  readonly artifact: M1ModelArtifact
  readonly modelVersion: string
  readonly paramVersion: string
  readonly servingRole?: ThemePredictionServingRole
}): ThemePredictionV3Row {
  const pRise = input.featureVector.abstain
    ? null
    : predictM1T1Probability({ artifact: input.artifact, row: input.featureVector })
  return parseThemePredictionV3Row({
    themeId: input.themeId,
    predictionDate: input.predictionDate,
    horizonDays: TLI_V3_HORIZON_DAYS,
    servingRole: input.servingRole ?? 'shadow',
    pRise,
    ciLower: null,
    ciUpper: null,
    abstain: input.featureVector.abstain || pRise === null,
    abstainReasons: input.featureVector.abstain ? input.featureVector.abstainReasons : [],
    features: featurePayload(input.featureVector),
    modelVersion: input.modelVersion,
    labelerVersion: input.artifact.labeler_version,
    paramVersion: input.paramVersion,
    scoreStatus: 'pending',
  })
}

export function buildM1ShadowPredictionV3Row(input: {
  readonly themeId: string
  readonly predictionDate: string
  readonly featureVector: FeatureVector
  readonly artifact: M1ModelArtifact
  readonly modelVersion: string
  readonly paramVersion: string
}): ThemePredictionV3Row {
  return buildM1PredictionV3Row({ ...input, servingRole: 'shadow' })
}

export function toThemePredictionV3Record(row: ThemePredictionV3Row): Record<string, unknown> {
  return {
    theme_id: row.themeId,
    prediction_date: row.predictionDate,
    horizon_days: row.horizonDays,
    serving_role: row.servingRole,
    p_rise: row.pRise,
    ci_lower: row.ciLower,
    ci_upper: row.ciUpper,
    abstain: row.abstain,
    abstain_reasons: row.abstainReasons,
    features: {
      feature_schema: row.features.featureSchema,
      values: row.features.values,
      missing_flags: row.features.missingFlags,
    },
    model_version: row.modelVersion,
    labeler_version: row.labelerVersion,
    param_version: row.paramVersion,
    score_status: row.scoreStatus,
  }
}
