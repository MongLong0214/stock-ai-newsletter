import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFetchApi = vi.fn()
vi.mock('../fetch-helper.js', () => ({
  fetchApi: (...args: unknown[]) => mockFetchApi(...args),
  formatResult: (data: unknown, context?: string) =>
    context ? `${context}\n\n${JSON.stringify(data, null, 2)}` : JSON.stringify(data, null, 2),
  formatError: (error: unknown) =>
    `Error: ${error instanceof Error ? error.message : String(error)}`,
}))

describe('get-theme-ranking MCP tool', () => {
  beforeEach(() => {
    mockFetchApi.mockReset()
  })

  it('passes limit and sort params to fetchApi', async () => {
    const mockData = {
      emerging: [],
      growth: [],
      peak: [],
      decline: [],
      reigniting: [],
      summary: { totalThemes: 0 },
    }
    mockFetchApi.mockResolvedValueOnce(mockData)

    const { registerGetThemeRanking } = await import('../tools/get-theme-ranking.js')

    let registeredHandler: (args: Record<string, unknown>) => Promise<unknown> = async () => ({})
    const mockServer = {
      tool: (_name: string, _desc: string, _schema: unknown, handler: typeof registeredHandler) => {
        registeredHandler = handler
      },
    }
    registerGetThemeRanking(mockServer as never)

    await registeredHandler({ limit: 5, sort: 'change7d' })

    expect(mockFetchApi).toHaveBeenCalledWith(
      '/api/tli/scores/ranking',
      expect.objectContaining({ limit: '5', sort: 'change7d' })
    )
  })

  it('does not pass limit/sort when not specified', async () => {
    const mockData = {
      emerging: [],
      growth: [],
      peak: [],
      decline: [],
      reigniting: [],
      summary: { totalThemes: 0 },
    }
    mockFetchApi.mockResolvedValueOnce(mockData)

    const { registerGetThemeRanking } = await import('../tools/get-theme-ranking.js')

    let registeredHandler: (args: Record<string, unknown>) => Promise<unknown> = async () => ({})
    const mockServer = {
      tool: (_name: string, _desc: string, _schema: unknown, handler: typeof registeredHandler) => {
        registeredHandler = handler
      },
    }
    registerGetThemeRanking(mockServer as never)

    await registeredHandler({})

    expect(mockFetchApi).toHaveBeenCalledWith('/api/tli/scores/ranking', undefined)
  })

  it('context includes summary/signals/hottestTheme/surging description', async () => {
    const mockData = { emerging: [], summary: {} }
    mockFetchApi.mockResolvedValueOnce(mockData)

    const { registerGetThemeRanking } = await import('../tools/get-theme-ranking.js')

    let registeredHandler: (args: Record<string, unknown>) => Promise<unknown> = async () => ({})
    const mockServer = {
      tool: (_name: string, _desc: string, _schema: unknown, handler: typeof registeredHandler) => {
        registeredHandler = handler
      },
    }
    registerGetThemeRanking(mockServer as never)

    const result = await registeredHandler({})
    const content = (result as { content: Array<{ text: string }> }).content[0].text

    expect(content).toContain('signals')
    expect(content).toContain('hottestTheme')
    expect(content).toContain('surging')
  })
})
