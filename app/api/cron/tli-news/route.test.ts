import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  dispatchGitHubWorkflow: vi.fn(),
  getKSTDateString: vi.fn(() => '2026-09-02'),
}))

vi.mock('@/lib/github-actions-dispatch', () => ({
  dispatchGitHubWorkflow: mocks.dispatchGitHubWorkflow,
}))

vi.mock('@/lib/tli/date-utils', () => ({
  getKSTDateString: mocks.getKSTDateString,
}))

import { GET as getPrimary } from './route'
import { GET as getMondayOrigin } from './monday-origin/route'

const CRON_SECRET = 'test-cron-secret'
const originalCronSecret = process.env.CRON_SECRET

const routes = [
  { name: 'primary', get: getPrimary, path: '/api/cron/tli-news', runKeyPrefix: 'news-0900', label: 'TLI news cron', inWindow: '2026-09-02T00:00:30Z', late: '2026-09-02T07:40:00Z', from: '2026-09-02T00:00:00Z', to: '2026-09-02T01:00:00Z', window: { fromKstMinutes: 540, toKstMinutes: 600 } },
  { name: 'monday-origin', get: getMondayOrigin, path: '/api/cron/tli-news/monday-origin', runKeyPrefix: 'origin-1830', label: 'TLI Monday origin cron', inWindow: '2026-09-02T09:30:30Z', late: '2026-09-02T10:05:00Z', from: '2026-09-02T09:30:00Z', to: '2026-09-02T10:00:00Z', window: { fromKstMinutes: 1110, toKstMinutes: 1140 } },
] as const

describe.each(routes)('TLI news Vercel cron $name route', ({ get, path, runKeyPrefix, label, inWindow, late, from, to, window }) => {
  const cronRequest = (token = CRON_SECRET) => new Request(
    `http://localhost${path}`,
    { headers: { Authorization: `Bearer ${token}` } },
  )

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(inWindow))
    vi.clearAllMocks()
    process.env.CRON_SECRET = CRON_SECRET
    mocks.dispatchGitHubWorkflow.mockResolvedValue({
      dispatchId: null,
      tokenExpiresInDays: null,
      verified: null,
    })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('returns 401 without dispatching for an invalid bearer token', async () => {
    const response = await get(cronRequest('wrong'))

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
    expect(mocks.dispatchGitHubWorkflow).not.toHaveBeenCalled()
  })

  it('checks bearer auth before skipping an out-of-window request', async () => {
    vi.setSystemTime(new Date(late))

    const response = await get(cronRequest('wrong'))

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
    expect(mocks.dispatchGitHubWorkflow).not.toHaveBeenCalled()
  })

  it('skips a late arrival without dispatching', async () => {
    vi.setSystemTime(new Date(late))

    const response = await get(cronRequest())

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      success: true,
      dispatched: false,
      skipped: 'outside_window',
      date: '2026-09-02',
      window,
    })
    expect(mocks.dispatchGitHubWorkflow).not.toHaveBeenCalled()
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining(label))
  })

  it('dispatches at the inclusive start minute', async () => {
    vi.setSystemTime(new Date(from))

    const response = await get(cronRequest())

    expect(response.status).toBe(200)
    expect(mocks.dispatchGitHubWorkflow).toHaveBeenCalledOnce()
  })

  it('skips at the exclusive end minute', async () => {
    vi.setSystemTime(new Date(to))

    const response = await get(cronRequest())

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ skipped: 'outside_window', window })
    expect(mocks.dispatchGitHubWorkflow).not.toHaveBeenCalled()
  })

  it('dispatches news-only with reuse, the intended KST date, and route run key', async () => {
    const response = await get(cronRequest())

    expect(response.status).toBe(200)
    expect(mocks.dispatchGitHubWorkflow).toHaveBeenCalledWith(
      'tli-collect-data.yml',
      { inputs: {
        mode: 'news-only',
        datalab_refresh: 'reuse',
        intended_kst_date: '2026-09-02',
        run_key: `${runKeyPrefix}:2026-09-02`,
      } },
    )
    await expect(response.json()).resolves.toEqual({
      success: true,
      dispatched: true,
      workflow: 'tli-collect-data.yml',
      date: '2026-09-02',
      dispatchId: null,
      verified: null,
    })
  })

  it('returns 500 when dispatch fails', async () => {
    mocks.dispatchGitHubWorkflow.mockRejectedValue(new Error('dispatch unavailable'))

    const response = await get(cronRequest())

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      success: false,
      error: `${label} failed`,
    })
  })
})

afterAll(() => {
  if (originalCronSecret === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = originalCronSecret
})
