import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { z } from 'zod'
import {
  METRICS_STREAK_DAYS,
  SHADOW_OBSERVATION_DAYS,
  buildShadowTransitionReport,
  type ModelMetricObservation,
  type ModelRegistryObservation,
  type ShadowPredictionObservation,
  type ShadowTransitionReportInput,
} from './shadow-transition-report'

process.env.DOTENV_CONFIG_QUIET = process.env.DOTENV_CONFIG_QUIET ?? 'true'

const args = process.argv.slice(2)

const readArg = (name: string): string | null => {
  const prefix = `--${name}=`
  return args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? null
}

const todayIsoDate = (): string => new Date().toISOString().slice(0, 10)

const ensureParentDir = (path: string): void => {
  mkdirSync(dirname(path), { recursive: true })
}

const writeJson = (path: string, payload: unknown): void => {
  ensureParentDir(path)
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`)
}

const numberFromDb = z.union([z.number(), z.string()]).transform((value) => Number(value))
const nullableNumberFromDb = z.union([numberFromDb, z.null()])

const shadowPredictionRowSchema = z.object({
  prediction_date: z.string(),
  model_version: z.string().min(1),
  serving_role: z.enum(['champion', 'challenger', 'shadow']),
})

const metricRowSchema = z.object({
  metric_date: z.string(),
  model_version: z.string().min(1),
  brier: nullableNumberFromDb,
  coverage: nullableNumberFromDb,
  abstain_rate: nullableNumberFromDb,
  n_scored: z.number().int().nonnegative(),
})

const registryRowSchema = z.object({
  model_version: z.string().min(1),
  status: z.enum(['champion', 'challenger', 'rolled_back', 'archived']),
})

const inputSchema: z.ZodType<ShadowTransitionReportInput> = z.object({
  asOfDate: z.string(),
  shadowPredictions: z.array(z.object({
    predictionDate: z.string(),
    modelVersion: z.string().min(1),
    servingRole: z.enum(['champion', 'challenger', 'shadow']),
  })),
  metrics: z.array(z.object({
    metricDate: z.string(),
    modelVersion: z.string().min(1),
    brier: z.number().nullable(),
    coverage: z.number().nullable(),
    abstainRate: z.number().nullable(),
    nScored: z.number().int().nonnegative(),
  })),
  registry: z.array(z.object({
    modelVersion: z.string().min(1),
    status: z.enum(['champion', 'challenger', 'rolled_back', 'archived']),
  })),
})

const shiftUtcDate = (date: string, days: number): string => {
  const parsed = new Date(`${date}T00:00:00.000Z`)
  parsed.setUTCDate(parsed.getUTCDate() + days)
  return parsed.toISOString().slice(0, 10)
}

const readJsonInput = (path: string): ShadowTransitionReportInput => (
  inputSchema.parse(JSON.parse(readFileSync(path, 'utf8')))
)

async function loadRegistry(): Promise<ModelRegistryObservation[]> {
  const { supabaseAdmin } = await import('../shared/supabase-admin')
  const { data, error } = await supabaseAdmin
    .from('model_registry')
    .select('model_version, status')
    .in('status', ['champion', 'archived', 'rolled_back'])
    .order('promoted_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (error) throw new Error(`model_registry 로딩 실패: ${error.message}`)
  return z.array(registryRowSchema).parse(data ?? []).map((row) => ({
    modelVersion: row.model_version,
    status: row.status,
  }))
}

async function loadShadowPredictions(asOfDate: string): Promise<ShadowPredictionObservation[]> {
  const { supabaseAdmin } = await import('../shared/supabase-admin')
  const startDate = shiftUtcDate(asOfDate, -(SHADOW_OBSERVATION_DAYS - 1))
  const { data, error } = await supabaseAdmin
    .from('theme_predictions_v3')
    .select('prediction_date, model_version, serving_role')
    .eq('serving_role', 'shadow')
    .gte('prediction_date', startDate)
    .lte('prediction_date', asOfDate)

  if (error) throw new Error(`theme_predictions_v3 shadow 로딩 실패: ${error.message}`)
  return z.array(shadowPredictionRowSchema).parse(data ?? []).map((row) => ({
    predictionDate: row.prediction_date,
    modelVersion: row.model_version,
    servingRole: row.serving_role,
  }))
}

async function loadMetrics(asOfDate: string): Promise<ModelMetricObservation[]> {
  const { supabaseAdmin } = await import('../shared/supabase-admin')
  const startDate = shiftUtcDate(asOfDate, -(METRICS_STREAK_DAYS - 1))
  const { data, error } = await supabaseAdmin
    .from('model_metrics_daily')
    .select('metric_date, model_version, brier, coverage, abstain_rate, n_scored')
    .gte('metric_date', startDate)
    .lte('metric_date', asOfDate)

  if (error) throw new Error(`model_metrics_daily 로딩 실패: ${error.message}`)
  return z.array(metricRowSchema).parse(data ?? []).map((row) => ({
    metricDate: row.metric_date,
    modelVersion: row.model_version,
    brier: row.brier,
    coverage: row.coverage,
    abstainRate: row.abstain_rate,
    nScored: row.n_scored,
  }))
}

async function loadDbInput(asOfDate: string): Promise<ShadowTransitionReportInput> {
  const [registry, shadowPredictions, metrics] = await Promise.all([
    loadRegistry(),
    loadShadowPredictions(asOfDate),
    loadMetrics(asOfDate),
  ])
  return { asOfDate, registry, shadowPredictions, metrics }
}

async function main(): Promise<void> {
  const asOfDate = readArg('as-of') ?? todayIsoDate()
  const inputPath = readArg('input')
  const jsonOutput = readArg('json-output')
  const input = inputPath === null ? await loadDbInput(asOfDate) : readJsonInput(inputPath)
  const report = buildShadowTransitionReport(input)

  if (jsonOutput !== null) writeJson(jsonOutput, report)
  console.log(JSON.stringify(report, null, 2))
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
