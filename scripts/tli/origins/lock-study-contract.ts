/**
 * TLI v3 Todo 6: 첫 clean origin 전에 `lock_tli_attention_study_contract`을 실행하는 경로.
 *
 * outcome·feature·coverage·score·OOS metric을 **읽지 않는다**. B-Abl tuple은 DB의 단일 enabled
 * `comparison_v4_control` row가 정하고, caller는 대안을 제시할 수 없다 (046이 직접 대조한다).
 *
 * 순서: canonical study-contract.json을 tracked Git에 commit → blob 검증 → RPC.
 */

import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

import { canonicalJsonV1, sha256Hex, type JsonObject } from '@/lib/tli/canonical-json'
import { supabaseAdmin } from '@/scripts/tli/shared/supabase-admin'

export const LOCK_STUDY_CONTRACT_RPC = 'lock_tli_attention_study_contract'
export const STUDY_CONTRACT_VERSION = 'tli-attention-study-v1'
export const VERIFIER_VERSION = 'tli-git-blob-verifier-v1'

export const studyContractRepoPath = (studyId: string): string =>
  `docs/evidence/tli-v3-scientific-rebuild/studies/${studyId}/study-contract.json`

const git = (args: readonly string[]): string =>
  execFileSync('git', [...args], { encoding: 'utf8' }).trim()

/** migration 050과 동일하게 Git object format은 sha1(40-hex) 또는 sha256(64-hex)만 허용한다. */
export const assertSupportedGitObjectFormat = (objectFormat: string): void => {
  if (objectFormat !== 'sha1' && objectFormat !== 'sha256') {
    throw new Error(`지원하지 않는 Git object format '${objectFormat}'입니다. sha1 또는 sha256만 허용됩니다.`)
  }
}

export interface StudyContractPayloadInput {
  readonly studyId: string
  readonly firstOriginDate: string
  readonly bablAlgorithmVersion: string
  readonly bablControlRowId: string
  readonly bablControlSha256: string
  readonly labelContractSha256: string
  readonly featureContractSha256: string
}

/** 046 `v_allowed_keys` 13개와 정확히 일치해야 한다. */
export const buildStudyContractPayload = (input: StudyContractPayloadInput): JsonObject => ({
  id: input.studyId,
  contract_version: STUDY_CONTRACT_VERSION,
  first_origin_date: input.firstOriginDate,
  babl_algorithm_version: input.bablAlgorithmVersion,
  babl_comparison_spec_version: 'comparison-v4-spec-v1',
  babl_evaluation_horizon_days: 14,
  babl_candidate_pool_rule: 'source_prod_run_v1',
  babl_control_row_id: input.bablControlRowId,
  babl_control_sha256: input.bablControlSha256,
  labeler_version: 'gta-v2',
  label_contract_sha256: input.labelContractSha256,
  feature_contract_version: 'tli-attention-v2-f1',
  feature_contract_sha256: input.featureContractSha256,
})

/** 046 `v_control_json`이 만드는 canonical control payload와 동일한 필드 집합 */
export const buildControlCanonicalPayload = (control: Record<string, unknown>): JsonObject => {
  const utc = (value: unknown): string | null =>
    value === null || value === undefined ? null : new Date(String(value)).toISOString()

  return {
    id: String(control.id),
    production_version: control.production_version as string,
    serving_enabled: control.serving_enabled as boolean,
    promoted_by: (control.promoted_by ?? null) as string | null,
    promoted_at: utc(control.promoted_at),
    created_at: utc(control.created_at),
    source_surface: (control.source_surface ?? null) as string | null,
    calibration_version: (control.calibration_version ?? null) as string | null,
    weight_version: (control.weight_version ?? null) as string | null,
    drift_version: (control.drift_version ?? null) as string | null,
    promotion_gate_status: (control.promotion_gate_status ?? null) as string | null,
    promotion_gate_summary: (control.promotion_gate_summary ?? null) as JsonObject | null,
    promotion_gate_failures: (control.promotion_gate_failures ?? null) as JsonObject | null,
    previous_stable_version: (control.previous_stable_version ?? null) as string | null,
    rollback_reason: (control.rollback_reason ?? null) as string | null,
    rolled_back_at: utc(control.rolled_back_at),
    auto_hold_enabled: (control.auto_hold_enabled ?? null) as boolean | null,
    hold_state: (control.hold_state ?? null) as string | null,
    hold_reason: (control.hold_reason ?? null) as string | null,
    hold_report_date: (control.hold_report_date ?? null) as string | null,
    updated_at: utc(control.updated_at),
    decision_trace: (control.decision_trace ?? null) as JsonObject | null,
  }
}

