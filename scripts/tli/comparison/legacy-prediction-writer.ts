import { z } from 'zod'

import { supabaseAdmin } from '@/scripts/tli/shared/supabase-admin'

const CHUNK_SIZE = 500

const probabilitySchema = z.number().finite().min(0).max(1).nullable()
const legacyPredictionSchema = z.object({
  theme_id: z.string().min(1),
  prediction_date: z.iso.date(),
  horizon_days: z.number().int().positive(),
  serving_role: z.enum(['champion', 'challenger', 'shadow']),
  p_rise: probabilitySchema,
  ci_lower: probabilitySchema,
  ci_upper: probabilitySchema,
  abstain: z.boolean(),
  abstain_reasons: z.array(z.string()),
  features: z.record(z.string(), z.unknown()),
  model_version: z.string().min(1),
  labeler_version: z.string().min(1),
  param_version: z.string().min(1),
  score_status: z.literal('pending'),
}).strict()
const legacyPredictionsSchema = z.array(legacyPredictionSchema)
const affectedCountSchema = z.number().int().nonnegative()

type LegacyPredictionRecord = z.infer<typeof legacyPredictionSchema>

interface LegacyPredictionRpcError {
  readonly message: string
}

interface LegacyPredictionRpcResult {
  readonly data: unknown
  readonly error: LegacyPredictionRpcError | null
}

export type LegacyPredictionRpcTransport = (
  rows: readonly LegacyPredictionRecord[],
) => Promise<LegacyPredictionRpcResult>

const defaultTransport: LegacyPredictionRpcTransport = async (rows) => {
  const { data, error } = await supabaseAdmin.rpc('upsert_tli_legacy_predictions_v3', {
    p_rows: rows,
  })
  return {
    data,
    error: error === null ? null : { message: error.message },
  }
}

export class LegacyPredictionUpsertError extends Error {
  readonly name = 'LegacyPredictionUpsertError'
}

export async function upsertLegacyPredictionsV3(
  input: readonly Record<string, unknown>[],
  transport: LegacyPredictionRpcTransport = defaultTransport,
): Promise<number> {
  const rows = legacyPredictionsSchema.parse(input)
  let affectedRows = 0

  for (let offset = 0; offset < rows.length; offset += CHUNK_SIZE) {
    const chunk = rows.slice(offset, offset + CHUNK_SIZE)
    const result = await transport(chunk)
    if (result.error !== null) {
      throw new LegacyPredictionUpsertError(
        `legacy prediction upsert failed at rows ${offset}-${offset + chunk.length - 1}: ${result.error.message}`,
      )
    }
    const affected = affectedCountSchema.parse(result.data)
    if (affected !== chunk.length) {
      throw new LegacyPredictionUpsertError(
        `legacy prediction upsert affected ${affected} of ${chunk.length} rows`,
      )
    }
    affectedRows += affected
  }

  return affectedRows
}
