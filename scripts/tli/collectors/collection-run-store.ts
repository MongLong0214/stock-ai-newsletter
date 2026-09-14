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
import { sleep } from '@/scripts/tli/shared/utils'
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

/**
 * 네트워크 계층 실패만 재시도 대상이다.
 *
 * 계약 위반·제약 위반은 재시도해도 같은 결과이고 원장에 의미 없는 부하만 준다.
 * 2026-09-14 실측: `TypeError: fetch failed`가 17분에 걸쳐 9/239건 발생해 런이 죽었다
 * (직전 5개 성공 런에는 0건 — 일시적 인프라 장애).
 */
const TRANSIENT_APPEND_ERROR =
  /fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|socket hang up|timeout/i

export const isTransientAppendError = (message: string): boolean =>
  TRANSIENT_APPEND_ERROR.test(message)

/**
 * 이미 커밋된 run을 찾는다 — **재시도 전에 반드시 확인해야 한다.**
 *
 * RPC는 `gen_random_uuid()`로 run id를 서버에서 만들고 payload 기준 유일 제약이 없다.
 * 따라서 "커밋은 됐는데 응답만 유실된" 경우 그냥 재시도하면 **원장에 중복 스냅샷**이 생긴다.
 * `(source, request_sha256, requested_at)`은 이 시도를 유일하게 식별한다 —
 * `requested_at`은 테마별로 시도 **전에** 한 번 생성되므로 재시도 간에는 같고,
 * 다른 회차 실행과는 다르다.
 */
export type CommittedRunLookup = (key: {
  readonly requestSha256: string
  readonly requestedAt: string
  readonly source: string
}) => Promise<string | null>

const supabaseLookup: CommittedRunLookup = async (key) => {
  const { supabaseAdmin } = await import('@/scripts/tli/shared/supabase-admin')

  const { data, error } = await supabaseAdmin
    .from('tli_collection_runs')
    .select('id')
    .eq('source', key.source)
    .eq('request_sha256', key.requestSha256)
    .eq('requested_at', key.requestedAt)
    .maybeSingle<{ id: string }>()

  if (error) throw new Error(`collection run 커밋 확인 실패: ${error.message}`)
  return data?.id ?? null
}

const APPEND_MAX_ATTEMPTS = 3
const APPEND_BACKOFF_MS = [0, 1_000, 3_000]

export const appendCollectionRun = async <TObservation extends CollectionObservationInput>(
  append: CollectionRunAppend<TObservation>,
  transport: CollectionRunTransport = supabaseTransport,
  lookup: CommittedRunLookup = supabaseLookup,
): Promise<string> => {
  const request = buildCollectionRunAppendRequest(append)
  const key = {
    requestSha256: append.run.request_sha256,
    requestedAt: append.run.requested_at,
    source: append.run.source,
  }

  for (let attempt = 1; attempt <= APPEND_MAX_ATTEMPTS; attempt += 1) {
    if (APPEND_BACKOFF_MS[attempt - 1] > 0) await sleep(APPEND_BACKOFF_MS[attempt - 1])

    try {
      return await transport(request)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)

      // 결정적 실패는 재시도하지 않는다.
      if (!isTransientAppendError(message)) throw error

      // 커밋 후 응답만 유실됐을 수 있다. 확인 없이 재시도하면 중복이 생긴다.
      let committed: string | null
      try {
        committed = await lookup(key)
      } catch (lookupError: unknown) {
        // 커밋 여부를 확정할 수 없으면 재시도하지 않는다 — 원장 무결성이 가용성보다 우선이다.
        const lookupMessage = lookupError instanceof Error ? lookupError.message : String(lookupError)
        throw new Error(`${message} (커밋 여부 확인 실패로 재시도 중단: ${lookupMessage})`)
      }

      if (committed !== null) {
        console.warn(`   ↻ append 응답은 유실됐지만 snapshot은 커밋됨 — 재시도하지 않습니다 (${committed})`)
        return committed
      }

      if (attempt === APPEND_MAX_ATTEMPTS) throw error
      console.warn(
        `   ⚠️ collection run append 시도 ${attempt}/${APPEND_MAX_ATTEMPTS} 실패(일시 오류, 미커밋 확인): ${message}`,
      )
    }
  }

  throw new Error('collection run append: 모든 재시도 실패')
}

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
