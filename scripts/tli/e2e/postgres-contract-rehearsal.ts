import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

import { z } from 'zod'

const CONTAINER_NAME = process.argv[2] ?? 'tli-e2e-dryrun'
const ACTION = z.enum(['study-lock', 'cycle-freeze']).parse(process.argv[3])
const jsonObject = z.record(z.string(), z.unknown())
const studySchema = z.object({
  controlRowId: z.string().uuid(),
  controlVersion: z.string().min(1),
  payload: jsonObject,
  payloadSha256: z.string().regex(/^[0-9a-f]{64}$/),
  lockedAt: z.string().datetime(),
  gitCommitSha: z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/),
  gitBlobSha: z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/),
  repoRelativePath: z.string().min(1),
  verifierCodeSha256: z.string().regex(/^[0-9a-f]{64}$/),
})
const envelopeSchema = z.object({
  artifact_type: z.enum(['preregistration', 'dataset_manifest', 'model_manifest', 'cycle_manifest']),
  artifact_key: z.literal('singleton'),
  content_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  canonical_json: z.string().min(2),
  git_commit_sha: z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/),
  git_blob_sha: z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/),
  repo_relative_path: z.string().min(1),
  verifier_version: z.literal('tli-local-fixture-verifier-v1'),
  verifier_code_sha: z.string().regex(/^[0-9a-f]{64}$/),
  verified_at: z.string().datetime(),
  payload: jsonObject,
})
const freezeSchema = z.object({
  cycleId: z.string().uuid(),
  plannedOrigins: z.literal(24),
  sourceDatasetManifestSha256: z.string().regex(/^[0-9a-f]{64}$/),
  datasetManifestSha256: z.string().regex(/^[0-9a-f]{64}$/),
  modelManifestSha256: z.string().regex(/^[0-9a-f]{64}$/),
  cycleManifestSha256: z.string().regex(/^[0-9a-f]{64}$/),
  cycleRow: jsonObject,
  evidenceEnvelopes: z.array(envelopeSchema).length(4),
})

const sqlLiteral = (value: string): string => `'${value.replace(/'/g, "''")}'`
const jsonLiteral = (value: unknown): string => `${sqlLiteral(JSON.stringify(value))}::JSONB`
const field = (row: Record<string, unknown>, name: string): string => {
  const value = row[name]
  if (typeof value !== 'string') throw new TypeError(`cycle row field ${name} must be a string`)
  return value
}
const numericField = (row: Record<string, unknown>, name: string): number => {
  const value = row[name]
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`cycle row field ${name} must be finite`)
  }
  return value
}

const psql = (sql: string): string => {
  const result = spawnSync('docker', [
    'exec', '-i', CONTAINER_NAME,
    'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres',
  ], { encoding: 'utf8', input: sql })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) throw new Error(`psql exit ${result.status ?? 'signal'}: ${result.stderr.trim()}`)
  return result.stdout.trim().split('\n').at(-1) ?? ''
}

