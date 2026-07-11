import { z } from 'zod'

import {
  GTA_HORIZON_DAYS,
  type GtALabelResult,
} from '../../../lib/tli/labels/gt-a'
import {
  GTB_HORIZON_DAYS,
  type GtBLabelResult,
} from '../../../lib/tli/labels/gt-b'
import { supabaseAdmin } from '../shared/supabase-admin'

const FINALIZE_BATCH_SIZE = 500

const commonSchema = z.object({
  id: z.string().uuid(),
  theme_id: z.string().uuid(),
  base_date: z.iso.date(),
  horizon_days: z.literal(5),
})

const gtASchema = commonSchema.extend({
  label_type: z.literal('gt_a'),
  labeler_version: z.literal('gta-v1'),
  g_log_ratio: z.number().finite().nullable(),
  y_binary: z.boolean().nullable(),
  denominator: z.number().finite().nullable(),
  rescale_suspect: z.boolean(),
  low_signal: z.boolean(),
  keyword_epoch: z.number().int().positive(),
  basket_excess_return: z.null(),
  basket_size: z.null(),
  label_status: z.enum(['final', 'censored', 'excluded']),
  exclude_reason: z.enum([
    'insufficient_days',
    'denominator_floor',
    'keyword_epoch_break',
    'non_trading_base_date',
  ]).nullable(),
}).strict()

const gtBSchema = commonSchema.extend({
  label_type: z.literal('gt_b'),
  labeler_version: z.literal('gtb-v1'),
  g_log_ratio: z.null(),
  y_binary: z.null(),
  denominator: z.null(),
  rescale_suspect: z.literal(false),
  low_signal: z.literal(false),
  keyword_epoch: z.literal(1),
  basket_excess_return: z.number().finite().nullable(),
  basket_size: z.number().int().nonnegative(),
  label_status: z.enum(['final', 'excluded']),
  exclude_reason: z.literal('insufficient_prices').nullable(),
}).strict()

const legacyLabelFinalizationSchema = z
  .discriminatedUnion('label_type', [gtASchema, gtBSchema])
  .superRefine((row, context) => {
    if (row.label_type === 'gt_a') {
      if (row.label_status === 'final' && (row.g_log_ratio === null || row.y_binary === null)) {
        context.addIssue({ code: 'custom', message: 'GT-A final payload is incomplete' })
      }
      if (row.label_status !== 'final' && (row.g_log_ratio !== null || row.y_binary !== null)) {
        context.addIssue({ code: 'custom', message: 'GT-A non-final payload cannot carry outcomes' })
      }
      if (row.label_status === 'excluded' && row.exclude_reason === null) {
        context.addIssue({ code: 'custom', message: 'GT-A excluded payload needs a reason' })
      }
      if (row.label_status !== 'excluded' && row.exclude_reason !== null) {
        context.addIssue({ code: 'custom', message: 'GT-A non-excluded payload cannot have a reason' })
      }
      return
    }

    if (row.label_status === 'final' && row.basket_excess_return === null) {
      context.addIssue({ code: 'custom', message: 'GT-B final payload is incomplete' })
    }
    if (row.label_status === 'excluded' && row.exclude_reason === null) {
      context.addIssue({ code: 'custom', message: 'GT-B excluded payload needs a reason' })
    }
    if (row.label_status === 'final' && row.exclude_reason !== null) {
      context.addIssue({ code: 'custom', message: 'GT-B final payload cannot have a reason' })
    }
  })

const legacyLabelFinalizationsSchema = z.array(legacyLabelFinalizationSchema)
const affectedCountSchema = z.number().int().nonnegative()

export type LegacyLabelFinalizationRow = z.infer<typeof legacyLabelFinalizationSchema>

interface LegacyLabelFinalizationRpcError {
  readonly message: string
}

interface LegacyLabelFinalizationRpcResult {
  readonly data: unknown
  readonly error: LegacyLabelFinalizationRpcError | null
}

export type LegacyLabelFinalizationTransport = (
  rows: readonly LegacyLabelFinalizationRow[],
) => Promise<LegacyLabelFinalizationRpcResult>

const defaultTransport: LegacyLabelFinalizationTransport = async (rows) => {
  const { data, error } = await supabaseAdmin.rpc('finalize_tli_legacy_labels', {
    p_rows: rows,
  })
  return { data, error: error === null ? null : { message: error.message } }
}

export class LegacyLabelFinalizationError extends Error {
  readonly name = 'LegacyLabelFinalizationError'
}

export function buildLegacyGtAFinalizationRow(input: {
  readonly id: string
  readonly themeId: string
  readonly baseDate: string
  readonly result: GtALabelResult
}): LegacyLabelFinalizationRow {
  return legacyLabelFinalizationSchema.parse({
    id: input.id,
    theme_id: input.themeId,
    base_date: input.baseDate,
    label_type: 'gt_a',
    horizon_days: GTA_HORIZON_DAYS,
    labeler_version: input.result.labelerVersion,
    g_log_ratio: input.result.gLogRatio,
    y_binary: input.result.yBinary,
    denominator: input.result.denominator,
    rescale_suspect: input.result.rescaleSuspect,
    low_signal: input.result.lowSignal,
    keyword_epoch: input.result.keywordEpoch,
    basket_excess_return: null,
    basket_size: null,
    label_status: input.result.status,
    exclude_reason: input.result.excludeReason,
  })
}

export function buildLegacyGtBFinalizationRow(input: {
  readonly id: string
  readonly themeId: string
  readonly baseDate: string
  readonly result: GtBLabelResult
}): LegacyLabelFinalizationRow {
  if (input.result.status === 'pending') {
    throw new LegacyLabelFinalizationError('GT-B pending 결과는 확정할 수 없습니다')
  }
  return legacyLabelFinalizationSchema.parse({
    id: input.id,
    theme_id: input.themeId,
    base_date: input.baseDate,
    label_type: 'gt_b',
    horizon_days: GTB_HORIZON_DAYS,
    labeler_version: input.result.labelerVersion,
    g_log_ratio: null,
    y_binary: null,
    denominator: null,
    rescale_suspect: false,
    low_signal: false,
    keyword_epoch: 1,
    basket_excess_return: input.result.basketExcessReturn,
    basket_size: input.result.basketSize,
    label_status: input.result.status,
    exclude_reason: input.result.excludeReason,
  })
}

export async function finalizeLegacyLabelRows(
  input: readonly LegacyLabelFinalizationRow[],
  transport: LegacyLabelFinalizationTransport = defaultTransport,
): Promise<number> {
  const rows = legacyLabelFinalizationsSchema.parse(input)
  let finalizedCount = 0

  for (let batchStart = 0; batchStart < rows.length; batchStart += FINALIZE_BATCH_SIZE) {
    const batch = rows.slice(batchStart, batchStart + FINALIZE_BATCH_SIZE)
    const result = await transport(batch)
    if (result.error !== null) {
      throw new LegacyLabelFinalizationError(
        `legacy 라벨 확정 실패 (batch_start=${batchStart}): ${result.error.message}`,
      )
    }
    const parsedCount = affectedCountSchema.safeParse(result.data)
    if (!parsedCount.success || parsedCount.data !== batch.length) {
      const affected = parsedCount.success ? String(parsedCount.data) : 'invalid'
      throw new LegacyLabelFinalizationError(
        `legacy 라벨 확정 영향 행 불일치 (batch_start=${batchStart}, affected=${affected}, expected=${batch.length})`,
      )
    }
    finalizedCount += parsedCount.data
  }

  return finalizedCount
}
