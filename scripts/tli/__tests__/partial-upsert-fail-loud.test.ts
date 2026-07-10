import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ThemeWithKeywords } from '@/scripts/tli/shared/data-ops'

const collectionMocks = vi.hoisted(() => ({
  collectNaverNews: vi.fn(),
  collectNaverDatalab: vi.fn(),
  collectNaverFinanceStocks: vi.fn(),
  upsertInterestMetrics: vi.fn(),
  upsertNewsMetrics: vi.fn(),
  upsertNewsArticles: vi.fn(),
  upsertThemeStocks: vi.fn(),
  runMondayOrigins: vi.fn(),
}))

vi.mock('@/scripts/tli/collectors/naver-news', () => ({
  collectNaverNews: collectionMocks.collectNaverNews,
}))

vi.mock('@/scripts/tli/collectors/naver-datalab', () => ({
  collectNaverDatalab: collectionMocks.collectNaverDatalab,
}))

vi.mock('@/scripts/tli/collectors/naver-finance-themes', () => ({
  collectNaverFinanceStocks: collectionMocks.collectNaverFinanceStocks,
}))

vi.mock('@/scripts/tli/origins/run-monday-origins', () => ({
  runMondayOrigins: collectionMocks.runMondayOrigins,
}))

vi.mock('@/scripts/tli/shared/data-ops', () => ({
  upsertInterestMetrics: collectionMocks.upsertInterestMetrics,
  upsertNewsMetrics: collectionMocks.upsertNewsMetrics,
  upsertNewsArticles: collectionMocks.upsertNewsArticles,
  upsertThemeStocks: collectionMocks.upsertThemeStocks,
}))

vi.mock('@/scripts/tli/shared/utils', () => ({
  daysAgo: vi.fn(() => '2026-02-20'),
}))

vi.mock('@/scripts/tli/scoring/calculate-scores', () => ({
  calculateAndSaveScores: vi.fn(),
}))

vi.mock('@/scripts/tli/comparison/calculate-comparisons', () => ({
  calculateThemeComparisons: vi.fn(),
}))

vi.mock('@/scripts/tli/comparison/auto-tune', () => ({
  computeOptimalThreshold: vi.fn(),
}))

vi.mock('@/scripts/tli/comparison/snapshot-predictions', () => ({
  snapshotPredictions: vi.fn(),
}))

vi.mock('@/scripts/tli/comparison/theme-predictions-v3', () => ({
  snapshotThemePredictionsV3: vi.fn(),
}))

vi.mock('@/scripts/tli/comparison/evaluate-predictions', () => ({
  evaluatePredictions: vi.fn(),
}))

vi.mock('@/scripts/tli/comparison/evaluate-comparisons', () => ({
  evaluateComparisonOutcomes: vi.fn(),
}))

vi.mock('@/scripts/tli/comparison/materialize-phase0-artifacts', () => ({
  materializePhase0Artifacts: vi.fn(),
}))

vi.mock('@/lib/indexnow', () => ({
  submitToIndexNow: vi.fn(),
  buildThemeUrls: vi.fn(() => []),
}))

vi.mock('@/scripts/tli/scoring/calibrate-noise', () => ({
  calibrateNoiseThreshold: vi.fn(),
}))

vi.mock('@/scripts/tli/scoring/calibrate-confidence', () => ({
  calibrateConfidence: vi.fn(),
}))

vi.mock('@/scripts/tli/scoring/calibrate-weights', () => ({
  calibrateWeights: vi.fn(),
}))

vi.mock('@/scripts/tli/scoring/load-calibrations', () => ({
  loadCalibrationsFromDB: vi.fn(),
}))

const themes: ThemeWithKeywords[] = [
  {
    id: 'theme-1',
    name: '테마',
    name_en: null,
    description: null,
    naver_theme_id: null,
    is_active: true,
    first_spike_date: null,
    created_at: '2026-03-20T00:00:00.000Z',
    updated_at: '2026-03-20T00:00:00.000Z',
    keywords: ['테마'],
    naverKeywords: ['테마'],
  },
]

describe('partial batch upsert fail-loud propagation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    collectionMocks.collectNaverNews.mockResolvedValue({
      metrics: [{ themeId: 'theme-1', date: '2026-03-20', articleCount: 7 }],
      articles: [],
    })
    collectionMocks.collectNaverDatalab.mockResolvedValue([])
    collectionMocks.collectNaverFinanceStocks.mockResolvedValue([])
    collectionMocks.upsertInterestMetrics.mockResolvedValue(0)
    collectionMocks.upsertNewsMetrics.mockResolvedValue(0)
    collectionMocks.upsertNewsArticles.mockResolvedValue(0)
    collectionMocks.upsertThemeStocks.mockResolvedValue(0)
    collectionMocks.runMondayOrigins.mockResolvedValue({
      asOfDate: '2026-03-20',
      skippedReason: 'up_to_date',
      origins: [],
    })
  })

  it('increments collection criticalFailures when a news metrics upsert reports partial failure', async () => {
    // Given: collection succeeds but the storage layer reports a partial write.
    // upsertNewsMetrics wraps batchUpsert, which (with default options) already fails loud
    // internally on any partial/total failure — so the fixture simulates that same contract
    // instead of the old "resolve with a failedCount for the caller to re-check" behavior.
    collectionMocks.upsertNewsMetrics.mockRejectedValue(new Error('뉴스 메트릭 부분 저장 실패 (1/1건 실패, 0건 저장됨)'))
    const { collectDataSources } = await import('@/scripts/tli/batch/pipeline-steps')

    // When: the news-only collection path persists the metrics.
    const result = await collectDataSources(themes, 'news-only', '2026-03-20')

    // Then: the partial persistence failure is surfaced as critical.
    expect(result.criticalFailures).toBeGreaterThan(0)
  })

  it('runs Monday origins from the news-only collection path', async () => {
    const { collectDataSources } = await import('@/scripts/tli/batch/pipeline-steps')

    const result = await collectDataSources(themes, 'news-only', '2026-07-13')

    expect(collectionMocks.runMondayOrigins).toHaveBeenCalledWith('2026-07-13')
    expect(result.criticalFailures).toBe(0)
  })

  it('surfaces a news-only Monday origin failure as critical', async () => {
    collectionMocks.runMondayOrigins.mockRejectedValue(new Error('origin RPC failed'))
    const { collectDataSources } = await import('@/scripts/tli/batch/pipeline-steps')

    const result = await collectDataSources(themes, 'news-only', '2026-07-13')

    expect(result.criticalFailures).toBe(1)
  })
})
