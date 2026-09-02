import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  dispatchGitHubWorkflow,
  normalizeWorkflowInputs,
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

function runsResponse(createdAt?: string, displayTitle = ''): Response {
  return Response.json({
    workflow_runs: createdAt
      ? [{ created_at: createdAt, head_branch: 'main', display_title: displayTitle }]
      : [],
  })
}

describe('dispatchGitHubWorkflow', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('posts inputs and confirms a newly-created workflow_dispatch run', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(dispatchResponse('2026-09-12T00:00:00.000Z'))
      .mockResolvedValueOnce(runsResponse(
        '2026-09-02T00:00:01.000Z',
        'Prepare 2026-09-02 2026-09-02-primary',
      ))
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
      verified: true,
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

  it('posts only once and returns verified false when no matching run appears', async () => {
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
      return runsResponse()
    })
    vi.stubGlobal('fetch', fetchMock)

    const resultPromise = dispatchGitHubWorkflow('daily-newsletter.yml', {
      token: 'test-token',
      inputs: {
        target_date: '2026-09-02',
        dispatch_id: '2026-09-02-first',
      },
    })
    await vi.advanceTimersByTimeAsync(9_000)

    const result = await resultPromise
    expect(postCount).toBe(1)
    expect(getCount).toBe(4)
    expect(result).toMatchObject({
      dispatchId: '2026-09-02-first',
      verified: false,
    })
    expect(console.warn).toHaveBeenCalledWith(JSON.stringify({
      event: 'dispatch_unverified',
      workflowFile: 'daily-newsletter.yml',
      dispatchId: '2026-09-02-first',
    }))
    expect(postedBodies).toEqual([expect.stringContaining('2026-09-02-first')])
  })

  it('does not accept an unrelated run created at the same time', async () => {
    const fetchMock = vi.fn(async (_url: string | URL, init?: RequestInit) => (
      init?.method === 'POST'
        ? dispatchResponse()
        : runsResponse('2026-09-02T00:00:01.000Z', 'Prepare unrelated-dispatch')
    ))
    vi.stubGlobal('fetch', fetchMock)

    const resultPromise = dispatchGitHubWorkflow('daily-newsletter.yml', {
      token: 'test-token',
      inputs: { target_date: '2026-09-02', dispatch_id: 'first' },
    })
    await vi.advanceTimersByTimeAsync(9_000)

    await expect(resultPromise).resolves.toMatchObject({ verified: false, dispatchId: 'first' })
    expect(fetchMock.mock.calls.filter((call) => call[1]?.method === 'POST')).toHaveLength(1)
  })

  it('normalizes workflow inputs without stringifying booleans', () => {
    expect(normalizeWorkflowInputs({
      backup_run: true,
      dry_run: false,
      target_date: '2026-09-02',
      legacy_false: 'false',
    })).toEqual({
      backup_run: true,
      dry_run: false,
      target_date: '2026-09-02',
      legacy_false: 'false',
    })
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
