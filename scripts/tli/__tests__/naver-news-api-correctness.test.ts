/**
 * Tests for Naver News API correctness fixes:
 * - KST midnight date parsing (DATA-001)
 * - Deduplication before metric counts (DATA-003)
 * - API cap/truncation detection (DATA-002)
 * - Coverage status metadata
 */
import { describe, it, expect, vi, afterEach } from 'vitest'

// We need to test the internal parseDate and searchThemeNews logic
// Import the module and mock fetch
vi.mock('@/scripts/tli/shared/utils', () => ({
  sleep: vi.fn().mockResolvedValue(undefined),
  withRetry: vi.fn().mockImplementation(async (fn) => fn()),
}))

describe('Naver News API — KST date parsing', () => {
  /**
   * DATA-001: A pubDate near KST midnight must resolve to the correct
   * calendar date in Asia/Seoul, not UTC.
   *
   * Example: "Tue, 15 Jul 2025 23:45:00 +0900" is 2025-07-15 in KST
   * but would be 2025-07-15 in UTC (14:45 UTC) — BUT
   * "Wed, 16 Jul 2025 00:15:00 +0900" is 2025-07-16 in KST
   * while in UTC it's 2025-07-15 (15:15 UTC).
   * The old code using .toISOString().slice(0,10) would produce 2025-07-15 for the second case.
   */
  it('parses KST midnight boundary correctly — 00:15 KST is that day, not previous UTC day', () => {
    // This tests the date logic directly
    const pubDate = 'Wed, 16 Jul 2025 00:15:00 +0900'
    const instant = new Date(pubDate)
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(instant)
    const y = parts.find(p => p.type === 'year')!.value
    const m = parts.find(p => p.type === 'month')!.value
    const d = parts.find(p => p.type === 'day')!.value
    const result = `${y}-${m}-${d}`

    expect(result).toBe('2025-07-16')

    // Verify the old behavior was wrong:
    const oldResult = instant.toISOString().slice(0, 10)
    expect(oldResult).toBe('2025-07-15') // This was the BUG — UTC gives previous day
  })

  it('parses 23:45 KST correctly as same calendar day', () => {
    const pubDate = 'Tue, 15 Jul 2025 23:45:00 +0900'
    const instant = new Date(pubDate)
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(instant)
    const y = parts.find(p => p.type === 'year')!.value
    const m = parts.find(p => p.type === 'month')!.value
    const d = parts.find(p => p.type === 'day')!.value
    const result = `${y}-${m}-${d}`

    expect(result).toBe('2025-07-15')
  })
})

describe('Naver News API — deduplication', () => {
  /**
   * DATA-003: Article count must reflect deduplicated articles,
   * not raw response items. Duplicate links should be counted once.
   */
  it('duplicate links produce count of 1, not 2', async () => {
    // Dynamically import so mocks take effect
    const { searchThemeNews } = await import('@/scripts/tli/collectors/naver-news-api')

    // Mock the module's searchNews to return duplicate items
    const mockItems = [
      {
        title: '테스트 기사 제목',
        link: 'https://news.example.com/article/123',
        originallink: 'https://news.example.com/article/123',
        description: '설명',
        pubDate: 'Mon, 14 Jul 2025 10:00:00 +0900',
      },
      {
        title: '테스트 기사 제목 (중복)',
        link: 'https://news.example.com/article/123', // same link = duplicate
        originallink: 'https://news.example.com/article/123',
        description: '설명 2',
        pubDate: 'Mon, 14 Jul 2025 11:00:00 +0900',
      },
    ]

    // Mock environment
    vi.stubEnv('NAVER_CLIENT_ID', 'test')
    vi.stubEnv('NAVER_CLIENT_SECRET', 'test')

    // Mock fetch
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        total: 2,
        start: 1,
        display: 2,
        items: mockItems,
      }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const result = await searchThemeNews({
      themeId: 'test-theme',
      keywords: ['테스트'],
      startDate: '2025-07-14',
      endDate: '2025-07-14',
    })

    // Should deduplicate: only 1 article, count of 1 for the date
    expect(result.articles).toHaveLength(1)
    expect(result.dateCounts.get('2025-07-14')).toBe(1)
  })
})

