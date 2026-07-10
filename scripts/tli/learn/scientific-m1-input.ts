import { compareUtf8Bytes, sha256CanonicalJson } from '../../../lib/tli/canonical-json'
import type { StudyOrigin } from '../../../lib/tli/eval/types'
import type { ConfirmatoryFeatureInput } from '../../../lib/tli/features/build-confirmatory-features'
import { z } from 'zod'

import {
  CONFIRMATORY_HORIZON_DAYS,
  CONFIRMATORY_LABELER_VERSION,
  CONFIRMATORY_QUERY_CONTRACT,
  DATASET_MANIFEST_VERSION,
  type DatasetRow,
  type LoadedDataset,
} from './dataset-manifest'

const idSchema = z.string().min(1)
const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/)
const dateSchema = z.iso.date()
const timestampSchema = z.iso.datetime({ precision: 3 })
const finiteSchema = z.number().finite()
const statusSchema = z.enum(['complete', 'partial', 'failed'])

const interestRunSchema = z.object({
  id: idSchema, responseSha256: sha256Schema, status: statusSchema,
  sourceMaxDate: dateSchema, completedAt: timestampSchema,
}).strict()
const interestObservationSchema = z.object({
  id: idSchema, collectionRunId: idSchema, themeId: idSchema, tradingDate: dateSchema,
  rawValue: finiteSchema, normalized: finiteSchema, anchorScaledValue: finiteSchema.nullable(),
}).strict()
const newsObservationSchema = z.object({
  id: idSchema, collectionRunId: idSchema, themeId: idSchema, articleDate: dateSchema,
  articleCount: z.number().int().nonnegative(), queryHash: idSchema, collectedAt: timestampSchema,
}).strict()
const newsRunSchema = z.object({
  id: idSchema, responseSha256: sha256Schema, status: statusSchema, sourceMaxDate: dateSchema,
  collectedAt: timestampSchema, completedAt: timestampSchema,
}).strict()
const bablLockSchema = z.object({
  algorithmVersion: idSchema, comparisonSpecVersion: idSchema,
  evaluationHorizonDays: z.number().int().positive(), candidatePoolRule: z.literal('source_prod_run_v1'),
}).strict()
const bablObservationSchema = z.object({
  id: idSchema, collectionRunId: idSchema, themeId: idSchema, snapshotDate: dateSchema,
  phase: z.string(), algorithmVersion: idSchema, comparisonSpecVersion: idSchema,
  evaluationHorizonDays: z.number().int().positive(), candidatePool: idSchema,
  sourcePredictionSnapshotId: idSchema, computedAt: timestampSchema, payloadHash: sha256Schema,
  sourceRunStatus: statusSchema,
}).strict()

const confirmatoryFeatureInputSchema: z.ZodType<ConfirmatoryFeatureInput> = z.object({
  studyOriginManifestId: idSchema,
  studyOriginManifestSha256: sha256Schema,
  studyContractId: idSchema,
  studyContractSha256: sha256Schema,
  featureContractVersion: z.literal('tli-attention-v2-f1'),
  featureContractSha256: sha256Schema,
  forecastOriginManifestId: idSchema,
  forecastOriginManifestSha256: sha256Schema,
  themeId: idSchema,
  baseDate: dateSchema,
  cutoffAt: timestampSchema,
  interestRun: interestRunSchema.nullable(),
  interestObservations: z.array(interestObservationSchema),
  newsObservationIds: z.array(idSchema),
  newsInputSha256: sha256Schema.nullable(),
  newsObservations: z.array(newsObservationSchema),
  newsRuns: z.array(newsRunSchema),
  bablLock: bablLockSchema,
  bablObservationId: idSchema.nullable(),
  bablInputSha256: sha256Schema.nullable(),
  bablCandidatePool: idSchema.nullable(),
  bablMissingReason: z.enum([
    'no_matching_observation',
    'multiple_matching_observations',
    'source_run_not_complete',
    'source_after_cutoff',
    'source_pool_mismatch',
  ]).nullable(),
  bablObservation: bablObservationSchema.nullable(),
}).strict()

const datasetRowSchema: z.ZodType<DatasetRow> = z.object({
  id: idSchema, themeId: idSchema, baseDate: dateSchema,
  horizonDays: z.literal(CONFIRMATORY_HORIZON_DAYS),
  forecastOriginManifestId: idSchema, studyOriginManifestId: idSchema, labelSourceRunId: idSchema,
  finalizedAt: timestampSchema, labelSourceRunCompletedAt: timestampSchema,
  yBinary: z.boolean(), gLogRatio: finiteSchema,
  pastDates: z.array(dateSchema), futureDates: z.array(dateSchema),
}).strict()

const queryContractSchema = z.object({
  label_type: z.literal(CONFIRMATORY_QUERY_CONTRACT.label_type),
  labeler_version: z.literal(CONFIRMATORY_QUERY_CONTRACT.labeler_version),
  horizon_days: z.literal(CONFIRMATORY_QUERY_CONTRACT.horizon_days),
  label_status: z.literal(CONFIRMATORY_QUERY_CONTRACT.label_status),
  scientific_use_status: z.literal(CONFIRMATORY_QUERY_CONTRACT.scientific_use_status),
  scientific_use_reason: z.literal(CONFIRMATORY_QUERY_CONTRACT.scientific_use_reason),
  rescale_suspect: z.literal(CONFIRMATORY_QUERY_CONTRACT.rescale_suspect),
  outcome: z.literal(CONFIRMATORY_QUERY_CONTRACT.outcome),
  finalized_at: z.literal(CONFIRMATORY_QUERY_CONTRACT.finalized_at),
  label_source_run_completed_at: z.literal(CONFIRMATORY_QUERY_CONTRACT.label_source_run_completed_at),
  study_origin_binding: z.literal(CONFIRMATORY_QUERY_CONTRACT.study_origin_binding),
  keyset: z.literal(CONFIRMATORY_QUERY_CONTRACT.keyset),
}).strict()