const studySql = (input: z.infer<typeof studySchema>): string => {
  const payload = input.payload
  return `
BEGIN;
INSERT INTO public.comparison_v4_control (id, production_version, serving_enabled)
VALUES (${sqlLiteral(input.controlRowId)}::UUID, ${sqlLiteral(input.controlVersion)}, true);
INSERT INTO public.tli_attention_study_contracts (
  id, contract_version, locked_at, first_origin_date, babl_algorithm_version,
  babl_comparison_spec_version, babl_evaluation_horizon_days, babl_candidate_pool_rule,
  babl_control_row_id, babl_control_sha256, labeler_version, label_contract_sha256,
  feature_contract_version, feature_contract_sha256, payload_sha256, git_commit_sha,
  git_blob_sha, repo_relative_path, verifier_version, verifier_code_sha, verified_at
) VALUES (
  ${sqlLiteral(field(payload, 'id'))}::UUID, ${sqlLiteral(field(payload, 'contract_version'))},
  ${sqlLiteral(input.lockedAt)}::TIMESTAMPTZ, ${sqlLiteral(field(payload, 'first_origin_date'))}::DATE,
  ${sqlLiteral(field(payload, 'babl_algorithm_version'))}, ${sqlLiteral(field(payload, 'babl_comparison_spec_version'))},
  ${numericField(payload, 'babl_evaluation_horizon_days')}, ${sqlLiteral(field(payload, 'babl_candidate_pool_rule'))},
  ${sqlLiteral(field(payload, 'babl_control_row_id'))}::UUID, ${sqlLiteral(field(payload, 'babl_control_sha256'))},
  ${sqlLiteral(field(payload, 'labeler_version'))}, ${sqlLiteral(field(payload, 'label_contract_sha256'))},
  ${sqlLiteral(field(payload, 'feature_contract_version'))}, ${sqlLiteral(field(payload, 'feature_contract_sha256'))},
  ${sqlLiteral(input.payloadSha256)}, ${sqlLiteral(input.gitCommitSha)}, ${sqlLiteral(input.gitBlobSha)},
  ${sqlLiteral(input.repoRelativePath)}, 'tli-local-fixture-verifier-v1',
  ${sqlLiteral(input.verifierCodeSha256)}, ${sqlLiteral(input.lockedAt)}::TIMESTAMPTZ
);
SELECT json_build_object(
  'studyContractId', id::TEXT, 'payloadSha256', payload_sha256,
  'lockedAt', to_char(locked_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'lockedBeforeFirstOrigin', locked_at < ((first_origin_date::TIMESTAMP + TIME '18:00') AT TIME ZONE 'Asia/Seoul'),
  'storage', 'tli_attention_study_contracts'
)::TEXT FROM public.tli_attention_study_contracts WHERE id = ${sqlLiteral(field(payload, 'id'))}::UUID;
COMMIT;`
}

