import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFetchApi = vi.fn()
vi.mock('../fetch-helper.js', () => ({
  fetchApi: (...args: unknown[]) => mockFetchApi(...args),
  formatResult: (data: unknown, context?: string) =>
    context ? `${context}\n\n${JSON.stringify(data, null, 2)}` : JSON.stringify(data, null, 2),
  formatError: (error: unknown) =>
    `Error: ${error instanceof Error ? error.message : String(error)}`,
  formatEmptyResult: (context: string, guidance: string) =>
    `${context}\n\n[]\n\n${guidance}`,
}))

type ToolHandler = (args: { symbol: string }) => Promise<{
  content: { type: string; text: string }[]
  isError?: boolean
}>

describe('get-stock-themes MCP tool', () => {
  let registeredName = ''
  let registeredConfig: { annotations?: { readOnlyHint?: boolean } } = {}
  let handler: ToolHandler

  beforeEach(async () => {
    mockFetchApi.mockReset()
    const { registerGetStockThemes } = await import('../tools/get-stock-themes.js')
    const mockServer = {
      registerTool: (
        name: string,
        config: { annotations?: { readOnlyHint?: boolean } },
        cb: ToolHandler
      ) => {
        registeredName = name
        registeredConfig = config
        handler = cb
      },
    }
    registerGetStockThemes(mockServer as never)
  })

  it('registers as get_stock_themes with a read-only annotation', () => {
    expect(registeredName).toBe('get_stock_themes')
    expect(registeredConfig.annotations?.readOnlyHint).toBe(true)
  })

  it('calls the reverse-lookup endpoint with the 6-digit symbol', async () => {
    mockFetchApi.mockResolvedValueOnce([{ themeId: 't1', score: 72, stage: 'growth' }])
    await handler({ symbol: '005930' })
    expect(mockFetchApi).toHaveBeenCalledWith('/api/tli/stocks/005930/theme')
  })

  it('returns guidance when the stock belongs to no active themes', async () => {
    mockFetchApi.mockResolvedValueOnce([])
    const result = await handler({ symbol: '123456' })
    expect(result.content[0].text).toContain('No active themes found for stock 123456')
    expect(result.content[0].text).toContain('search_stocks')
  })

  it('surfaces errors with isError', async () => {
    mockFetchApi.mockRejectedValueOnce(new Error('boom'))
    const result = await handler({ symbol: '005930' })
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('boom')
  })
})