const loadEnabledControlRow = async (): Promise<Record<string, unknown>> => {
  const { data, error } = await supabaseAdmin
    .from('comparison_v4_control')
    .select('*')
    .eq('serving_enabled', true)

  if (error) throw new Error(`comparison_v4_control 조회 실패: ${error.message}`)
  if (!data || data.length !== 1) {
    throw new Error(`study lock은 enabled control row가 정확히 1건이어야 합니다 (현재 ${data?.length ?? 0}건)`)
  }
  return data[0] as Record<string, unknown>
}

export interface LockStudyContractResult {
  readonly studyId: string
  readonly payloadSha256: string
  readonly repoRelativePath: string
}

/**
 * study contract를 lock한다. 호출 전에 canonical payload가 정확히 그 경로에 commit되어 있어야 하며,
 * 여기서 Git blob bytes를 다시 읽어 SHA를 재계산한다 (PostgreSQL이 Git을 읽는다고 가정하지 않는다).
 */
export const lockAttentionStudyContract = async (input: {
  readonly studyId: string
  readonly firstOriginDate: string
  readonly labelContractSha256: string
  readonly featureContractSha256: string
  readonly verifierCodeSha?: string
}): Promise<LockStudyContractResult> => {
  assertSupportedGitObjectFormat(git(['rev-parse', '--show-object-format']))

  const control = await loadEnabledControlRow()
  const controlPayload = buildControlCanonicalPayload(control)
  const controlCanonicalJson = canonicalJsonV1(controlPayload)

  const payload = buildStudyContractPayload({
    studyId: input.studyId,
    firstOriginDate: input.firstOriginDate,
    bablAlgorithmVersion: String(control.production_version),
    bablControlRowId: String(control.id),
    bablControlSha256: sha256Hex(controlCanonicalJson),
    labelContractSha256: input.labelContractSha256,
    featureContractSha256: input.featureContractSha256,
  })

  const contractCanonicalJson = canonicalJsonV1(payload)
  const repoRelativePath = studyContractRepoPath(input.studyId)

  // Git-first: tracked bytes를 다시 읽어 대조한다. 불일치면 RPC를 부르지 않는다.
  const commitSha = git(['rev-parse', 'HEAD'])
  const blobSha = git(['rev-parse', `HEAD:${repoRelativePath}`])
  const committedBytes = git(['cat-file', 'blob', `${commitSha}:${repoRelativePath}`])

  if (committedBytes !== contractCanonicalJson) {
    throw new Error(`commit된 study-contract.json이 canonical payload와 다릅니다: ${repoRelativePath}`)
  }

  const verifierCodeSha =
    input.verifierCodeSha
    ?? createHash('sha256').update(readFileSync(new URL(import.meta.url), 'utf8'), 'utf8').digest('hex')

  const { data, error } = await supabaseAdmin.rpc(LOCK_STUDY_CONTRACT_RPC, {
    p_study_id: input.studyId,
    p_contract_canonical_json: contractCanonicalJson,
    p_contract_payload_sha256: sha256Hex(contractCanonicalJson),
    p_control_canonical_json: controlCanonicalJson,
    p_git_commit_sha: commitSha,
    p_git_blob_sha: blobSha,
    p_repo_relative_path: repoRelativePath,
    p_verifier_version: VERIFIER_VERSION,
    p_verifier_code_sha: verifierCodeSha,
    p_verified_at: new Date().toISOString(),
  })

  if (error) throw new Error(`${LOCK_STUDY_CONTRACT_RPC} 실패: ${error.message}`)

  return {
    studyId: String(data ?? input.studyId),
    payloadSha256: sha256Hex(contractCanonicalJson),
    repoRelativePath,
  }
}
