import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { z } from 'zod'
import {
  buildThemeWatchlistReport,
  renderThemeWatchlistMarkdown,
  type ThemeWatchlistFeaturePayload,
  type ThemeWatchlistModelVersionSource,
  type ThemeWatchlistPredictionRow,
  type ThemeWatchlistScoredRow,
} from './theme-watchlist-report'

const DEFAULT_TOP = 5
const DEFAULT_BOTTOM = 3
const THEME_NAME_BATCH_SIZE = 500
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/
export const THEME_WATCHLIST_PREDICTION_SERVING_ROLE = 'challenger'

const usage = [
  'Usage: npm run tli:watchlist -- [--date=YYYY-MM-DD] [--model-version=version] [--top=5] [--bottom=3] [--json-output=path] [--markdown-output=path]',
  '',
  'Builds the internal TLI theme watchlist report from stored challenger predictions.',
].join('\n')

const hasFlag = (args: readonly string[], name: string): boolean => args.includes(`--${name}`)

const readArg = (args: readonly string[], name: string): string | null => {
  const prefix = `--${name}=`
  return args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? null
}

const readPositiveIntegerArg = (args: readonly string[], name: string, fallback: number): number => {
  const value = readArg(args, name)
  if (value === null) return fallback
  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`--${name}는 양의 정수여야 합니다: ${value}`)
  return parsed
}

const readDateArg = (args: readonly string[]): string | null => {
  const value = readArg(args, 'date')
  if (value === null) return null
  if (!isoDatePattern.test(value)) throw new Error(`--date는 YYYY-MM-DD 형식이어야 합니다: ${value}`)
  return value
}

const ensureParentDir = (path: string): void => {
  mkdirSync(dirname(path), { recursive: true })
}

