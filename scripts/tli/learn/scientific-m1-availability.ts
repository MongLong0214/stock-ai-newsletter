import type { InnerOofSplit, StudyOrigin } from '../../../lib/tli/eval/types'
import { createInnerOofSplit, distinctOriginDates } from '../../../lib/tli/eval/walk-forward'
import { z } from 'zod'

import type {
  M1ScientificTrainingDataset,
  ScientificM1JoinedRow,
} from './offline-eval-scientific-m1'

export const SCIENTIFIC_M1_AVAILABILITY_SIDECAR_VERSION = 'tli-m1-inner-pit-sidecar-v1'
export const SCIENTIFIC_M1_AVAILABILITY_RECEIPT_VERSION = 'tli-m1-inner-pit-receipt-v1'

export const INNER_PIT_PURGE_REASON = {
  FUTURE_WINDOW: 'future_window_not_before_validation_origin',
  LABEL_FINALIZED: 'label_finalized_after_validation_cutoff',
  SOURCE_COMPLETED: 'label_source_run_completed_after_validation_cutoff',
} as const

const id = z.string().min(1)
const sha256 = z.string().regex(/^[0-9a-f]{64}$/)
const date = z.iso.date()
const timestamp = z.iso.datetime({ precision: 3 })
const reason = z.enum(INNER_PIT_PURGE_REASON)

const originSchema = z.object({
  origin_date: date,
  forecast_cutoff: timestamp,
}).strict()

const rowSchema = z.object({
  row_index: z.number().int().nonnegative(),
  row_id: id,
  theme_id: id,
  base_date: date,
  future_dates: z.array(date).min(1),
  finalized_at: timestamp,
  label_source_run_completed_at: timestamp,
}).strict()

export const scientificM1AvailabilitySidecarSchema = z.object({
  sidecar_version: z.literal(SCIENTIFIC_M1_AVAILABILITY_SIDECAR_VERSION),
  training_input_sha256: sha256,
  inner_oof_split_sha256: sha256,
  origins: z.array(originSchema).min(1),
  rows: z.array(rowSchema).min(1),
}).strict()

const receiptFoldSchema = z.object({
  fold_id: id,
  validation_origin: date,
  validation_forecast_cutoff: timestamp,
  candidate_row_ids: z.array(id).min(1),
  eligible_row_ids: z.array(id).min(1),
  purged_rows: z.array(z.object({
    row_id: id,
    reasons: z.array(reason).min(1),
  }).strict()),
}).strict()

export const scientificM1AvailabilityReceiptSchema = z.object({
  receipt_version: z.literal(SCIENTIFIC_M1_AVAILABILITY_RECEIPT_VERSION),
  training_input_sha256: sha256,
  sidecar_sha256: sha256,
  inner_oof_split_sha256: sha256,
  folds: z.array(receiptFoldSchema).min(1),
}).strict()

export type ScientificM1AvailabilitySidecar = z.infer<typeof scientificM1AvailabilitySidecarSchema>
export type ScientificM1AvailabilityReceipt = z.infer<typeof scientificM1AvailabilityReceiptSchema>

export class ScientificM1AvailabilityError extends Error {
  readonly name = 'ScientificM1AvailabilityError'

  constructor(readonly code: string, readonly detail: string) {
    super(`${code}: ${detail}`)
  }
}

const rowKey = (row: { readonly theme_id: string; readonly base_date: string }): string => (
  `${row.theme_id}|${row.base_date}`
)

const joinedRowKey = (row: ScientificM1JoinedRow): string => `${row.themeId}|${row.baseDate}`

const assertTrainingRowMatch = (
  trainingRow: M1ScientificTrainingDataset['rows'][number],
  joined: ScientificM1JoinedRow,
): void => {
  if (
    joined.abstain
    || joined.y !== trainingRow.y
    || JSON.stringify(joined.features) !== JSON.stringify(trainingRow.features)
    || JSON.stringify(joined.missingFlags) !== JSON.stringify(trainingRow.missing_flags)
  ) throw new ScientificM1AvailabilityError('availability_training_row_mismatch', joined.id)
}

