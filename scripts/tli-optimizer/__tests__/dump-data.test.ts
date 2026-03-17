import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { HistoricalData } from '../dump-data'

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
    // .gitignore exists but does NOT contain 'historical-data.json'
    vi.mocked(fs.readFileSync).mockReturnValue('node_modules\n.env\n')

    const { dumpHistoricalData } = await import('../dump-data')

    await expect(dumpHistoricalData()).rejects.toThrow(
      'historical-data.json이 .gitignore에 등록되지 않았습니다',
    )
  })

  it('excludes themes with less than 60 days', async () => {
    // .gitignore contains the pattern
    vi.mocked(fs.readFileSync).mockReturnValue('node_modules\nhistorical-data.json\n')

    // Theme with only 30 days of interest metrics
    const themeId = 'theme-short'
    const today = new Date()
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)

    const interestMetrics = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(thirtyDaysAgo.getTime() + i * 24 * 60 * 60 * 1000)
      return {
        theme_id: themeId,
        time: d.toISOString().split('T')[0],
        raw_value: 50 + i,
        normalized: 0.5,
      }
    })

    // Mock themes query
    mockSelect
      .mockReturnValueOnce({
        eq: vi.fn().mockResolvedValue({
          data: [{ id: themeId, name: 'Short Theme', first_spike_date: null }],
          error: null,
        }),
      })
      // interest_metrics
      .mockReturnValueOnce({
        in: vi.fn().mockReturnValue({
          gte: vi.fn().mockResolvedValue({
            data: interestMetrics,
            error: null,
          }),
        }),
      })
      // news_metrics
      .mockReturnValueOnce({
        in: vi.fn().mockReturnValue({
          gte: vi.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        }),
      })
      // lifecycle_scores
      .mockReturnValueOnce({
        in: vi.fn().mockReturnValue({
          gte: vi.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        }),
      })

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

    // 70 days of interest metrics (>= 60)
    const interestMetrics = Array.from({ length: 70 }, (_, i) => {
      const d = new Date(ninetyDaysAgo.getTime() + i * 24 * 60 * 60 * 1000)
      return {
        theme_id: themeId,
        time: d.toISOString().split('T')[0],
        raw_value: 40 + i,
        normalized: 0.5 + i * 0.005,
      }
    })

    const newsMetrics = [
      { theme_id: themeId, time: '2026-01-15', article_count: 5 },
    ]

    const lifecycleScores = [
      {
        theme_id: themeId,
        calculated_at: '2026-01-15',
        score: 72,
        stage: 'Growth',
        components: { interest: 0.8, news: 0.6 },
      },
    ]

    mockSelect
      .mockReturnValueOnce({
        eq: vi.fn().mockResolvedValue({
          data: [{ id: themeId, name: 'Good Theme', first_spike_date: '2025-12-01' }],
          error: null,
        }),
      })
      .mockReturnValueOnce({
        in: vi.fn().mockReturnValue({
          gte: vi.fn().mockResolvedValue({ data: interestMetrics, error: null }),
        }),
      })
      .mockReturnValueOnce({
        in: vi.fn().mockReturnValue({
          gte: vi.fn().mockResolvedValue({ data: newsMetrics, error: null }),
        }),
      })
      .mockReturnValueOnce({
        in: vi.fn().mockReturnValue({
          gte: vi.fn().mockResolvedValue({ data: lifecycleScores, error: null }),
        }),
      })

    vi.mocked(fs.writeFileSync).mockImplementation(() => {})

    const { dumpHistoricalData } = await import('../dump-data')
    const result = await dumpHistoricalData()

    // Top-level schema
    expect(result).toHaveProperty('dumpDate')
    expect(result).toHaveProperty('dateRange')
    expect(result.dateRange).toHaveProperty('from')
    expect(result.dateRange).toHaveProperty('to')
    expect(result).toHaveProperty('themes')
    expect(Array.isArray(result.themes)).toBe(true)

    // Theme schema
    const theme = result.themes[0]
    expect(theme).toHaveProperty('id', themeId)
    expect(theme).toHaveProperty('name', 'Good Theme')
    expect(theme).toHaveProperty('firstSpikeDate', '2025-12-01')
    expect(theme).toHaveProperty('interestMetrics')
    expect(theme).toHaveProperty('newsMetrics')
    expect(theme).toHaveProperty('lifecycleScores')

    // Metric shapes
    expect(theme.interestMetrics[0]).toHaveProperty('time')
    expect(theme.interestMetrics[0]).toHaveProperty('raw_value')
    expect(theme.interestMetrics[0]).toHaveProperty('normalized')

    expect(theme.newsMetrics[0]).toHaveProperty('time')
    expect(theme.newsMetrics[0]).toHaveProperty('article_count')

    expect(theme.lifecycleScores[0]).toHaveProperty('calculated_at')
    expect(theme.lifecycleScores[0]).toHaveProperty('score')
    expect(theme.lifecycleScores[0]).toHaveProperty('stage')
    expect(theme.lifecycleScores[0]).toHaveProperty('components')
  })

  it('logs summary after dump', async () => {
    vi.mocked(fs.readFileSync).mockReturnValue('historical-data.json\n')

    const themeId = 'theme-log'
    const today = new Date()
    const ninetyDaysAgo = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000)

    const interestMetrics = Array.from({ length: 65 }, (_, i) => {
      const d = new Date(ninetyDaysAgo.getTime() + i * 24 * 60 * 60 * 1000)
      return {
        theme_id: themeId,
        time: d.toISOString().split('T')[0],
        raw_value: 50,
        normalized: 0.5,
      }
    })

    mockSelect
      .mockReturnValueOnce({
        eq: vi.fn().mockResolvedValue({
          data: [{ id: themeId, name: 'Log Theme', first_spike_date: null }],
          error: null,
        }),
      })
      .mockReturnValueOnce({
        in: vi.fn().mockReturnValue({
          gte: vi.fn().mockResolvedValue({ data: interestMetrics, error: null }),
        }),
      })
      .mockReturnValueOnce({
        in: vi.fn().mockReturnValue({
          gte: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      })
      .mockReturnValueOnce({
        in: vi.fn().mockReturnValue({
          gte: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      })

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

    // The dump script must NOT use .insert(), .update(), .delete(), or .rpc()
    // We verify the mock functions were never called
    mockSelect
      .mockReturnValueOnce({
        eq: vi.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
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
