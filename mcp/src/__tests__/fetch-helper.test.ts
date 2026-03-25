import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { z } from 'zod'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Reset module cache to pick up mocked fetch
beforeEach(() => {
  vi.resetModules()
  mockFetch.mockReset()
})

const jsonResponse = (data: unknown, status = 200, contentType = 'application/json') =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': contentType },
  })

describe('fetchApi', () => {
  it('unwraps ApiResponse envelope', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ success: true, data: { id: 1 } }))
    const { fetchApi } = await import('../fetch-helper.js')
    const result = await fetchApi('/api/test')
    expect(result).toEqual({ id: 1 })
  })

  it('passes raw response when no envelope', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: 1 }))
    const { fetchApi } = await import('../fetch-helper.js')
    const result = await fetchApi('/api/test')
    expect(result).toEqual({ id: 1 })
  })

  it('throws on unsuccessful ApiResponse', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ success: false, data: null, error: { message: 'not found' } })
    )
    const { fetchApi } = await import('../fetch-helper.js')
    await expect(fetchApi('/api/test')).rejects.toThrow('not found')
  })

  it('throws on non-JSON content-type', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('<html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      })
    )
    const { fetchApi } = await import('../fetch-helper.js')
    await expect(fetchApi('/api/test')).rejects.toThrow('Expected JSON')
  })

  it('throws on HTTP error with status', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('Server Error', {
        status: 500,
        statusText: 'Internal Server Error',
      })
    )
    const { fetchApi } = await import('../fetch-helper.js')
    await expect(fetchApi('/api/test')).rejects.toThrow('API request failed: 500')
  })
})

describe('fetchApi with Zod schema', () => {
  const schema = z.object({
    id: z.string(),
    score: z.number(),
  })

  it('validates response with Zod schema', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ success: true, data: { id: 'abc', score: 42 } })
    )
    const { fetchApi } = await import('../fetch-helper.js')
    const result = await fetchApi('/api/test', undefined, schema)
    expect(result).toEqual({ id: 'abc', score: 42 })
  })

  it('throws on Zod validation failure', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ success: true, data: { id: 123, score: 'bad' } })
    )
    const { fetchApi } = await import('../fetch-helper.js')
    await expect(fetchApi('/api/test', undefined, schema)).rejects.toThrow()
  })

  it('works without schema (backward compat)', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ success: true, data: { anything: true } })
    )
    const { fetchApi } = await import('../fetch-helper.js')
    const result = await fetchApi('/api/test')
    expect(result).toEqual({ anything: true })
  })
})

describe('formatResult / formatError', () => {
  it('formatResult includes context header', async () => {
    const { formatResult } = await import('../fetch-helper.js')
    const output = formatResult({ foo: 1 }, '[Context]')
    expect(output).toMatch(/^\[Context\]\n\n/)
    expect(output).toContain('"foo": 1')
  })

  it('formatResult without context returns JSON only', async () => {
    const { formatResult } = await import('../fetch-helper.js')
    const output = formatResult({ foo: 1 })
    expect(output).toBe('{\n  "foo": 1\n}')
  })

  it('formatError formats Error message', async () => {
    const { formatError } = await import('../fetch-helper.js')
    expect(formatError(new Error('test error'))).toBe('Error: test error')
  })

  it('formatError formats non-Error', async () => {
    const { formatError } = await import('../fetch-helper.js')
    expect(formatError('string error')).toBe('Error: string error')
  })
})

describe('formatEmptyResult', () => {
  it('includes guidance message for empty array', async () => {
    const { formatEmptyResult } = await import('../fetch-helper.js')
    const output = formatEmptyResult('[Context]', 'No results found.')
    expect(output).toContain('[Context]')
    expect(output).toContain('No results found.')
    expect(output).toContain('[]')
  })
})