const writeJson = (path: string, payload: unknown): void => {
  ensureParentDir(path)
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`)
}

const writeText = (path: string, payload: string): void => {
  ensureParentDir(path)
  writeFileSync(path, payload)
}

const datedOutputPath = (date: string, extension: 'json' | 'md'): string => (
  `docs/evidence/watchlist/tli-watchlist-${date}.${extension}`
)

const getSupabaseAdmin = async () => (await import('../shared/supabase-admin')).supabaseAdmin

const numberFromDb = z.union([z.number(), z.string()]).transform((value) => Number(value)).refine(Number.isFinite)
const nullableNumberFromDb = z.union([numberFromDb, z.null()])

const featurePayloadSchema = z.object({
  feature_schema: z.array(z.string()),
  values: z.array(numberFromDb),
  missing_flags: z.array(z.boolean()),
})

const modelRegistryRowSchema = z.object({
  model_version: z.string().min(1),
})

const predictionRowSchema = z.object({
  theme_id: z.string().min(1),
  prediction_date: z.string(),
  p_rise: nullableNumberFromDb,
  abstain: z.boolean(),
  features: featurePayloadSchema,
})

const scoredRowSchema = z.object({
  theme_id: z.string().min(1),
  prediction_date: z.string(),
  p_rise: nullableNumberFromDb,
  abstain: z.boolean(),
  actual_y: z.boolean().nullable(),
})

const latestDateRowSchema = z.object({
  prediction_date: z.string(),
})

const themeRowSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
})

const uniqueSorted = (values: readonly string[]): string[] => [...new Set(values)].sort()

const chunk = <T>(values: readonly T[], size: number): T[][] => {
  const chunks: T[][] = []
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size))
  }
  return chunks
}

const normalizeFeatures = (features: z.infer<typeof featurePayloadSchema>): ThemeWatchlistFeaturePayload => ({
  featureSchema: features.feature_schema,
  values: features.values,
  missingFlags: features.missing_flags,
})

export interface ResolvedThemeWatchlistModelVersion {
  readonly modelVersion: string
  readonly modelVersionSource: ThemeWatchlistModelVersionSource
}

async function loadCurrentChallengerModelVersion(): Promise<string> {
  const supabase = await getSupabaseAdmin()
  const { data, error } = await supabase
    .from('model_registry')
    .select('model_version')
    .eq('status', 'challenger')
    .maybeSingle()

  if (error) throw new Error(`model_registry challenger 조회 실패: ${error.message}`)
  if (data === null) throw new Error('model_registry current challenger 조회 실패: challenger 행이 없습니다')
  return modelRegistryRowSchema.parse(data).model_version
}

export async function resolveThemeWatchlistModelVersion(
  args: readonly string[],
  loadRegistryModelVersion: () => Promise<string> = loadCurrentChallengerModelVersion,
): Promise<ResolvedThemeWatchlistModelVersion> {
  const override = readArg(args, 'model-version')
  if (override !== null) {
    const modelVersion = override.trim()
    if (modelVersion.length === 0) throw new Error('--model-version는 비어 있을 수 없습니다')
    return { modelVersion, modelVersionSource: 'override' }
  }
  return { modelVersion: await loadRegistryModelVersion(), modelVersionSource: 'registry' }
}

async function loadLatestPredictionDate(): Promise<string> {
  const supabase = await getSupabaseAdmin()
  const { data, error } = await supabase
    .from('theme_predictions_v3')
    .select('prediction_date')
    .order('prediction_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(`theme_predictions_v3 latest prediction_date 조회 실패: ${error.message}`)
  if (data === null) throw new Error('theme_predictions_v3 예측일이 없습니다')
  return latestDateRowSchema.parse(data).prediction_date
}

async function loadPredictionRows(modelVersion: string, date: string): Promise<ThemeWatchlistPredictionRow[]> {
  const supabase = await getSupabaseAdmin()
  const { data, error } = await supabase
    .from('theme_predictions_v3')
    .select('theme_id, prediction_date, p_rise, abstain, features')
    .eq('serving_role', THEME_WATCHLIST_PREDICTION_SERVING_ROLE)
    .eq('model_version', modelVersion)
    .eq('prediction_date', date)

  if (error) throw new Error(`theme_predictions_v3 challenger rows 로딩 실패: ${error.message}`)
  return z.array(predictionRowSchema).parse(data ?? []).map((row) => ({
    themeId: row.theme_id,
    pRise: row.p_rise,
    abstain: row.abstain,
    features: normalizeFeatures(row.features),
  }))
}

async function loadLatestScoredDate(modelVersion: string): Promise<string | null> {
  const supabase = await getSupabaseAdmin()
  const { data, error } = await supabase
    .from('theme_predictions_v3')
    .select('prediction_date')
    .eq('serving_role', THEME_WATCHLIST_PREDICTION_SERVING_ROLE)
    .eq('model_version', modelVersion)
    .eq('score_status', 'scored')
    .order('prediction_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(`theme_predictions_v3 challenger latest scored date 조회 실패: ${error.message}`)
  return data === null ? null : latestDateRowSchema.parse(data).prediction_date
}

async function loadLatestScoredRows(modelVersion: string): Promise<ThemeWatchlistScoredRow[]> {
  const latestDate = await loadLatestScoredDate(modelVersion)
  if (latestDate === null) return []
  const supabase = await getSupabaseAdmin()
  const { data, error } = await supabase
    .from('theme_predictions_v3')
    .select('theme_id, prediction_date, p_rise, abstain, actual_y')
    .eq('serving_role', THEME_WATCHLIST_PREDICTION_SERVING_ROLE)
    .eq('model_version', modelVersion)
    .eq('score_status', 'scored')
    .eq('prediction_date', latestDate)

  if (error) throw new Error(`theme_predictions_v3 challenger scored rows 로딩 실패: ${error.message}`)
  return z.array(scoredRowSchema).parse(data ?? []).map((row) => ({
    themeId: row.theme_id,
    predictionDate: row.prediction_date,
    pRise: row.p_rise,
    abstain: row.abstain,
    actualY: row.actual_y,
  }))
}

async function loadThemeNames(themeIds: readonly string[]): Promise<Map<string, string>> {
  const ids = uniqueSorted(themeIds)
  if (ids.length === 0) return new Map()
  const supabase = await getSupabaseAdmin()
  const responses = await Promise.all(chunk(ids, THEME_NAME_BATCH_SIZE).map((batch) => supabase
    .from('themes')
    .select('id, name')
    .in('id', batch)))

  const rows = responses.flatMap((response) => {
    if (response.error) throw new Error(`themes 이름 로딩 실패: ${response.error.message}`)
    return response.data ?? []
  })
  return new Map(z.array(themeRowSchema).parse(rows).map((row) => [row.id, row.name]))
}

export async function runThemeWatchlistReport(args: readonly string[] = process.argv.slice(2)): Promise<void> {
  if (hasFlag(args, 'help')) {
    console.log(usage)
    return
  }

  const top = readPositiveIntegerArg(args, 'top', DEFAULT_TOP)
  const bottom = readPositiveIntegerArg(args, 'bottom', DEFAULT_BOTTOM)
  const { modelVersion, modelVersionSource } = await resolveThemeWatchlistModelVersion(args)
  const date = readDateArg(args) ?? await loadLatestPredictionDate()
  const jsonOutput = readArg(args, 'json-output') ?? datedOutputPath(date, 'json')
  const markdownOutput = readArg(args, 'markdown-output') ?? datedOutputPath(date, 'md')
  const [rows, scoredRows] = await Promise.all([
    loadPredictionRows(modelVersion, date),
    loadLatestScoredRows(modelVersion),
  ])
  const themeNames = await loadThemeNames(rows.map((row) => row.themeId))
  const report = buildThemeWatchlistReport({
    date,
    modelVersion,
    modelVersionSource,
    rows,
    themeNames,
    scoredRows,
    top,
    bottom,
  })

  writeJson(jsonOutput, report)
  writeText(markdownOutput, renderThemeWatchlistMarkdown(report))
  console.log(JSON.stringify({
    date,
    modelVersion,
    modelVersionSource,
    risingCount: report.rising.length,
    coverage: report.shadowHealth.coverage,
  }))
}

const isDirectRun = process.argv[1]?.includes('run-theme-watchlist-report') ?? false

if (isDirectRun) {
  runThemeWatchlistReport().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