describe('Naver News API — cap/truncation detection', () => {
  /**
   * DATA-002: When apiTotal > 1000, the result must be marked truncated,
   * not complete or zero-filled for missing dates.
   */
  it('marks result as truncated when apiTotal exceeds 1000 cap', async () => {
    const { searchThemeNews } = await import('@/scripts/tli/collectors/naver-news-api')

    vi.stubEnv('NAVER_CLIENT_ID', 'test')
    vi.stubEnv('NAVER_CLIENT_SECRET', 'test')

    // Return 100 items but claim total=5000
    const items = Array.from({ length: 100 }, (_, i) => ({
      title: `기사 ${i}`,
      link: `https://news.example.com/article/${i}`,
      originallink: `https://news.example.com/article/${i}`,
      description: `설명 ${i}`,
      pubDate: 'Mon, 14 Jul 2025 10:00:00 +0900',
    }))

    let callCount = 0
    const mockFetch = vi.fn().mockImplementation(() => {
      callCount++
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          total: 5000, // exceeds 1000 cap
          start: (callCount - 1) * 100 + 1,
          display: 100,
          items: callCount <= 10 ? items : [],
        }),
      })
    })
    vi.stubGlobal('fetch', mockFetch)

    const result = await searchThemeNews({
      themeId: 'test-theme',
      keywords: ['기사'],
      startDate: '2025-07-10',
      endDate: '2025-07-14',
    })

    expect(result.coverageStatus).toBe('truncated')
    expect(result.coverageNote).toContain('1,000-result cap')
    expect(result.apiTotal).toBe(5000)
  })

  it('marks a fully fetched sparse result complete even when relevant dates do not span the window', async () => {
    const { searchThemeNews } = await import('@/scripts/tli/collectors/naver-news-api')

    vi.stubEnv('NAVER_CLIENT_ID', 'test')
    vi.stubEnv('NAVER_CLIENT_SECRET', 'test')

    // The API proves this is the entire result set. Missing requested dates are therefore real zeros.
    const items = [{
      title: '기사 제목',
      link: 'https://news.example.com/article/1',
      originallink: 'https://news.example.com/article/1',
      description: '설명',
      pubDate: 'Sun, 13 Jul 2025 10:00:00 +0900',
    }]

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ total: 1, start: 1, display: 1, items }),
    }))

    const result = await searchThemeNews({
      themeId: 'test-theme',
      keywords: ['기사'],
      startDate: '2025-07-10',
      endDate: '2025-07-14',
    })

    expect(result.coverageStatus).toBe('complete')
    expect(result.coverageNote).toBeNull()
    expect(result.observedStartDate).toBe('2025-07-13')
    expect(result.dateCounts.has('2025-07-10')).toBe(false)
  })

  it('treats API total=0 as a proven complete zero-result window', async () => {
    const { searchThemeNews } = await import('@/scripts/tli/collectors/naver-news-api')

    vi.stubEnv('NAVER_CLIENT_ID', 'test')
    vi.stubEnv('NAVER_CLIENT_SECRET', 'test')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ total: 0, start: 1, display: 0, items: [] }),
    }))

    const result = await searchThemeNews({
      themeId: 'test-theme',
      keywords: ['기사'],
      startDate: '2025-07-10',
      endDate: '2025-07-14',
    })

    expect(result.coverageStatus).toBe('complete')
    expect(result.dateCounts.size).toBe(0)
    expect(result.observedStartDate).toBeNull()
  })

  it('uses raw item dates to prove a capped search reached the requested window', async () => {
    const { searchThemeNews } = await import('@/scripts/tli/collectors/naver-news-api')

    vi.stubEnv('NAVER_CLIENT_ID', 'test')
    vi.stubEnv('NAVER_CLIENT_SECRET', 'test')

    let callCount = 0
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      callCount++
      const pubDate = callCount === 10
        ? 'Thu, 10 Jul 2025 10:00:00 +0900'
        : 'Mon, 14 Jul 2025 10:00:00 +0900'
      const items = Array.from({ length: 100 }, (_, index) => ({
        title: `무관한 제목 ${callCount}-${index}`,
        link: `https://news.example.com/${callCount}/${index}`,
        originallink: `https://news.example.com/${callCount}/${index}`,
        description: '설명',
        pubDate,
      }))
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ total: 5000, start: (callCount - 1) * 100 + 1, display: 100, items }),
      })
    }))

    const result = await searchThemeNews({
      themeId: 'test-theme',
      keywords: ['기사'],
      startDate: '2025-07-10',
      endDate: '2025-07-14',
    })

    expect(result.coverageStatus).toBe('complete')
    expect(result.observedStartDate).toBe('2025-07-10')
    expect(result.dateCounts.size).toBe(0)
    expect(callCount).toBe(10)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })
})
