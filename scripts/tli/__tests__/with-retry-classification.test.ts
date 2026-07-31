/**
 * withRetry의 재시도 가능/불가 분류 회귀 테스트.
 *
 * 원래 구현은 에러 메시지에서 `\b4\d{2}\b`를 찾아 4xx로 판정했다.
 * "Timeout after 450ms" 같은 무관한 숫자에 걸리면 재시도가 조용히 꺼져,
 * 일시적 장애가 즉시 실패로 승격된다.
 */

import { describe, expect, it, vi } from 'vitest'

import { withRetry } from '@/scripts/tli/shared/utils'

function failThenSucceed(error: unknown) {
  let calls = 0
  return {
    get calls() {
      return calls
    },
    fn: vi.fn(async () => {
      calls += 1
      if (calls === 1) throw error
      return 'ok'
    }),
  }
}

describe('withRetry 재시도 분류', () => {
  it('숫자가 섞인 타임아웃 메시지를 4xx로 오인하지 않는다', async () => {
    const target = failThenSucceed(new Error('Timeout after 450ms'))

    await expect(withRetry(target.fn, 3, 'timeout case')).resolves.toBe('ok')
    expect(target.calls).toBe(2)
  })

  it('본문에 세 자리 숫자가 있어도 재시도한다', async () => {
    const target = failThenSucceed(new Error('socket hang up while reading 404 bytes'))

    await expect(withRetry(target.fn, 3, 'body length case')).resolves.toBe('ok')
    expect(target.calls).toBe(2)
  })

  it('구조화된 4xx status는 재시도하지 않는다', async () => {
    const error = Object.assign(new Error('Bad Request'), { status: 400 })
    const fn = vi.fn(async () => {
      throw error
    })

    await expect(withRetry(fn, 3, 'structured 400')).rejects.toThrow('Bad Request')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('response.status에 실린 4xx도 재시도하지 않는다', async () => {
    const error = Object.assign(new Error('rejected'), { response: { status: 403 } })
    const fn = vi.fn(async () => {
      throw error
    })

    await expect(withRetry(fn, 3, 'nested 403')).rejects.toThrow('rejected')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('429는 status로 와도 재시도한다', async () => {
    const target = failThenSucceed(Object.assign(new Error('slow down'), { status: 429 }))

    await expect(withRetry(target.fn, 3, 'rate limited')).resolves.toBe('ok')
    expect(target.calls).toBe(2)
  })

  it('408 요청 타임아웃도 재시도한다', async () => {
    const target = failThenSucceed(Object.assign(new Error('request timeout'), { status: 408 }))

    await expect(withRetry(target.fn, 3, 'request timeout')).resolves.toBe('ok')
    expect(target.calls).toBe(2)
  })

  it('status가 없어도 HTTP 문맥이 명확하면 4xx로 판정한다', async () => {
    const fn = vi.fn(async () => {
      throw new Error('HTTP 404 Not Found')
    })

    await expect(withRetry(fn, 3, 'contextual 404')).rejects.toThrow('HTTP 404')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('5xx는 재시도한다', async () => {
    const target = failThenSucceed(Object.assign(new Error('upstream'), { status: 503 }))

    await expect(withRetry(target.fn, 3, 'server error')).resolves.toBe('ok')
    expect(target.calls).toBe(2)
  })

  it('RESOURCE_EXHAUSTED는 재시도한다', async () => {
    const target = failThenSucceed(new Error('429 RESOURCE_EXHAUSTED quota'))

    await expect(withRetry(target.fn, 3, 'quota')).resolves.toBe('ok')
    expect(target.calls).toBe(2)
  })
})
