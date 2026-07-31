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
  const { data: predictionData, error: predictionError } = await client.rpc(
    'load_tli_latest_public_scientific_predictions_v3',
    { p_theme_id: input.themeId },
  )
  if (predictionError) throw predictionError

  const predictionRows = parsePredictionV3DbRows(predictionData ?? [])
  if (predictionRows.length === 0) {
    return emptyResponse(input.phaseFilter, 'Prediction data not yet available.')
  }

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