const loadedDatasetSchema: z.ZodType<LoadedDataset> = z.object({
  manifest: z.object({
    manifest_version: z.literal(DATASET_MANIFEST_VERSION),
    study_contract_id: idSchema, study_contract_sha256: sha256Schema,
    labeler_version: z.literal(CONFIRMATORY_LABELER_VERSION), label_contract_sha256: sha256Schema,
    feature_contract_version: idSchema, feature_contract_sha256: sha256Schema,
    horizon_days: z.literal(CONFIRMATORY_HORIZON_DAYS), as_of_cutoff: timestampSchema,
    query_contract: queryContractSchema,
    row_count: z.number().int().nonnegative(), unique_key_count: z.number().int().nonnegative(),
    min_base_date: dateSchema.nullable(), max_base_date: dateSchema.nullable(),
    forecast_origin_manifest_ids: z.array(idSchema), study_origin_manifest_ids: z.array(idSchema),
    label_source_run_ids: z.array(idSchema), ordered_rows_sha256: sha256Schema,
  }).strict(),
  manifestSha256: sha256Schema,
  rows: z.array(datasetRowSchema),
}).strict()

const originSchema: z.ZodType<StudyOrigin> = z.object({
  originDate: dateSchema,
  forecastCutoff: timestampSchema,
}).strict()

export type ScientificM1StudyInput = {
  readonly cycleId: string
  readonly dataset: LoadedDataset
  readonly origins: readonly StudyOrigin[]
  readonly featureInputs: readonly ConfirmatoryFeatureInput[]
}

export const scientificM1StudyInputSchema: z.ZodType<ScientificM1StudyInput> = z.object({
  cycleId: z.string().uuid().refine((value) => value === value.toLowerCase(), 'cycleId must be a canonical lowercase UUID'),
  dataset: loadedDatasetSchema,
  origins: z.array(originSchema),
  featureInputs: z.array(confirmatoryFeatureInputSchema),
}).strict()

export class ScientificM1InputError extends Error {
  readonly name = 'ScientificM1InputError'
}

const canonicalDatasetRow = (row: DatasetRow) => ({
  base_date: row.baseDate, theme_id: row.themeId, id: row.id, horizon_days: row.horizonDays,
  labeler_version: CONFIRMATORY_LABELER_VERSION,
  forecast_origin_manifest_id: row.forecastOriginManifestId,
  study_origin_manifest_id: row.studyOriginManifestId,
  label_source_run_id: row.labelSourceRunId,
  finalized_at: row.finalizedAt,
  label_source_run_completed_at: row.labelSourceRunCompletedAt,
  y_binary: row.yBinary, g_log_ratio: row.gLogRatio,
  past_dates: [...row.pastDates], future_dates: [...row.futureDates],
})

const sortedUnique = (values: readonly string[]): string[] => [...new Set(values)].sort(compareUtf8Bytes)

const equalStrings = (left: readonly string[], right: readonly string[]): boolean => (
  left.length === right.length && left.every((value, index) => value === right[index])
)

const assertDatasetManifest = (dataset: LoadedDataset): void => {
  const { manifest, rows } = dataset
  if (sha256CanonicalJson(manifest) !== dataset.manifestSha256) {
    throw new ScientificM1InputError('dataset manifest SHA-256 mismatch')
  }
  if (sha256CanonicalJson(rows.map(canonicalDatasetRow)) !== manifest.ordered_rows_sha256) {
    throw new ScientificM1InputError('dataset ordered row SHA-256 mismatch')
  }
  const keys = rows.map((row) => `${row.baseDate}|${row.themeId}|${row.horizonDays}`)
  const uniqueKeyCount = new Set(keys).size
  if (
    manifest.row_count !== rows.length
    || manifest.unique_key_count !== uniqueKeyCount
    || uniqueKeyCount !== rows.length
  ) {
    throw new ScientificM1InputError('dataset manifest row cardinality mismatch')
  }
  const sortedRows = [...rows].sort((left, right) => (
    left.baseDate.localeCompare(right.baseDate)
    || compareUtf8Bytes(left.themeId, right.themeId)
    || compareUtf8Bytes(left.id, right.id)
  ))
  if (!rows.every((row, index) => row.id === sortedRows[index]?.id)) {
    throw new ScientificM1InputError('dataset rows are not in canonical keyset order')
  }
  const arraysMatch = equalStrings(manifest.forecast_origin_manifest_ids, sortedUnique(rows.map((row) => row.forecastOriginManifestId)))
    && equalStrings(manifest.study_origin_manifest_ids, sortedUnique(rows.map((row) => row.studyOriginManifestId)))
    && equalStrings(manifest.label_source_run_ids, sortedUnique(rows.map((row) => row.labelSourceRunId)))
  const minimum = rows.at(0)?.baseDate ?? null
  const maximum = rows.at(-1)?.baseDate ?? null
  if (!arraysMatch || manifest.min_base_date !== minimum || manifest.max_base_date !== maximum) {
    throw new ScientificM1InputError('dataset manifest identity summary mismatch')
  }
}

export function parseScientificM1StudyInput(value: unknown): ScientificM1StudyInput {
  const input = scientificM1StudyInputSchema.parse(value)
  assertDatasetManifest(input.dataset)
  return input
}
