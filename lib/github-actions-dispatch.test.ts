import { afterEach, describe, expect, it, vi } from 'vitest'

import { dispatchGitHubWorkflow } from './github-actions-dispatch'

describe('dispatchGitHubWorkflow inputs', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps the legacy body when inputs are omitted', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    await dispatchGitHubWorkflow('prepare-newsletter.yml', 'token')

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/prepare-newsletter.yml/dispatches'),
      expect.objectContaining({ body: JSON.stringify({ ref: 'main' }) }),
    )
  })

  it('serializes workflow dispatch inputs in the request body', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    const inputs = {
      mode: 'datalab-only',
      datalab_refresh: 'reuse',
      intended_kst_date: '2026-09-02',
      run_key: 'datalab-0900:2026-09-02',
    }

    await dispatchGitHubWorkflow('tli-collect-data.yml', 'token', inputs)

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/tli-collect-data.yml/dispatches'),
      expect.objectContaining({ body: JSON.stringify({ ref: 'main', inputs }) }),
    )
  })
})
