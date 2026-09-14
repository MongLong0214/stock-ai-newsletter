import { describe, expect, it, vi } from 'vitest'
import {
  appendCollectionRun,
  isTransientAppendError,
  type CommittedRunLookup,
  type CollectionRunTransport,
} from '@/scripts/tli/collectors/collection-run-store'

/**
 * 2026-09-14 회귀.
 *
 * `TypeError: fetch failed`가 17분에 걸쳐 9/239건 발생해 뉴스 수집 런이 죽었다
 * (직전 5개 성공 런에는 0건 — 일시적 인프라 장애). append에 재시도가 없었다.
 *
 * 다만 이 RPC는 immutable 원장이다. run id를 서버가 `gen_random_uuid()`로 만들고
 * payload 기준 유일 제약이 없으므로, **커밋 후 응답만 유실된 경우 그냥 재시도하면
 * 원장에 중복 스냅샷이 생긴다.** 그래서 재시도 전에 커밋 여부를 반드시 확인한다.
 */
const append = {
  observations: [],
  run: {
    request_sha256: 'a'.repeat(64),
    requested_at: '2026-09-14T02:08:00.000Z',
    source: 'naver_news',
  },
} as never

const transientError = () => new Error('immutable collection run append 실패: TypeError: fetch failed')

describe('isTransientAppendError', () => {
  it('네트워크 계층 실패를 일시 오류로 본다', () => {
    for (const message of [
      'TypeError: fetch failed',
      'read ECONNRESET',
      'connect ECONNREFUSED 1.2.3.4:443',
      'getaddrinfo EAI_AGAIN db.supabase.co',
      'socket hang up',
      'Request timeout',
    ]) {
      expect(isTransientAppendError(message), message).toBe(true)
    }
  })

  it('계약·제약 위반은 일시 오류가 아니다 — 재시도해도 같은 결과다', () => {
    for (const message of [
      'collection append payload must contain exact run and observations fields',
      'duplicate key value violates unique constraint',
      'new row for relation violates check constraint',
      'permission denied for function append_tli_collection_run',
    ]) {
      expect(isTransientAppendError(message), message).toBe(false)
    }
  })
})

describe('appendCollectionRun 재시도', () => {
  const neverCommitted: CommittedRunLookup = async () => null

  it('일시 오류면 재시도해 성공한다', async () => {
    let calls = 0
    const transport: CollectionRunTransport = async () => {
      calls += 1
      if (calls === 1) throw transientError()
      return 'run-2'
    }

    await expect(appendCollectionRun(append, transport, neverCommitted)).resolves.toBe('run-2')
    expect(calls).toBe(2)
  })

  /**
   * 이 테스트가 이 파일의 존재 이유다. 커밋됐는데 재시도하면 원장이 오염된다.
   */
  it('이미 커밋됐으면 재시도하지 않고 기존 run id를 돌려준다', async () => {
    let calls = 0
    const transport: CollectionRunTransport = async () => {
      calls += 1
      throw transientError()
    }
    const committed: CommittedRunLookup = async () => 'run-already-committed'

    await expect(appendCollectionRun(append, transport, committed)).resolves.toBe('run-already-committed')
    expect(calls).toBe(1)
  })

  it('커밋 여부를 확인할 수 없으면 재시도하지 않는다 — 무결성이 가용성보다 우선', async () => {
    let calls = 0
    const transport: CollectionRunTransport = async () => {
      calls += 1
      throw transientError()
    }
    const brokenLookup: CommittedRunLookup = async () => {
      throw new Error('커밋 확인 실패')
    }

    await expect(appendCollectionRun(append, transport, brokenLookup)).rejects.toThrow(/재시도 중단/)
    expect(calls).toBe(1)
  })

  it('결정적 실패는 즉시 throw하고 재시도하지 않는다', async () => {
    let calls = 0
    const transport: CollectionRunTransport = async () => {
      calls += 1
      throw new Error('collection append payload must contain exact run and observations fields')
    }
    const lookup = vi.fn(neverCommitted)

    await expect(appendCollectionRun(append, transport, lookup)).rejects.toThrow(/exact run and observations/)
    expect(calls).toBe(1)
    // 결정적 실패에는 커밋 확인조차 하지 않는다
    expect(lookup).not.toHaveBeenCalled()
  })

  it('일시 오류가 계속되면 시도 횟수만큼만 하고 throw한다', async () => {
    let calls = 0
    const transport: CollectionRunTransport = async () => {
      calls += 1
      throw transientError()
    }

    await expect(appendCollectionRun(append, transport, neverCommitted)).rejects.toThrow(/fetch failed/)
    expect(calls).toBe(3)
  })

  it('첫 시도에 성공하면 커밋 확인을 하지 않는다', async () => {
    const lookup = vi.fn(neverCommitted)

    await expect(appendCollectionRun(append, async () => 'run-1', lookup)).resolves.toBe('run-1')
    expect(lookup).not.toHaveBeenCalled()
  })
})
