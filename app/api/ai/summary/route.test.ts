import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ThemeRanking } from '@/lib/tli/types'
import { GET } from './route'
import { getRankingServer } from '@/app/themes/_services/get-ranking-server'

vi.mock('@/app/themes/_services/get-ranking-server', () => ({
  getRankingServer: vi.fn(),
}))

const mockedGetRankingServer = vi.mocked(getRankingServer)

function makeRanking(): ThemeRanking {
  return {
    emerging: [
      {
        id: 'em-1',
        name: 'Emerging 1',
        nameEn: null,
        score: 61,
        stage: 'Emerging',
        stageKo: '초기',
        change7d: 4,
        stockCount: 3,
        topStocks: [],
        isReigniting: false,
        updatedAt: '2026-03-15',
        sparkline: [52, 56, 61],
        newsCount7d: 3,
        confidenceLevel: 'medium',
        avgStockChange: null,
      },
    ],
    growth: [
      {
        id: 'gr-1',
        name: 'Growth 1',
        nameEn: null,
        score: 72,
        stage: 'Growth',
        stageKo: '성장',
        change7d: 5,
        stockCount: 4,
        topStocks: [],
        isReigniting: false,
        updatedAt: '2026-03-15',
        sparkline: [60, 66, 72],
        newsCount7d: 4,
        confidenceLevel: 'high',
        avgStockChange: null,
      },
    ],
    peak: [
      {
        id: 'pk-1',
        name: 'Peak 1',
        nameEn: null,
        score: 83,
        stage: 'Peak',
        stageKo: '정점',
        change7d: 1,
        stockCount: 5,
        topStocks: [],
        isReigniting: false,
        updatedAt: '2026-03-15',
        sparkline: [80, 82, 83],
        newsCount7d: 6,
        confidenceLevel: 'high',
        avgStockChange: null,
      },
    ],
    decline: [
      {
        id: 'de-1',
        name: 'Decline 1',
        nameEn: null,
        score: 57,
        stage: 'Decline',
        stageKo: '하락',
        change7d: -3,
        stockCount: 2,
        topStocks: [],
        isReigniting: false,
        updatedAt: '2026-03-15',
        sparkline: [63, 60, 57],
        newsCount7d: 2,
        confidenceLevel: 'medium',
        avgStockChange: null,
      },
    ],
    reigniting: [],
    signals: [],
    summary: {
      totalThemes: 176,
      trackedThemes: 263,
      visibleThemes: 42,
      byStage: {
        Peak: 92,
        Growth: 38,
        Emerging: 21,
        Decline: 25,
      },
      hottestTheme: null,
      surging: null,
      avgScore: 64.2,
    },
  }
}

describe('AI summary route', () => {
  beforeEach(() => {
    mockedGetRankingServer.mockReset()
  })

  it('reports tracked and active counts from summary instead of capped arrays', async () => {
    mockedGetRankingServer.mockResolvedValue(makeRanking())

    const response = await GET(new Request('http://localhost/api/ai/summary'), {} as never)
    const body = await response.json()

    expect(body.marketOverview.totalActiveThemes).toBe(176)
    expect(body.marketOverview.trackedThemes).toBe(263)
    expect(body.marketOverview.visibleThemes).toBe(42)
    expect(body.marketOverview.stageDistribution.peak).toBe(92)
    expect(body.marketOverview.averageScore).toBe(64.2)
    expect(body.marketOverview.description).toContain('263개 테마 추적 중, 품질 게이트 통과 176개')
  })
})
