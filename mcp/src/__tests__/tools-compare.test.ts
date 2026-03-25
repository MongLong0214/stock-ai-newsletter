import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFetchApi = vi.fn()
vi.mock('../fetch-helper.js', () => ({
  fetchApi: (...args: unknown[]) => mockFetchApi(...args),
  formatResult: (data: unknown, context?: string) =>
    context ? `${context}\n\n${JSON.stringify(data, null, 2)}` : JSON.stringify(data, null, 2),
  formatError: (error: unknown) =>
    `Error: ${error instanceof Error ? error.message : String(error)}`,
}))

describe('compare-themes MCP tool', () => {
  beforeEach(() => {
    mockFetchApi.mockReset()
  })

  it('calls fetchApi with comma-joined ids', async () => {
    const mockResponse = {
      themes: [],
      pairwiseSimilarity: [],
      overlappingStocks: [],
      warnings: [],
    }
    mockFetchApi.mockResolvedValueOnce(mockResponse)

    const { registerCompareThemes } = await import('../tools/compare-themes.js')

    let registeredHandler: (args: Record<string, unknown>) => Promise<unknown> = async () => ({})
    const mockServer = {
      tool: (_name: string, _desc: string, _schema: unknown, handler: typeof registeredHandler) => {
        registeredHandler = handler
      },
    }
    registerCompareThemes(mockServer as never)

    const ids = [
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
    ]
    await registeredHandler({ theme_ids: ids })

    expect(mockFetchApi).toHaveBeenCalledWith('/api/tli/compare', {
      ids: ids.join(','),
    })
  })

  it('returns formatted result with context', async () => {
    const mockResponse = {
      themes: [
        { id: '11111111-1111-1111-1111-111111111111', name: '반도체', score: 75, stage: 'Growth', sparkline: [70, 71, 72, 73, 74, 75, 75] },
      ],
      pairwiseSimilarity: [],
      overlappingStocks: [{ symbol: '005930', name: '삼성전자' }],
      warnings: [],
    }
    mockFetchApi.mockResolvedValueOnce(mockResponse)

    const { registerCompareThemes } = await import('../tools/compare-themes.js')

    let registeredHandler: (args: Record<string, unknown>) => Promise<unknown> = async () => ({})
    const mockServer = {
      tool: (_name: string, _desc: string, _schema: unknown, handler: typeof registeredHandler) => {
        registeredHandler = handler
      },
    }
    registerCompareThemes(mockServer as never)

    const result = await registeredHandler({
      theme_ids: [
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222',
      ],
    })
    const content = (result as { content: Array<{ text: string }> }).content[0].text

    expect(content).toContain('Compare')
    expect(content).toContain('반도체')
  })

  it('returns error content on fetchApi failure', async () => {
    mockFetchApi.mockRejectedValueOnce(new Error('Network error'))

    const { registerCompareThemes } = await import('../tools/compare-themes.js')

    let registeredHandler: (args: Record<string, unknown>) => Promise<unknown> = async () => ({})
    const mockServer = {
      tool: (_name: string, _desc: string, _schema: unknown, handler: typeof registeredHandler) => {
        registeredHandler = handler
      },
    }
    registerCompareThemes(mockServer as never)

    const result = await registeredHandler({
      theme_ids: [
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222',
      ],
    })
    const response = result as { content: Array<{ text: string }>; isError: boolean }

    expect(response.isError).toBe(true)
    expect(response.content[0].text).toContain('Network error')
  })

  it('includes warnings in result when present', async () => {
    const mockResponse = {
      themes: [],
      pairwiseSimilarity: [],
      overlappingStocks: [],
      warnings: ['Theme abc not found'],
    }
    mockFetchApi.mockResolvedValueOnce(mockResponse)

    const { registerCompareThemes } = await import('../tools/compare-themes.js')

    let registeredHandler: (args: Record<string, unknown>) => Promise<unknown> = async () => ({})
    const mockServer = {
      tool: (_name: string, _desc: string, _schema: unknown, handler: typeof registeredHandler) => {
        registeredHandler = handler
      },
    }
    registerCompareThemes(mockServer as never)

    const result = await registeredHandler({
      theme_ids: [
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222',
      ],
    })
    const content = (result as { content: Array<{ text: string }> }).content[0].text

    expect(content).toContain('Theme abc not found')
  })
})
