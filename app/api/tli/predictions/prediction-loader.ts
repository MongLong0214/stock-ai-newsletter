import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { isSupabasePlaceholder } from '@/lib/supabase'
import { getServerSupabaseClient } from '@/lib/supabase/server-client'
import { loadMethodologyMetricsSummary } from '@/lib/tli/methodology-metrics'
import {
  buildPredictionApiItem,
  parsePredictionV3DbRows,
  type PredictionApiResponse,
  type PredictionPhase,
  type PredictionTrailing90d,
} from '@/lib/tli/predictions-v3-contract'

interface LoadPredictionResponseInput {
  readonly phaseFilter: PredictionPhase | null
  readonly themeId: string | null
}

interface ThemeNameRow {
  readonly id: string
  readonly name: string
}

const latestPredictionDateSchema = z.object({
  prediction_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).nullable()

const themeNameRowsSchema = z.array(z.object({
  id: z.uuid(),
  name: z.string(),
}))

export async function loadPredictionResponse(
  input: LoadPredictionResponseInput,
): Promise<PredictionApiResponse> {
  if (isSupabasePlaceholder) {
    return emptyResponse(input.phaseFilter, 'Prediction data not yet available.')
  }

  const client = getServerSupabaseClient()
  const latestDate = await loadLatestPredictionDate(client, input.themeId)
  if (!latestDate) {
    return emptyResponse(input.phaseFilter, 'Prediction data not yet available.')
  }

  const [rows, metricsSummary] = await Promise.all([
    loadPredictionRows(client, { predictionDate: latestDate, themeId: input.themeId }),
    loadMethodologyMetricsSummary(),
  ])
  const themeNames = await loadThemeNames(client, rows.map((row) => row.theme_id))
  const trailing90d: PredictionTrailing90d = {
    topSignalPrecision: metricsSummary.pAt10,
    n: metricsSummary.nScored,
  }
  const themes = rows
    .map((row) => buildPredictionApiItem({
      row,
      themeName: themeNames.get(row.theme_id) ?? row.theme_id,
      trailing90d,
    }))
    .filter((item) => input.phaseFilter === null || item.phase === input.phaseFilter)

  return {
    phase: input.phaseFilter,
    dataSource: 'theme_predictions_v3',
    themes,
    guidance: themes.length === 0 ? 'No themes match the selected prediction filter.' : undefined,
  }
}

async function loadLatestPredictionDate(
  client: SupabaseClient,
  themeId: string | null,
): Promise<string | null> {
  let query = client
    .from('theme_predictions_v3')
    .select('prediction_date')
    .eq('serving_role', 'champion')
    .order('prediction_date', { ascending: false })
    .limit(1)

  if (themeId) query = query.eq('theme_id', themeId)

  const { data, error } = await query.maybeSingle()
  if (error) throw error
  return latestPredictionDateSchema.parse(data)?.prediction_date ?? null
}

async function loadPredictionRows(
  client: SupabaseClient,
  input: { readonly predictionDate: string; readonly themeId: string | null },
) {
  let query = client
    .from('theme_predictions_v3')
    .select('theme_id, prediction_date, p_rise, ci_lower, ci_upper, abstain, abstain_reasons, model_version')
    .eq('serving_role', 'champion')
    .eq('prediction_date', input.predictionDate)
    .order('theme_id', { ascending: true })

  if (input.themeId) query = query.eq('theme_id', input.themeId)

  const { data, error } = await query
  if (error) throw error
  return parsePredictionV3DbRows(data ?? [])
}

async function loadThemeNames(client: SupabaseClient, themeIds: readonly string[]) {
  if (themeIds.length === 0) return new Map<string, string>()
  const { data, error } = await client
    .from('themes')
    .select('id, name')
    .in('id', themeIds)
  if (error) throw error

  const rows = parseThemeNameRows(data ?? [])
  return new Map(rows.map((row) => [row.id, row.name]))
}

function parseThemeNameRows(data: unknown): ThemeNameRow[] {
  return themeNameRowsSchema.parse(data).map((row) => ({
    id: row.id,
    name: row.name,
  }))
}

function emptyResponse(
  phase: PredictionPhase | null,
  guidance: string,
): PredictionApiResponse {
  return {
    phase,
    dataSource: 'none',
    themes: [],
    guidance,
  }
}

export function isPredictionV3ExposureEnabled(
  value = process.env.TLI_PREDICTIONS_V3_EXPOSURE_ENABLED,
): boolean {
  return value === 'true' || value === '1'
}