export function buildScientificM1AvailabilitySidecar(input: {
  readonly trainingInputSha256: string
  readonly dataset: M1ScientificTrainingDataset
  readonly joinedRows: readonly ScientificM1JoinedRow[]
  readonly studyOrigins: readonly StudyOrigin[]
  readonly innerOof: InnerOofSplit
}): ScientificM1AvailabilitySidecar {
  const joinedByKey = new Map<string, ScientificM1JoinedRow>()
  for (const row of input.joinedRows) {
    const key = joinedRowKey(row)
    if (joinedByKey.has(key)) throw new ScientificM1AvailabilityError('duplicate_availability_row', key)
    joinedByKey.set(key, row)
  }
  const originByDate = new Map(input.studyOrigins.map((origin) => [origin.originDate, origin]))
  const trainingOrigins = distinctOriginDates(input.dataset.rows.map((row, index) => ({
    id: String(index), themeId: row.theme_id, baseDate: row.base_date,
  })))
  const origins = trainingOrigins.map((originDate) => {
    const origin = originByDate.get(originDate)
    if (origin === undefined) throw new ScientificM1AvailabilityError('missing_training_origin_cutoff', originDate)
    return { origin_date: origin.originDate, forecast_cutoff: origin.forecastCutoff }
  })
  const rows = input.dataset.rows.map((row, index) => {
    const joined = joinedByKey.get(rowKey(row))
    if (joined === undefined) throw new ScientificM1AvailabilityError('missing_availability_row', rowKey(row))
    assertTrainingRowMatch(row, joined)
    return {
      row_index: index,
      row_id: joined.id,
      theme_id: row.theme_id,
      base_date: row.base_date,
      future_dates: [...joined.futureDates],
      finalized_at: joined.labelFinalizedAt,
      label_source_run_completed_at: joined.labelSourceRunCompletedAt,
    }
  })
  const recomputed = createInnerOofSplit(trainingOrigins)
  if (
    recomputed.splitOriginsSha256 !== input.innerOof.splitOriginsSha256
    || JSON.stringify(recomputed) !== JSON.stringify(input.innerOof)
  ) throw new ScientificM1AvailabilityError('availability_inner_oof_mismatch', input.innerOof.splitOriginsSha256)
  return scientificM1AvailabilitySidecarSchema.parse({
    sidecar_version: SCIENTIFIC_M1_AVAILABILITY_SIDECAR_VERSION,
    training_input_sha256: input.trainingInputSha256,
    inner_oof_split_sha256: input.innerOof.splitOriginsSha256,
    origins,
    rows,
  })
}

const classify = (
  row: ScientificM1AvailabilitySidecar['rows'][number],
  validationOrigin: string,
  validationCutoff: string,
): (typeof INNER_PIT_PURGE_REASON)[keyof typeof INNER_PIT_PURGE_REASON][] => {
  const reasons: (typeof INNER_PIT_PURGE_REASON)[keyof typeof INNER_PIT_PURGE_REASON][] = []
  const maximumFuture = [...row.future_dates].sort().at(-1)
  if (maximumFuture === undefined || maximumFuture >= validationOrigin) {
    reasons.push(INNER_PIT_PURGE_REASON.FUTURE_WINDOW)
  }
  const cutoff = Date.parse(validationCutoff)
  if (Date.parse(row.finalized_at) > cutoff) reasons.push(INNER_PIT_PURGE_REASON.LABEL_FINALIZED)
  if (Date.parse(row.label_source_run_completed_at) > cutoff) reasons.push(INNER_PIT_PURGE_REASON.SOURCE_COMPLETED)
  return reasons
}

export function buildExpectedScientificM1AvailabilityReceipt(input: {
  readonly sidecar: ScientificM1AvailabilitySidecar
  readonly sidecarSha256: string
}): ScientificM1AvailabilityReceipt {
  const cutoffByOrigin = new Map(input.sidecar.origins.map((origin) => [origin.origin_date, origin.forecast_cutoff]))
  const split = createInnerOofSplit(input.sidecar.origins.map((origin) => origin.origin_date))
  if (split.splitOriginsSha256 !== input.sidecar.inner_oof_split_sha256) {
    throw new ScientificM1AvailabilityError('availability_sidecar_split_mismatch', split.splitOriginsSha256)
  }
  const folds = split.folds.map((fold) => {
    const validationCutoff = cutoffByOrigin.get(fold.validationOrigin)
    if (validationCutoff === undefined) {
      throw new ScientificM1AvailabilityError('missing_validation_origin_cutoff', fold.validationOrigin)
    }
    const trainOrigins = new Set(fold.trainOrigins)
    const candidates = input.sidecar.rows.filter((row) => trainOrigins.has(row.base_date))
    const classified = candidates.map((row) => ({
      row,
      reasons: classify(row, fold.validationOrigin, validationCutoff),
    }))
    return {
      fold_id: fold.foldId,
      validation_origin: fold.validationOrigin,
      validation_forecast_cutoff: validationCutoff,
      candidate_row_ids: candidates.map((row) => row.row_id),
      eligible_row_ids: classified.filter((row) => row.reasons.length === 0).map((row) => row.row.row_id),
      purged_rows: classified.flatMap((row) => (
        row.reasons.length === 0 ? [] : [{ row_id: row.row.row_id, reasons: row.reasons }]
      )),
    }
  })
  return scientificM1AvailabilityReceiptSchema.parse({
    receipt_version: SCIENTIFIC_M1_AVAILABILITY_RECEIPT_VERSION,
    training_input_sha256: input.sidecar.training_input_sha256,
    sidecar_sha256: input.sidecarSha256,
    inner_oof_split_sha256: input.sidecar.inner_oof_split_sha256,
    folds,
  })
}

export function assertScientificM1AvailabilityReceipt(input: {
  readonly expected: ScientificM1AvailabilityReceipt
  readonly actual: unknown
  readonly fitId: string
}): ScientificM1AvailabilityReceipt {
  const actual = scientificM1AvailabilityReceiptSchema.parse(input.actual)
  if (JSON.stringify(actual) !== JSON.stringify(input.expected)) {
    throw new ScientificM1AvailabilityError('python_inner_pit_receipt_mismatch', input.fitId)
  }
  return actual
}
