import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFetchApi = vi.fn()
vi.mock('../fetch-helper.js', () => ({
  fetchApi: (...args: unknown[]) => mockFetchApi(...args),
  formatResult: (data: unknown, context?: string) =>
    context ? `${context}\n\n${JSON.stringify(data, null, 2)}` : JSON.stringify(data, null, 2),
  formatError: (error: unknown) =>
    `Error: ${error instanceof Error ? error.message : String(error)}`,
  formatEmptyResult: (context: string, guidance: string) =>
    `${context}\n\n${JSON.stringify([], null, 2)}\n\n${guidance}`,
}))

describe('get-predictions MCP tool', () => {
  let registeredHandler: (args: Record<string, unknown>) => Promise<unknown>
  let registeredName: string

  beforeEach(async () => {
    mockFetchApi.mockReset()

    const { registerGetPredictions } = await import('../tools/get-predictions.js')

    const mockServer = {
      tool: (_name: string, _desc: string, _schema: unknown, handler: typeof registeredHandler) => {
        registeredName = _name
        registeredHandler = handler
      },
    }
    registerGetPredictions(mockServer as never)
  })

  it('registers with the name get_predictions', () => {
    expect(registeredName).toBe('get_predictions')
  })

  it('calls fetchApi with /api/tli/predictions and no params when phase is omitted', async () => {
    mockFetchApi.mockResolvedValueOnce({ phase: null, dataSource: 'v4-forecast', themes: [] })

    await registeredHandler({})

    expect(mockFetchApi).toHaveBeenCalledWith('/api/tli/predictions', {})
  })

  it('passes phase param when provided', async () => {
    mockFetchApi.mockResolvedValueOnce({ phase: 'rising', dataSource: 'v4-forecast', themes: [] })

    await registeredHandler({ phase: 'rising' })

    expect(mockFetchApi).toHaveBeenCalledWith('/api/tli/predictions', { phase: 'rising' })
  })

  it('returns formatted result with context on success', async () => {
    const mockData = {
      phase: 'rising',
      dataSource: 'v4-forecast',
      themes: [
        {
          id: 'abc',
          name: 'AI',
          score: 75,
          stage: 'Growth',
          prediction: {
            phase: 'rising',
            confidence: 'high',
            daysSinceEpisodeStart: 10,
            expectedPeakDay: 25,
            topAnalog: { name: '2차전지', similarity: 0.85, peakDay: 30 },
            evidenceQuality: 'high',
          },
        },
      ],
    }
    mockFetchApi.mockResolvedValueOnce(mockData)

    const result = await registeredHandler({ phase: 'rising' })
    const content = (result as { content: Array<{ text: string }> }).content[0].text

    expect(content).toContain('Prediction')
    expect(content).toContain(JSON.stringify(mockData, null, 2))
  })

  it('returns formatted empty result with guidance when themes is empty', async () => {
    const mockData = {
      phase: 'hot',
      dataSource: 'none',
      themes: [],
      guidance: 'Prediction data not yet available.',
    }
    mockFetchApi.mockResolvedValueOnce(mockData)

    const result = await registeredHandler({ phase: 'hot' })
    const content = (result as { content: Array<{ text: string }> }).content[0].text

    expect(content).toContain('not yet available')
  })

  it('returns error on fetchApi failure', async () => {
    mockFetchApi.mockRejectedValueOnce(new Error('Network error'))

    const result = await registeredHandler({})
    const output = result as { content: Array<{ text: string }>; isError: boolean }

    expect(output.isError).toBe(true)
    expect(output.content[0].text).toContain('Network error')
  })
})
