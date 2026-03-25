import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock fetch-helper before importing the module under test
vi.mock('../fetch-helper.js', () => ({
  fetchApi: vi.fn(),
  formatResult: vi.fn((data: unknown, ctx: string) => `${ctx}\n\n${JSON.stringify(data)}`),
  formatError: vi.fn((err: unknown) => `Error: ${err}`),
  formatEmptyResult: vi.fn((ctx: string, guidance: string) => `${ctx}\n\n[]\n\n${guidance}`),
}))

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { fetchApi, formatResult, formatEmptyResult } from '../fetch-helper.js'
import { registerGetThemeChanges } from '../tools/get-theme-changes.js'

const mockFetchApi = vi.mocked(fetchApi)
const mockFormatResult = vi.mocked(formatResult)
const mockFormatEmptyResult = vi.mocked(formatEmptyResult)

describe('get_theme_changes tool', () => {
  let server: McpServer
  let registeredHandler: (args: { period?: string }) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>

  beforeEach(() => {
    vi.clearAllMocks()

    // Capture the handler registered with server.tool
    server = {
      tool: vi.fn((_name: string, _desc: string, _schema: unknown, handler: unknown) => {
        registeredHandler = handler as typeof registeredHandler
      }),
    } as unknown as McpServer

    registerGetThemeChanges(server)
  })

  it('registers tool with name get_theme_changes', () => {
    expect(server.tool).toHaveBeenCalledWith(
      'get_theme_changes',
      expect.any(String),
      expect.objectContaining({ period: expect.anything() }),
      expect.any(Function),
    )
  })

  it('calls fetchApi with default period 1d when no period given', async () => {
    mockFetchApi.mockResolvedValue({
      movers: { rising: [], falling: [] },
      stageTransitions: [],
      newlyEmerging: [],
    })

    await registeredHandler({})

    expect(mockFetchApi).toHaveBeenCalledWith('/api/tli/changes', { period: '1d' })
  })

  it('passes period=7d to fetchApi', async () => {
    mockFetchApi.mockResolvedValue({
      movers: { rising: [], falling: [] },
      stageTransitions: [],
      newlyEmerging: [],
    })

    await registeredHandler({ period: '7d' })

    expect(mockFetchApi).toHaveBeenCalledWith('/api/tli/changes', { period: '7d' })
  })

  it('returns formatted result with context on success', async () => {
    const mockData = {
      movers: {
        rising: [{ themeId: '1', name: 'AI', change: 15 }],
        falling: [{ themeId: '2', name: '반도체', change: -10 }],
      },
      stageTransitions: [{ themeId: '3', name: '배터리', from: 'Growth', to: 'Peak' }],
      newlyEmerging: [],
    }
    mockFetchApi.mockResolvedValue(mockData)

    const result = await registeredHandler({ period: '1d' })

    expect(mockFormatResult).toHaveBeenCalledWith(mockData, expect.stringContaining('Theme Changes'))
    expect(result.content[0].type).toBe('text')
    expect(result.isError).toBeUndefined()
  })

  it('returns formatEmptyResult with guidance when all arrays are empty', async () => {
    const emptyData = {
      movers: { rising: [], falling: [] },
      stageTransitions: [],
      newlyEmerging: [],
    }
    mockFetchApi.mockResolvedValue(emptyData)

    const result = await registeredHandler({})

    expect(mockFormatEmptyResult).toHaveBeenCalledWith(
      expect.stringContaining('Theme Changes'),
      expect.stringContaining('No significant changes'),
    )
    expect(result.content[0].type).toBe('text')
  })

  it('returns error on fetchApi failure', async () => {
    mockFetchApi.mockRejectedValue(new Error('Network error'))

    const result = await registeredHandler({})

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('Error')
  })
})
