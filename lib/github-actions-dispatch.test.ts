import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  dispatchGitHubWorkflow,
  GitHubDispatchError,
  readTokenExpiryDays,
} from './github-actions-dispatch'

const NOW = new Date('2026-09-02T00:00:00.000Z')

function dispatchResponse(expiry?: string): Response {
  return new Response(null, {
    status: 204,
    headers: expiry
      ? { 'github-authentication-token-expiration': expiry }
      : undefined,
  })
}

function runsResponse(createdAt?: string): Response {
  return Response.json({
    workflow_runs: createdAt
      ? [{ created_at: createdAt, head_branch: 'main' }]
      : [],
  })
}

describe('dispatchGitHubWorkflow', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('posts inputs and confirms a newly-created workflow_dispatch run', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(dispatchResponse('2026-09-12T00:00:00.000Z'))
      .mockResolvedValueOnce(runsResponse('2026-09-02T00:00:01.000Z'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(dispatchGitHubWorkflow('prepare-newsletter.yml', {
      token: 'test-token',
      inputs: {
        target_date: '2026-09-02',
        dispatch_id: '2026-09-02-primary',
        backup_run: false,
      },
    })).resolves.toEqual({
      dispatchId: '2026-09-02-primary',
      tokenExpiresInDays: 10,
    })

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('/prepare-newsletter.yml/dispatches'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          ref: 'main',
          inputs: {
            target_date: '2026-09-02',
            dispatch_id: '2026-09-02-primary',
            backup_run: false,
          },
        }),
      }),
    )
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain(
      'event=workflow_dispatch&per_page=5',
    )
  })

  it('dispatches once more with a new dispatch ID when no first run appears', async () => {
    let postCount = 0
    let getCount = 0
    const postedBodies: string[] = []
    const fetchMock = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      if (init?.method === 'POST') {
        postCount += 1
        postedBodies.push(String(init.body))
        return dispatchResponse()
      }
      getCount += 1
      return runsResponse(getCount === 5 ? '2026-09-02T00:00:10.000Z' : undefined)
    })
    vi.stubGlobal('fetch', fetchMock)

    const resultPromise = dispatchGitHubWorkflow('daily-newsletter.yml', {
      token: 'test-token',
      inputs: {
        target_date: '2026-09-02',
        dispatch_id: '2026-09-02-first',
      },
    })
    await vi.advanceTimersByTimeAsync(12_000)

    const result = await resultPromise
    expect(postCount).toBe(2)
    expect(getCount).toBe(5)
    expect(result.dispatchId).toMatch(/^2026-09-02-[0-9a-f]{8}$/)
    expect(postedBodies[0]).toContain('2026-09-02-first')
    expect(postedBodies[1]).toContain(result.dispatchId)
  })

  it('throws status 0 after two acknowledged dispatches create no visible run', async () => {
    const fetchMock = vi.fn(async (_url: string | URL, init?: RequestInit) => (
      init?.method === 'POST' ? dispatchResponse() : runsResponse()
    ))
    vi.stubGlobal('fetch', fetchMock)

    const resultPromise = dispatchGitHubWorkflow('daily-newsletter.yml', {
      token: 'test-token',
      inputs: { target_date: '2026-09-02', dispatch_id: 'first' },
    })
    const rejection = expect(resultPromise).rejects.toMatchObject({
      status: 0,
    } satisfies Partial<GitHubDispatchError>)
    await vi.advanceTimersByTimeAsync(24_000)
    await rejection
    expect(fetchMock.mock.calls.filter((call) => call[1]?.method === 'POST')).toHaveLength(2)
  })
})

describe('readTokenExpiryDays', () => {
  it('returns null for a missing or invalid expiration header', () => {
    expect(readTokenExpiryDays(new Headers(), NOW)).toBeNull()
    expect(readTokenExpiryDays(new Headers({
      'github-authentication-token-expiration': 'not-a-date',
    }), NOW)).toBeNull()
  })
})
