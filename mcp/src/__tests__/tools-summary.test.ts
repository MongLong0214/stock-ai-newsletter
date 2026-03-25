import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFetchApi = vi.fn()
vi.mock('../fetch-helper.js', () => ({
  fetchApi: (...args: unknown[]) => mockFetchApi(...args),
  formatResult: (data: unknown, context?: string) =>
    context ? `${context}\n\n${JSON.stringify(data, null, 2)}` : JSON.stringify(data, null, 2),
  formatError: (error: unknown) =>
    `Error: ${error instanceof Error ? error.message : String(error)}`,
}))

describe('get-market-summary MCP tool', () => {
  beforeEach(() => {
    mockFetchApi.mockReset()
  })

  it('context mentions themeId for chaining', async () => {
    const mockData = { marketOverview: {}, topThemes: [] }
    mockFetchApi.mockResolvedValueOnce(mockData)

    const { registerGetMarketSummary } = await import('../tools/get-market-summary.js')

    let registeredHandler: (args: Record<string, unknown>) => Promise<unknown> = async () => ({})
    const mockServer = {
      tool: (_name: string, _desc: string, _schema: unknown, handler: typeof registeredHandler) => {
        registeredHandler = handler
      },
    }
    registerGetMarketSummary(mockServer as never)

    const result = await registeredHandler({})
    const content = (result as { content: Array<{ text: string }> }).content[0].text

    expect(content).toContain('themeId')
    expect(content).toContain('get_theme_detail')
  })
})
