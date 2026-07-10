import { z } from 'zod'
import { isSupabasePlaceholder } from '@/lib/supabase'
import { getServerSupabaseClient } from '@/lib/supabase/server-client'
import { loadMethodologyMetricsSummary } from '@/lib/tli/methodology-metrics'
import {
  buildPredictionApiItem,
  parsePredictionV3DbRows,
  PredictionV3ContractError,
  type PredictionApiResponse,
  type PredictionPhase,
} from '@/lib/tli/predictions-v3-contract'

interface LoadPredictionResponseInput {
  readonly phaseFilter: PredictionPhase | null
  readonly themeId: string | null
}

const themeRowsSchema = z.array(z.object({
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
  const predictionQuery = client
    .from('tli_public_scientific_predictions_v3')
    .select('theme_id, prediction_date, p_rise, ci_lower, ci_upper, abstain, abstain_reasons, model_version')
  const scopedPredictionQuery = input.themeId
    ? predictionQuery.eq('theme_id', input.themeId)
    : predictionQuery
  const { data: predictionData, error: predictionError } = await scopedPredictionQuery
    .order('prediction_date', { ascending: false })
  if (predictionError) throw predictionError

  const allPredictionRows = parsePredictionV3DbRows(predictionData ?? [])
  if (allPredictionRows.length === 0) {
    return emptyResponse(input.phaseFilter, 'Prediction data not yet available.')
  }

  const latestPredictionDate = allPredictionRows.reduce(
    (latest, row) => row.prediction_date > latest ? row.prediction_date : latest,
    allPredictionRows[0].prediction_date,
  )
  const predictionRows = allPredictionRows.filter((row) => row.prediction_date === latestPredictionDate)

  const themeIds = [...new Set(predictionRows.map((row) => row.theme_id))]
  const [themeResult, metrics] = await Promise.all([
    client.from('themes').select('id, name').in('id', themeIds),
    loadMethodologyMetricsSummary(),
  ])
  if (themeResult.error) throw themeResult.error

  const themeNames = new Map(
    themeRowsSchema.parse(themeResult.data ?? []).map((row) => [row.id, row.name]),
  )
  const themes = predictionRows
    .map((row) => {
      const themeName = themeNames.get(row.theme_id)
      if (themeName === undefined) {
        throw new PredictionV3ContractError(`theme metadata missing: ${row.theme_id}`)
      }
      return buildPredictionApiItem({
        row,
        themeName,
        trailing90d: {
          topSignalPrecision: metrics.pAt10,
          n: metrics.nScored,
        },
      })
    })
    .filter((item) => input.phaseFilter === null || item.phase === input.phaseFilter)

  return {
    phase: input.phaseFilter,
    dataSource: 'theme_predictions_v3',
    themes,
  }
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
  return value === 'true'
}
