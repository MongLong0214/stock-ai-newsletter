import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock fetchApi
const mockFetchApi = vi.fn()
vi.mock('../fetch-helper.js', () => ({
  fetchApi: (...args: unknown[]) => mockFetchApi(...args),
  formatResult: (data: unknown, context?: string) =>
    context ? `${context}\n\n${JSON.stringify(data, null, 2)}` : JSON.stringify(data, null, 2),
  formatError: (error: unknown) =>
    `Error: ${error instanceof Error ? error.message : String(error)}`,
}))

describe('get-methodology MCP tool (API fetch mode)', () => {
  beforeEach(() => {
    mockFetchApi.mockReset()
  })

  it('calls fetchApi with /api/tli/methodology when no section', async () => {
    const mockData = {
      scoring: { range: '0-100', components: [] },
      updatedAt: '2026-03-25',
    }
    mockFetchApi.mockResolvedValueOnce(mockData)

    // We need to dynamically import to get the module after mocks are set
    const { registerGetMethodology } = await import('../tools/get-methodology.js')

    // Create a mock MCP server
    let registeredHandler: (args: Record<string, unknown>) => Promise<unknown> = async () => ({})
    const mockServer = {
      tool: (_name: string, _desc: string, _schema: unknown, handler: typeof registeredHandler) => {
        registeredHandler = handler
      },
    }
    registerGetMethodology(mockServer as never)

    const result = await registeredHandler({})
    expect(mockFetchApi).toHaveBeenCalledWith('/api/tli/methodology', undefined)
    expect(result).toHaveProperty('content')
    const content = (result as { content: Array<{ text: string }> }).content[0].text
    expect(content).toContain('scoring')
  })

  it('passes section param to fetchApi', async () => {
    const mockData = { section: 'scoring', range: '0-100', components: [] }
    mockFetchApi.mockResolvedValueOnce(mockData)

    const { registerGetMethodology } = await import('../tools/get-methodology.js')

    let registeredHandler: (args: Record<string, unknown>) => Promise<unknown> = async () => ({})
    const mockServer = {
      tool: (_name: string, _desc: string, _schema: unknown, handler: typeof registeredHandler) => {
        registeredHandler = handler
      },
    }
    registerGetMethodology(mockServer as never)

    await registeredHandler({ section: 'scoring' })
    expect(mockFetchApi).toHaveBeenCalledWith('/api/tli/methodology', { section: 'scoring' })
  })

  it('returns fallback on fetchApi failure', async () => {
    mockFetchApi.mockRejectedValueOnce(new Error('network error'))

    const { registerGetMethodology } = await import('../tools/get-methodology.js')

    let registeredHandler: (args: Record<string, unknown>) => Promise<unknown> = async () => ({})
    const mockServer = {
      tool: (_name: string, _desc: string, _schema: unknown, handler: typeof registeredHandler) => {
        registeredHandler = handler
      },
    }
    registerGetMethodology(mockServer as never)

    const result = await registeredHandler({})
    const content = (result as { content: Array<{ text: string }> }).content[0].text
    expect(content).toContain('fallback')
    expect(content).toContain('interest')
    // Should NOT be an error result
    expect((result as { isError?: boolean }).isError).toBeUndefined()
  })
})
