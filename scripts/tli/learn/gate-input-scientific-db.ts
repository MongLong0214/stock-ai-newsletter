import { z } from 'zod'
import { supabaseAdmin } from '../shared/supabase-admin'
import {
  buildScientificPromotionGateInputFromRows,
  type ScientificExpectedTheme,
  type ScientificPromotionGateInputResult,
} from './gate-input-scientific'

const cycleSchema = z.object({
  id: z.string(), planned_origins: z.number().int().positive(), labeler_version: z.string(),
})
const originSchema = z.object({
  id: z.string(), cycle_id: z.string(), forecast_origin_manifest_id: z.string(),
  sequence_no: z.number().int().positive(), enrollment_role: z.string(),
})
const forecastSchema = z.object({
  id: z.string(), origin_date: z.string(), expected_theme_ids: z.array(z.string()),
  expected_theme_count: z.number().int().positive(),
})
const predictionSchema = z.object({
  id: z.string(), experiment_cycle_id: z.string(), experiment_origin_manifest_id: z.string(),
  theme_id: z.string(), prediction_date: z.string(), horizon_days: z.number().int().positive(),
  labeler_version: z.string(), scientific_prediction_role: z.string(), p_rise: z.number().nullable(),
  ci_lower: z.number().nullable(), ci_upper: z.number().nullable(),
  abstain: z.boolean(), actual_y: z.boolean().nullable(), actual_label_id: z.string().nullable(),
  score_status: z.string(), score_exclusion_reason: z.string().nullable(),
})
const registrySchema = z.object({
  model_version: z.string(), status: z.string(), promoted_at: z.string().nullable(),
})

interface DbResult {
  readonly data: unknown
  readonly error: { readonly message: string } | null
}

const readRows = async <Row>(
  label: string,
  query: PromiseLike<DbResult>,
  schema: z.ZodType<Row>,
): Promise<Row[]> => {
  const { data, error } = await query
  if (error) throw new Error(`${label} 조회 실패: ${error.message}`)
  return z.array(schema).parse(data ?? [])
}

const DB_PAGE_SIZE = 1000

const readAllRows = async <Row>(
  label: string,
  queryPage: (from: number, to: number) => PromiseLike<DbResult>,
  schema: z.ZodType<Row>,
): Promise<Row[]> => {
  const rows: Row[] = []
  for (let from = 0; ; from += DB_PAGE_SIZE) {
    const page = await readRows(label, queryPage(from, from + DB_PAGE_SIZE - 1), schema)
    rows.push(...page)
    if (page.length < DB_PAGE_SIZE) return rows
  }
}

const exactOne = <Row>(rows: readonly Row[], label: string): Row => {
  if (rows.length !== 1) throw new Error(`${label} 조회는 정확히 한 행이어야 합니다: ${rows.length}`)
  const row = rows.at(0)
  if (row === undefined) throw new Error(`${label} 조회 결과가 사라졌습니다`)
  return row
}

export async function buildScientificPromotionGateInputFromDb(input: {
  readonly cycleId: string
  readonly asOfDate: string
}): Promise<ScientificPromotionGateInputResult> {
  const [cycles, allOrigins, registryHistory] = await Promise.all([
    readRows('scientific cycle', supabaseAdmin.from('tli_experiment_cycles').select(
      'id, planned_origins, labeler_version',
    ).eq('id', input.cycleId), cycleSchema),
    readRows('scientific origins', supabaseAdmin.from('tli_experiment_origin_manifests').select(
      'id, cycle_id, forecast_origin_manifest_id, sequence_no, enrollment_role',
    ).eq('cycle_id', input.cycleId), originSchema),
    readRows('model registry', supabaseAdmin.from('model_registry').select(
      'model_version, status, promoted_at',
    ), registrySchema),
  ])
  const cycle = exactOne(cycles, 'scientific cycle')
  const origins = allOrigins
    .filter((row) => row.enrollment_role === 'confirmatory' && row.sequence_no <= cycle.planned_origins)
    .sort((left, right) => left.sequence_no - right.sequence_no)
  if (origins.length !== cycle.planned_origins
    || origins.some((row, index) => row.sequence_no !== index + 1)) {
    throw new Error('scientific gate requires every planned confirmatory origin exactly once')
  }
  const originIds = origins.map((row) => row.id)
  const forecastIds = origins.map((row) => row.forecast_origin_manifest_id)
  const [forecasts, predictions] = await Promise.all([
    readRows('scientific forecasts', supabaseAdmin.from('tli_forecast_origin_manifests').select(
      'id, origin_date, expected_theme_ids, expected_theme_count',
    ).in('id', forecastIds), forecastSchema),
    readAllRows('scientific gate predictions', (from, to) => supabaseAdmin.from('theme_predictions_v3').select(
      'id, experiment_cycle_id, experiment_origin_manifest_id, theme_id, prediction_date, horizon_days, labeler_version, scientific_prediction_role, p_rise, ci_lower, ci_upper, abstain, actual_y, actual_label_id, score_status, score_exclusion_reason',
    ).eq('experiment_cycle_id', cycle.id).in('experiment_origin_manifest_id', originIds)
      .order('id', { ascending: true }).range(from, to), predictionSchema),
  ])

  const expectedThemes: ScientificExpectedTheme[] = []
  for (const origin of origins) {
    const forecast = exactOne(forecasts.filter((row) => row.id === origin.forecast_origin_manifest_id), 'planned forecast')
    if (forecast.expected_theme_count !== forecast.expected_theme_ids.length
      || new Set(forecast.expected_theme_ids).size !== forecast.expected_theme_ids.length) {
      throw new Error(`forecast ${forecast.id} expected universe is inconsistent`)
    }
    expectedThemes.push(...forecast.expected_theme_ids.map((themeId) => ({
      originId: origin.id,
      themeId,
      predictionDate: forecast.origin_date,
      horizonDays: 5,
      labelerVersion: cycle.labeler_version,
    })))
  }
  if (forecasts.length !== origins.length) throw new Error('scientific gate forecast set contains unexpected rows')
  return buildScientificPromotionGateInputFromRows({
    cycleId: cycle.id,
    asOfDate: input.asOfDate,
    expectedThemes,
    predictions,
    registryHistory,
  })
}
