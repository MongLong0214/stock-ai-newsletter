import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// --- Supabase mock ---
const mockSelect = vi.fn()
const mockFrom = vi.fn(() => ({ select: mockSelect }))
const mockInsert = vi.fn()
const mockUpdate = vi.fn()
const mockDelete = vi.fn()
const mockRpc = vi.fn()

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => {
      const chain = {
        select: mockSelect,
        insert: mockInsert,
        update: mockUpdate,
        delete: mockDelete,
      }
      mockFrom(table)
      return chain
    },
    rpc: mockRpc,
  }),
}))

// --- fs mock ---
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
  return {
    ...actual,
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
  }
})

import * as fs from 'node:fs'

/** Helper: mock a chained query that returns .select().in().gte().range() */
function mockMetricQuery(data: unknown[], error: unknown = null) {
  return {
    in: vi.fn().mockReturnValue({
      gte: vi.fn().mockReturnValue({
        range: vi.fn().mockResolvedValue({ data, error }),
      }),
    }),
  }
}

describe('dump-data', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.resetModules()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
  })

  it('aborts when gitignore missing pattern', async () => {
    vi.mocked(fs.readFileSync).mockReturnValue('node_modules\n.env\n')
    const { dumpHistoricalData } = await import('../dump-data')
    await expect(dumpHistoricalData()).rejects.toThrow(
      'historical-data.json이 .gitignore에 등록되지 않았습니다',
    )
  })

  it('excludes themes with less than 30 days', async () => {
    vi.mocked(fs.readFileSync).mockReturnValue('node_modules\nhistorical-data.json\n')

    const themeId = 'theme-short'
    const today = new Date()
    const twentyDaysAgo = new Date(today.getTime() - 20 * 24 * 60 * 60 * 1000)
    const interestMetrics = Array.from({ length: 20 }, (_, i) => {
      const d = new Date(twentyDaysAgo.getTime() + i * 24 * 60 * 60 * 1000)
      return { theme_id: themeId, time: d.toISOString().split('T')[0], raw_value: 50 + i, normalized: 0.5 }
    })

    mockSelect
      .mockReturnValueOnce({
        eq: vi.fn().mockResolvedValue({
          data: [{ id: themeId, name: 'Short Theme', first_spike_date: null }],
          error: null,
        }),
      })
      .mockReturnValueOnce(mockMetricQuery(interestMetrics))
      .mockReturnValueOnce(mockMetricQuery([]))
      .mockReturnValueOnce(mockMetricQuery([]))

    vi.mocked(fs.writeFileSync).mockImplementation(() => {})
    const { dumpHistoricalData } = await import('../dump-data')
    const result = await dumpHistoricalData()
    expect(result.themes).toHaveLength(0)
  })

  it('output JSON has correct schema', async () => {
    vi.mocked(fs.readFileSync).mockReturnValue('historical-data.json\n')

    const themeId = 'theme-ok'
    const today = new Date()
    const ninetyDaysAgo = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000)
    const interestMetrics = Array.from({ length: 70 }, (_, i) => {
      const d = new Date(ninetyDaysAgo.getTime() + i * 24 * 60 * 60 * 1000)
      return { theme_id: themeId, time: d.toISOString().split('T')[0], raw_value: 40 + i, normalized: 0.5 + i * 0.005 }
    })
    const newsMetrics = [{ theme_id: themeId, time: '2026-01-15', article_count: 5 }]
    const lifecycleScores = [{ theme_id: themeId, calculated_at: '2026-01-15', score: 72, stage: 'Growth', components: { interest: 0.8 } }]

    mockSelect
      .mockReturnValueOnce({
        eq: vi.fn().mockResolvedValue({
          data: [{ id: themeId, name: 'Good Theme', first_spike_date: '2025-12-01' }],
          error: null,
        }),
      })
      .mockReturnValueOnce(mockMetricQuery(interestMetrics))
      .mockReturnValueOnce(mockMetricQuery(newsMetrics))
      .mockReturnValueOnce(mockMetricQuery(lifecycleScores))

    vi.mocked(fs.writeFileSync).mockImplementation(() => {})
    const { dumpHistoricalData } = await import('../dump-data')
    const result = await dumpHistoricalData()

    expect(result).toHaveProperty('dumpDate')
    expect(result).toHaveProperty('dateRange')
    expect(result).toHaveProperty('themes')
    const theme = result.themes[0]
    expect(theme).toHaveProperty('id', themeId)
    expect(theme).toHaveProperty('name', 'Good Theme')
    expect(theme).toHaveProperty('interestMetrics')
    expect(theme).toHaveProperty('newsMetrics')
    expect(theme).toHaveProperty('lifecycleScores')
  })

  it('logs summary after dump', async () => {
    vi.mocked(fs.readFileSync).mockReturnValue('historical-data.json\n')

    const themeId = 'theme-log'
    const today = new Date()
    const ninetyDaysAgo = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000)
    const interestMetrics = Array.from({ length: 65 }, (_, i) => {
      const d = new Date(ninetyDaysAgo.getTime() + i * 24 * 60 * 60 * 1000)
      return { theme_id: themeId, time: d.toISOString().split('T')[0], raw_value: 50, normalized: 0.5 }
    })

    mockSelect
      .mockReturnValueOnce({
        eq: vi.fn().mockResolvedValue({
          data: [{ id: themeId, name: 'Log Theme', first_spike_date: null }],
          error: null,
        }),
      })
      .mockReturnValueOnce(mockMetricQuery(interestMetrics))
      .mockReturnValueOnce(mockMetricQuery([]))
      .mockReturnValueOnce(mockMetricQuery([]))

    vi.mocked(fs.writeFileSync).mockImplementation(() => {})
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const { dumpHistoricalData } = await import('../dump-data')
    await dumpHistoricalData()

    const summaryCall = consoleSpy.mock.calls.find(
      call => typeof call[0] === 'string' && call[0].includes('테마'),
    )
    expect(summaryCall).toBeDefined()
    consoleSpy.mockRestore()
  })

  it('aborts when non-SELECT query attempted', async () => {
    vi.mocked(fs.readFileSync).mockReturnValue('historical-data.json\n')
    mockSelect.mockReturnValueOnce({
      eq: vi.fn().mockResolvedValue({ data: [], error: null }),
    })
    vi.mocked(fs.writeFileSync).mockImplementation(() => {})

    const { dumpHistoricalData } = await import('../dump-data')
    await dumpHistoricalData()

    expect(mockInsert).not.toHaveBeenCalled()
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(mockDelete).not.toHaveBeenCalled()
    expect(mockRpc).not.toHaveBeenCalled()
  })
})
