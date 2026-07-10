/**
 * TLI v3 Todo 6: immutable collection run append + current cache 분리.
 *
 * run과 observations는 반드시 한 DB transaction으로 들어간다. 046의
 * `validate_tli_collection_run_observations`는 DEFERRABLE INITIALLY DEFERRED constraint trigger라
 * COMMIT 시점에 `observed_row_count`와 실제 observation 행수를 대조한다. 따라서
 *   - run 단독 insert  → COMMIT 시 0 <> N 으로 거부
 *   - observation 선행 → run FK 위반
 * 두 경로 모두 실패하며, PostgREST 요청 1건 = 트랜잭션 1건이므로 supabase-js 직접 insert로는
 * 어떤 snapshot도 쓸 수 없다. 원자 append는 오직 SECURITY DEFINER RPC를 통해서만 가능하다.
 *
 * 성공적으로 commit된 snapshot은 immutable이다. 이후 current cache 갱신이 실패해도
 * snapshot/manifest를 되돌리지 않으며, 반대로 snapshot이 실패하면 cache는 한 줄도 쓰지 않는다.
 */

import { assertCanonicalJsonObject, canonicalJsonV1, sha256Hex } from '@/lib/tli/canonical-json'
import {
  collectionRunAppendPayload,
  type CollectionObservationInput,
  type CollectionRunAppend,
} from './collection-run-contract'

export const APPEND_COLLECTION_RUN_RPC = 'append_tli_collection_run'

export interface CollectionRunAppendRequest {
  readonly canonicalJson: string
  readonly payloadSha256: string
}

/** run + observations를 한 transaction에 넣는 유일한 경로 */
export type CollectionRunTransport = (request: CollectionRunAppendRequest) => Promise<string>

/** WHY 지연 import: supabase-admin은 import 시점에 service-role env를 강제하므로 순수 계약 테스트가 깨진다. */
const supabaseTransport: CollectionRunTransport = async (request) => {
  const { supabaseAdmin } = await import('@/scripts/tli/shared/supabase-admin')

  const { data, error } = await supabaseAdmin.rpc(APPEND_COLLECTION_RUN_RPC, {
    p_run_canonical_json: request.canonicalJson,
    p_payload_sha256: request.payloadSha256,
  })

  if (error) {
    throw new Error(`immutable collection run append 실패: ${error.message}`)
  }
  if (typeof data !== 'string' || data.length === 0) {
    throw new Error('immutable collection run append가 run id를 반환하지 않았습니다')
  }
  return data
}

export const buildCollectionRunAppendRequest = <TObservation extends CollectionObservationInput>(
  append: CollectionRunAppend<TObservation>,
): CollectionRunAppendRequest => {
  const canonicalJson = canonicalJsonV1(collectionRunAppendPayload(append))
  assertCanonicalJsonObject(canonicalJson)
  return { canonicalJson, payloadSha256: sha256Hex(canonicalJson) }
}

export const appendCollectionRun = async <TObservation extends CollectionObservationInput>(
  append: CollectionRunAppend<TObservation>,
  transport: CollectionRunTransport = supabaseTransport,
): Promise<string> => transport(buildCollectionRunAppendRequest(append))

export interface SnapshotThenCacheResult {
  readonly runId: string
  readonly cacheError: string | null
}

/**
 * snapshot transaction이 성공한 뒤에만 current cache를 갱신한다.
 * snapshot 실패는 그대로 throw해 cache write를 0으로 유지하고, cache 실패는 확정된 snapshot을 훼손하지 않는다.
 */
export const commitSnapshotThenCache = async <TObservation extends CollectionObservationInput>(input: {
  readonly append: CollectionRunAppend<TObservation>
  readonly updateCurrentCache: (runId: string) => Promise<void>
  readonly transport?: CollectionRunTransport
}): Promise<SnapshotThenCacheResult> => {
  const runId = await appendCollectionRun(input.append, input.transport)

  try {
    await input.updateCurrentCache(runId)
    return { runId, cacheError: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`   ⚠️ current cache 갱신 실패 (snapshot ${runId}는 확정 보존):`, message)
    return { runId, cacheError: message }
  }
}
