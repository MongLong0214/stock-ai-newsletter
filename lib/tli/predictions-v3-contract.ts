import { z } from 'zod'

export const PHASE_DEPRECATION_NOTICE = 'removed_after=2026-09-15, use pRise'

export type PredictionPhase = 'rising' | 'hot' | 'cooling'

type NumericDbValue = number | string | null

export interface PredictionV3DbRow {
  readonly theme_id: string
  readonly prediction_date: string
  readonly p_rise: NumericDbValue
  readonly ci_lower: NumericDbValue
  readonly ci_upper: NumericDbValue
  readonly abstain: boolean
  readonly abstain_reasons: readonly string[] | null
  readonly model_version: string
}

export interface PredictionTrailing90d {
  readonly topSignalPrecision: number | null
  readonly n: number
}

export interface PredictionApiItem {
  readonly id: string
  readonly name: string
  readonly themeId: string
  readonly predictionDate: string
  readonly pRise: number | null
  readonly ciLower: number | null
  readonly ciUpper: number | null
  readonly abstain: boolean
  readonly abstainReasons: readonly string[]
  readonly modelVersion: string
  readonly trailing90d: PredictionTrailing90d
  readonly phase: PredictionPhase | null
  readonly deprecation: {
    readonly phase: string
  }
}

export interface PredictionApiResponse {
  readonly phase: PredictionPhase | null
  readonly dataSource: 'theme_predictions_v3' | 'none'
  readonly themes: readonly PredictionApiItem[]
  readonly guidance?: string
}

export class PredictionV3ContractError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PredictionV3ContractError'
  }
}

const numericDbValueSchema = z.union([z.number(), z.string()]).nullable()

const predictionV3DbRowSchema = z.object({
  theme_id: z.uuid(),
  prediction_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  p_rise: numericDbValueSchema,
  ci_lower: numericDbValueSchema,
  ci_upper: numericDbValueSchema,
  abstain: z.boolean(),
  abstain_reasons: z.array(z.string()).nullable(),
  model_version: z.string().min(1),
})

export function parsePredictionV3DbRows(data: unknown): PredictionV3DbRow[] {
  const parsed = z.array(predictionV3DbRowSchema).parse(data)
  return parsed.map((row) => ({
    theme_id: row.theme_id,
    prediction_date: row.prediction_date,
    p_rise: row.p_rise,
    ci_lower: row.ci_lower,
    ci_upper: row.ci_upper,
    abstain: row.abstain,
    abstain_reasons: row.abstain_reasons,
    model_version: row.model_version,
  }))
}

export function derivePredictionPhase(input: {
  readonly pRise: number | null
  readonly abstain: boolean
}): PredictionPhase | null {
  if (input.abstain || input.pRise === null) return null
  if (input.pRise >= 0.6) return 'rising'
  if (input.pRise >= 0.4) return 'hot'
  return 'cooling'
}

export function buildPredictionApiItem(input: {
  readonly row: PredictionV3DbRow
  readonly themeName: string
  readonly trailing90d: PredictionTrailing90d
}): PredictionApiItem {
  const pRise = normalizeProbability('p_rise', input.row.p_rise)
  const ciLower = normalizeProbability('ci_lower', input.row.ci_lower)
  const ciUpper = normalizeProbability('ci_upper', input.row.ci_upper)
  if (ciLower !== null && ciUpper !== null && ciLower > ciUpper) {
    throw new PredictionV3ContractError('ci bounds invalid: ciLower must be <= ciUpper')
  }

  return {
    id: input.row.theme_id,
    name: input.themeName,
    themeId: input.row.theme_id,
    predictionDate: input.row.prediction_date,
    pRise,
    ciLower,
    ciUpper,
    abstain: input.row.abstain,
    abstainReasons: input.row.abstain_reasons ?? [],
    modelVersion: input.row.model_version,
    trailing90d: input.trailing90d,
    phase: derivePredictionPhase({ pRise, abstain: input.row.abstain }),
    deprecation: { phase: PHASE_DEPRECATION_NOTICE },
  }
}

function normalizeProbability(field: string, value: NumericDbValue): number | null {
  if (value === null) return null
  const numeric = typeof value === 'string' ? Number(value) : value
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 1) {
    throw new PredictionV3ContractError(`${field} must be a probability between 0 and 1`)
  }
  return numeric
}