const freezeSql = (input: z.infer<typeof freezeSchema>): string => {
  const row = input.cycleRow
  const rpcEnvelopes = input.evidenceEnvelopes.map((envelope) => ({
    artifact_type: envelope.artifact_type,
    artifact_key: envelope.artifact_key,
    content_sha256: envelope.content_sha256,
    canonical_json: envelope.canonical_json,
    git_commit_sha: envelope.git_commit_sha,
    git_blob_sha: envelope.git_blob_sha,
    repo_relative_path: envelope.repo_relative_path,
    verifier_version: envelope.verifier_version,
    verifier_code_sha: envelope.verifier_code_sha,
    verified_at: envelope.verified_at,
  }))
  return `
BEGIN;
INSERT INTO public.tli_experiment_cycles (
  id, status, study_contract_id, study_contract_sha256, candidate_model_version,
  candidate_model_sha256, comparator_version, comparator_artifact_sha256,
  dataset_manifest_sha256, feature_contract_version, feature_contract_sha256,
  labeler_version, label_contract_sha256, calibration_version, calibration_artifact_sha256,
  babl_contract_sha256, primary_endpoint, alpha, thresholds, power_simulation_sha256,
  power_simulation_result, planned_origins, safety_origins, calendar_start,
  initial_calendar_end, preregistration_sha256, preregistration_payload
) VALUES (
  ${sqlLiteral(input.cycleId)}::UUID, 'draft', ${sqlLiteral(field(row, 'study_contract_id'))}::UUID,
  ${sqlLiteral(field(row, 'study_contract_sha256'))}, ${sqlLiteral(field(row, 'candidate_model_version'))},
  ${sqlLiteral(field(row, 'candidate_model_sha256'))}, ${sqlLiteral(field(row, 'comparator_version'))},
  ${sqlLiteral(field(row, 'comparator_artifact_sha256'))}, ${sqlLiteral(field(row, 'dataset_manifest_sha256'))},
  ${sqlLiteral(field(row, 'feature_contract_version'))}, ${sqlLiteral(field(row, 'feature_contract_sha256'))},
  ${sqlLiteral(field(row, 'labeler_version'))}, ${sqlLiteral(field(row, 'label_contract_sha256'))},
  ${sqlLiteral(field(row, 'calibration_version'))}, ${sqlLiteral(field(row, 'calibration_artifact_sha256'))},
  ${sqlLiteral(field(row, 'babl_contract_sha256'))}, ${sqlLiteral(field(row, 'primary_endpoint'))},
  ${numericField(row, 'alpha')}, ${jsonLiteral(row.thresholds)}, ${sqlLiteral(field(row, 'power_simulation_sha256'))},
  ${jsonLiteral(row.power_simulation_result)}, ${numericField(row, 'planned_origins')},
  ${numericField(row, 'safety_origins')}, ${sqlLiteral(field(row, 'calendar_start'))}::DATE,
  ${sqlLiteral(field(row, 'initial_calendar_end'))}::DATE, ${sqlLiteral(field(row, 'preregistration_sha256'))},
  ${jsonLiteral(row.preregistration_payload)}
);
DO $freeze$ BEGIN
  PERFORM public.freeze_tli_cycle(${sqlLiteral(input.cycleId)}::UUID, ${jsonLiteral(rpcEnvelopes)});
END $freeze$;
SELECT json_build_object(
  'cycleId', cycle.id::TEXT, 'status', cycle.status, 'freezeRpc', 'freeze_tli_cycle',
  'evidenceArtifactCount', (SELECT count(*) FROM public.tli_evidence_artifacts WHERE cycle_id = cycle.id),
  'evidenceAttestationCount', (SELECT count(*) FROM public.tli_evidence_attestations AS a JOIN public.tli_evidence_artifacts AS e ON e.id = a.artifact_id WHERE e.cycle_id = cycle.id),
  'hashBundleExact', cycle.study_contract_sha256 = ${sqlLiteral(field(row, 'study_contract_sha256'))}
    AND cycle.dataset_manifest_sha256 = ${sqlLiteral(input.datasetManifestSha256)}
    AND cycle.candidate_model_sha256 = ${sqlLiteral(field(row, 'candidate_model_sha256'))}
    AND cycle.comparator_artifact_sha256 = ${sqlLiteral(field(row, 'comparator_artifact_sha256'))}
    AND cycle.feature_contract_sha256 = ${sqlLiteral(field(row, 'feature_contract_sha256'))}
    AND cycle.label_contract_sha256 = ${sqlLiteral(field(row, 'label_contract_sha256'))}
    AND cycle.calibration_artifact_sha256 = ${sqlLiteral(field(row, 'calibration_artifact_sha256'))}
    AND cycle.babl_contract_sha256 = ${sqlLiteral(field(row, 'babl_contract_sha256'))}
    AND (SELECT payload ->> 'source_dataset_manifest_sha256' FROM public.tli_evidence_artifacts WHERE cycle_id = cycle.id AND artifact_type = 'dataset_manifest') = ${sqlLiteral(input.sourceDatasetManifestSha256)}
    AND (SELECT content_sha256 FROM public.tli_evidence_artifacts WHERE cycle_id = cycle.id AND artifact_type = 'model_manifest') = ${sqlLiteral(input.modelManifestSha256)}
    AND (SELECT content_sha256 FROM public.tli_evidence_artifacts WHERE cycle_id = cycle.id AND artifact_type = 'cycle_manifest') = ${sqlLiteral(input.cycleManifestSha256)},
  'sourceDatasetManifestSha256', (SELECT payload ->> 'source_dataset_manifest_sha256' FROM public.tli_evidence_artifacts WHERE cycle_id = cycle.id AND artifact_type = 'dataset_manifest'),
  'datasetManifestSha256', cycle.dataset_manifest_sha256,
  'modelManifestSha256', (SELECT content_sha256 FROM public.tli_evidence_artifacts WHERE cycle_id = cycle.id AND artifact_type = 'model_manifest'),
  'cycleManifestSha256', (SELECT content_sha256 FROM public.tli_evidence_artifacts WHERE cycle_id = cycle.id AND artifact_type = 'cycle_manifest')
)::TEXT FROM public.tli_experiment_cycles AS cycle WHERE cycle.id = ${sqlLiteral(input.cycleId)}::UUID;
COMMIT;`
}

const raw = JSON.parse(readFileSync(0, 'utf8')) as unknown
const output = ACTION === 'study-lock'
  ? psql(studySql(studySchema.parse(raw)))
  : psql(freezeSql(freezeSchema.parse(raw)))
process.stdout.write(`${output}\n`)
