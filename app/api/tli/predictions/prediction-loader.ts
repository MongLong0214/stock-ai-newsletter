import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { isSupabasePlaceholder } from '@/lib/supabase'
import { getServerSupabaseClient } from '@/lib/supabase/server-client'
import {
  type PredictionApiResponse,
  type PredictionPhase,
} from '@/lib/tli/predictions-v3-contract'

interface LoadPredictionResponseInput {
  readonly phaseFilter: PredictionPhase | null
  readonly themeId: string | null
}

const verifiedChampionSchema = z.object({
  model_version: z.string().min(1),
  experiment_cycle_id: z.uuid().nullable(),
}).nullable()

export async function loadPredictionResponse(
  input: LoadPredictionResponseInput,
): Promise<PredictionApiResponse> {
  if (isSupabasePlaceholder) {
    return emptyResponse(input.phaseFilter, 'Prediction data not yet available.')
  }

  const client = getServerSupabaseClient()
  const champion = await loadVerifiedScientificChampion(client)
  if (!champion?.experiment_cycle_id) {
    return emptyResponse(input.phaseFilter, 'Prediction data not yet available.')
  }

  return emptyResponse(input.phaseFilter, 'Prediction data not yet available.')
}

async function loadVerifiedScientificChampion(
  client: SupabaseClient,
): Promise<z.infer<typeof verifiedChampionSchema>> {
  const { data, error } = await client
    .from('model_registry')
    .select('model_version, experiment_cycle_id')
    .eq('status', 'champion')
    .eq('scientific_claim_status', 'eligible')
    .eq('scientific_release_status', 'public')
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return verifiedChampionSchema.parse(data)
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
