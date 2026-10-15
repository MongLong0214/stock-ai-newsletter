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
import { GET as getBackup } from './backup/route'

const CRON_SECRET = 'test-cron-secret'
const originalCronSecret = process.env.CRON_SECRET

const routes = [
  { name: 'primary', get: getPrimary, path: '/api/cron/tli-full', runKeyPrefix: 'full-1630', label: 'TLI full cron' },
  { name: 'backup', get: getBackup, path: '/api/cron/tli-full/backup', runKeyPrefix: 'full-1900', label: 'TLI full backup cron' },
] as const

describe.each(routes)('TLI full Vercel cron $name route', ({ get, path, runKeyPrefix, label }) => {
  const cronRequest = (token = CRON_SECRET) => new Request(
    `http://localhost${path}`,
    { headers: { Authorization: `Bearer ${token}` } },
  )

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CRON_SECRET = CRON_SECRET
    mocks.dispatchGitHubWorkflow.mockResolvedValue({
      dispatchId: null,
      tokenExpiresInDays: null,
      verified: null,
    })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns 401 without dispatching for an invalid bearer token', async () => {
    const response = await get(cronRequest('wrong'))

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
    expect(mocks.dispatchGitHubWorkflow).not.toHaveBeenCalled()
  })

  it('dispatches full with reuse, the intended KST date, and route run key', async () => {
    const response = await get(cronRequest())

    expect(response.status).toBe(200)
    expect(mocks.dispatchGitHubWorkflow).toHaveBeenCalledWith(
      'tli-collect-data.yml',
      { inputs: {
        mode: 'full',
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
