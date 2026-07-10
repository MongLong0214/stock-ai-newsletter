/**
 * TLI v3 Todo 6: B-Abl phase observation provenance.
 *
 * 각 pre-outcome study lock의 algorithm/spec/horizon으로만 exact prod run을 고르고,
 * `candidate_pool`은 그 prod run이 사전에 정한 값을 **그대로** 복사한다.
 * runtime/OOS metric으로 contract나 pool을 다시 고르지 않는다 — 그 순간 outcome-selected contract가 된다.
 */

import type { JsonObject } from '@/lib/tli/canonical-json'
import { supabaseAdmin } from '@/scripts/tli/shared/supabase-admin'
import {
  buildBablCollectionRun,
  type ProdPhaseSnapshot,
} from './collection-run-contract'
import { appendCollectionRun, type CollectionRunTransport } from './collection-run-store'

const BABL_CONTRACT_VERSION = 'tli-babl-v1'

export interface AttentionStudyContract {
  readonly id: string
  readonly locked_at: string
  readonly first_origin_date: string
  readonly babl_algorithm_version: string
  readonly babl_comparison_spec_version: string
  readonly babl_evaluation_horizon_days: number
}

const STUDY_CONTRACT_COLUMNS =
  'id, locked_at, first_origin_date, babl_algorithm_version, babl_comparison_spec_version, babl_evaluation_horizon_days'

/** `tli-attention-study-v1`은 046 UNIQUE 제약상 최대 1행이다. */
export const loadAttentionStudyContracts = async (): Promise<AttentionStudyContract[]> => {
  const { data, error } = await supabaseAdmin
    .from('tli_attention_study_contracts')
    .select(STUDY_CONTRACT_COLUMNS)
    .order('locked_at', { ascending: true })

  if (error) throw new Error(`study contract 조회 실패: ${error.message}`)
  return (data ?? []) as AttentionStudyContract[]
}

const PROD_SNAPSHOT_COLUMNS =
  'id, theme_id, snapshot_date, phase, algorithm_version, candidate_pool, comparison_spec_version, evaluation_horizon_days, created_at'

/**
 * study lock이 고정한 tuple에 맞는 prod 스냅샷만 읽는다.
 * `candidate_pool` 필터는 의도적으로 없다 — pool은 source prod run이 정한 값이며 caller가 선택하지 않는다.
 */
export const loadProdPhaseSnapshots = async (input: {
  readonly snapshotDate: string
  readonly study: AttentionStudyContract
}): Promise<ProdPhaseSnapshot[]> => {
  const { data, error } = await supabaseAdmin
    .from('prediction_snapshots_v2')
    .select(PROD_SNAPSHOT_COLUMNS)
    .eq('snapshot_date', input.snapshotDate)
    .eq('run_type', 'prod')
    .eq('algorithm_version', input.study.babl_algorithm_version)
    .eq('comparison_spec_version', input.study.babl_comparison_spec_version)
    .eq('evaluation_horizon_days', input.study.babl_evaluation_horizon_days)

  if (error) throw new Error(`prod phase 스냅샷 조회 실패: ${error.message}`)
  return (data ?? []) as ProdPhaseSnapshot[]
}

export interface BablSnapshotReport {
  readonly studyContractId: string | null
  readonly observations: number
  readonly skippedReason: 'no_study_contract' | null
}

export interface BablSnapshotOptions {
  readonly transport?: CollectionRunTransport
  readonly loadStudyContracts?: () => Promise<AttentionStudyContract[]>
  readonly loadSnapshots?: (input: {
    snapshotDate: string
    study: AttentionStudyContract
  }) => Promise<ProdPhaseSnapshot[]>
}

/**
 * cutoff 시점 B-Abl observation을 immutable run으로 append한다.
 * study contract가 아직 lock되지 않았으면 아무것도 쓰지 않는다 (fail-closed).
 */
export const collectBablPhaseSnapshot = async (
  snapshotDate: string,
  options: BablSnapshotOptions = {},
): Promise<BablSnapshotReport> => {
  const loadStudyContracts = options.loadStudyContracts ?? loadAttentionStudyContracts
  const loadSnapshots = options.loadSnapshots ?? loadProdPhaseSnapshots

  const studies = await loadStudyContracts()
  const study = studies.at(0)

  if (!study) {
    console.log('   ⊘ B-Abl snapshot 생략: study contract 미고정')
    return { studyContractId: null, observations: 0, skippedReason: 'no_study_contract' }
  }

  const requestedAt = new Date().toISOString()
  const prodSnapshots = await loadSnapshots({ snapshotDate, study })
  const collectedAt = new Date().toISOString()

  const requestPayload: JsonObject = {
    source: 'prediction_snapshots_v2',
    run_type: 'prod',
    snapshot_date: snapshotDate,
    study_contract_id: study.id,
    babl_algorithm_version: study.babl_algorithm_version,
    babl_comparison_spec_version: study.babl_comparison_spec_version,
    babl_evaluation_horizon_days: study.babl_evaluation_horizon_days,
  }

  const append = buildBablCollectionRun({
    contractVersion: BABL_CONTRACT_VERSION,
    snapshotDate,
    requestPayload,
    studyContract: study,
    prodSnapshots,
    timestamps: { requestedAt, collectedAt, completedAt: new Date().toISOString() },
  })

  await appendCollectionRun(append, options.transport)

  console.log(`   ✅ B-Abl observation ${append.observations.length}건 append (study ${study.id})`)
  return { studyContractId: study.id, observations: append.observations.length, skippedReason: null }
}
