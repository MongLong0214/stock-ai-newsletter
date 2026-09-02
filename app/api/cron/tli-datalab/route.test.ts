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

import { GET } from './route'

const CRON_SECRET = 'test-cron-secret'
const originalCronSecret = process.env.CRON_SECRET

const cronRequest = (token = CRON_SECRET) => new Request(
  'http://localhost/api/cron/tli-datalab',
  { headers: { Authorization: `Bearer ${token}` } },
)

describe('TLI DataLab Vercel cron route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CRON_SECRET = CRON_SECRET
    mocks.dispatchGitHubWorkflow.mockResolvedValue(undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  afterAll(() => {
    if (originalCronSecret === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = originalCronSecret
  })

  it('returns 401 without dispatching for an invalid bearer token', async () => {
    const response = await GET(cronRequest('wrong'))

    expect(response.status).toBe(401)
    expect(mocks.dispatchGitHubWorkflow).not.toHaveBeenCalled()
  })

  it('dispatches datalab-only with the intended KST date and run key', async () => {
    const response = await GET(cronRequest())

    expect(response.status).toBe(200)
    expect(mocks.dispatchGitHubWorkflow).toHaveBeenCalledWith(
      'tli-collect-data.yml',
      undefined,
      {
        mode: 'datalab-only',
        datalab_refresh: 'reuse',
        intended_kst_date: '2026-09-02',
        run_key: 'datalab-0900:2026-09-02',
      },
    )
  })

  it('dispatches again on an already collected day so reuse can reduce outbound requests to zero', async () => {
    await GET(cronRequest())
    await GET(cronRequest())

    expect(mocks.dispatchGitHubWorkflow).toHaveBeenCalledTimes(2)
  })

  it('returns 500 when dispatch fails', async () => {
    mocks.dispatchGitHubWorkflow.mockRejectedValue(new Error('dispatch unavailable'))

    const response = await GET(cronRequest())

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      success: false,
      error: 'TLI DataLab cron failed',
    })
  })
})
