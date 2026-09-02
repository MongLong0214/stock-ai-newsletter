import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  collectForecastInterestRuns: vi.fn(),
  collectNaverDatalab: vi.fn(),
  collectNaverFinanceStocks: vi.fn(),
  collectNaverNews: vi.fn(),
  countActiveThemeStocks: vi.fn(),
  evaluateAndRecordStudyOriginEligibility: vi.fn(),
  isDatalabForceRefresh: vi.fn(),
  loadTodayCompleteDatalabRuns: vi.fn(),
  pruneStaleNewsArticles: vi.fn(),
  runMondayOrigins: vi.fn(),
  upsertInterestMetrics: vi.fn(),
  upsertNewsArticles: vi.fn(),
  upsertNewsMetrics: vi.fn(),
  upsertThemeStocks: vi.fn(),
}))

vi.mock('@/scripts/tli/shared/data-ops', () => ({
  NEWS_ARTICLE_RETENTION_DAYS: 30,
  countActiveThemeStocks: mocks.countActiveThemeStocks,
  pruneStaleNewsArticles: mocks.pruneStaleNewsArticles,
  upsertInterestMetrics: mocks.upsertInterestMetrics,
  upsertNewsArticles: mocks.upsertNewsArticles,
  upsertNewsMetrics: mocks.upsertNewsMetrics,
  upsertThemeStocks: mocks.upsertThemeStocks,
}))

vi.mock('@/scripts/tli/collectors/naver-datalab', () => ({
  collectForecastInterestRuns: mocks.collectForecastInterestRuns,
  collectNaverDatalab: mocks.collectNaverDatalab,
}))

vi.mock('@/scripts/tli/collectors/naver-datalab-reuse', () => ({
  isDatalabForceRefresh: mocks.isDatalabForceRefresh,
  loadTodayCompleteDatalabRuns: mocks.loadTodayCompleteDatalabRuns,
}))

vi.mock('@/scripts/tli/collectors/naver-finance-themes', () => ({
  collectNaverFinanceStocks: mocks.collectNaverFinanceStocks,
}))

vi.mock('@/scripts/tli/collectors/naver-news', () => ({
  collectNaverNews: mocks.collectNaverNews,
}))

vi.mock('@/scripts/tli/origins/run-monday-origins', () => ({
  runMondayOrigins: mocks.runMondayOrigins,
}))

vi.mock('@/scripts/tli/origins/run-origin-eligibility', () => ({
  evaluateAndRecordStudyOriginEligibility: mocks.evaluateAndRecordStudyOriginEligibility,
}))

import { collectDataSources, runMondayOriginsStep } from '../batch/collection-pipeline'

const THEME = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'HBM',
  naver_theme_id: '100',
  naverKeywords: ['HBM'],
}

describe('collectDataSources datalab-only mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isDatalabForceRefresh.mockReturnValue(false)
    mocks.loadTodayCompleteDatalabRuns.mockResolvedValue(new Map())
    mocks.collectNaverDatalab.mockResolvedValue({
      metrics: [{ themeId: THEME.id, date: '2026-09-02', rawValue: 42, normalized: 100 }],
      report: { requested: 1, succeeded: 1, failed: 0, persistenceFailed: 0 },
    })
    mocks.collectForecastInterestRuns.mockResolvedValue({
      requested: 1,
      succeeded: 1,
      failed: 0,
      persistenceFailed: 0,
    })
    mocks.upsertInterestMetrics.mockResolvedValue(undefined)
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('loads the reuse map once, updates interest cache, and skips every non-DataLab source', async () => {
    const result = await collectDataSources([THEME], 'datalab-only', '2026-09-02')

    expect(result).toEqual({ criticalFailures: 0, datalabFailed: false })
    expect(mocks.loadTodayCompleteDatalabRuns).toHaveBeenCalledOnce()
    expect(mocks.loadTodayCompleteDatalabRuns).toHaveBeenCalledWith({ kstDate: '2026-09-02' })
    expect(mocks.collectNaverDatalab).toHaveBeenCalledOnce()
    expect(mocks.collectForecastInterestRuns).toHaveBeenCalledOnce()
    expect(mocks.upsertInterestMetrics).toHaveBeenCalledOnce()
    expect(mocks.collectNaverNews).not.toHaveBeenCalled()
    expect(mocks.collectNaverFinanceStocks).not.toHaveBeenCalled()
    expect(mocks.runMondayOrigins).not.toHaveBeenCalled()
    expect(mocks.evaluateAndRecordStudyOriginEligibility).not.toHaveBeenCalled()
    expect(mocks.upsertNewsMetrics).not.toHaveBeenCalled()
    expect(mocks.upsertNewsArticles).not.toHaveBeenCalled()
    expect(mocks.upsertThemeStocks).not.toHaveBeenCalled()

    const batchOptions = mocks.collectNaverDatalab.mock.calls[0][3]
    const forecastOptions = mocks.collectForecastInterestRuns.mock.calls[0][2]
    expect(forecastOptions.reuseRuns).toBe(batchOptions.reuseRuns)
  })
})

describe('runMondayOriginsStep failure severity', () => {
  const originReport = {
    asOfDate: '2026-09-02',
    skippedReason: 'up_to_date' as const,
    origins: [],
  }
  const eligibilityReport = (newlyRecordedIneligibleCount: number) => ({
    evaluations: [],
    summary: {
      evaluatedCount: newlyRecordedIneligibleCount,
      eligibleCount: 0,
      ineligibleCount: newlyRecordedIneligibleCount,
      insertedCount: newlyRecordedIneligibleCount,
      newlyRecordedIneligibleCount,
      severity: newlyRecordedIneligibleCount > 0 ? 'critical' as const : 'pass' as const,
      exitCode: newlyRecordedIneligibleCount > 0 ? 3 : 0,
    },
  })

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('keeps a newly recorded ineligible origin critical in full mode', async () => {
    await expect(runMondayOriginsStep('2026-09-02', 'full', {
      runOrigins: vi.fn(async () => originReport),
      evaluateEligibility: vi.fn(async () => eligibilityReport(1)),
    })).resolves.toEqual({ warningFailures: 0, criticalFailures: 1 })
  })

  it('evaluates pending eligibility even when origin generation is up to date', async () => {
    const evaluateEligibility = vi.fn(async () => eligibilityReport(0))

    await expect(runMondayOriginsStep('2026-09-02', 'full', {
      runOrigins: vi.fn(async () => originReport),
      evaluateEligibility,
    })).resolves.toEqual({ warningFailures: 0, criticalFailures: 0 })

    expect(evaluateEligibility).toHaveBeenCalledWith({
      today: '2026-09-02',
      originDates: [],
      scope: 'pending',
    })
  })

  it('keeps eligibility infrastructure failures retryable with the existing mode severity', async () => {
    const evaluateEligibility = vi.fn(async () => { throw new Error('eligibility unavailable') })

    await expect(runMondayOriginsStep('2026-09-02', 'full', {
      runOrigins: vi.fn(async () => originReport),
      evaluateEligibility,
    })).resolves.toEqual({ warningFailures: 1, criticalFailures: 0 })
    await expect(runMondayOriginsStep('2026-09-02', 'news-only', {
      runOrigins: vi.fn(async () => originReport),
      evaluateEligibility,
    })).resolves.toEqual({ warningFailures: 0, criticalFailures: 1 })

    expect(console.error).toHaveBeenCalledWith(
      '❌ eligibility 평가 실패 — 다음 run에서 pending 재평가:',
      'eligibility unavailable',
    )
  })

  it('keeps an origin generation failure warning-only in full mode', async () => {
    await expect(runMondayOriginsStep('2026-09-02', 'full', {
      runOrigins: vi.fn(async () => { throw new Error('origin failed') }),
    })).resolves.toEqual({ warningFailures: 1, criticalFailures: 0 })
  })

  it('keeps an origin generation failure critical in news-only mode', async () => {
    await expect(runMondayOriginsStep('2026-09-02', 'news-only', {
      runOrigins: vi.fn(async () => { throw new Error('origin failed') }),
    })).resolves.toEqual({ warningFailures: 0, criticalFailures: 1 })
  })
})

describe('collect-and-score datalab-only entrypoint contract', () => {
  const source = readFileSync('scripts/tli/batch/collect-and-score.ts', 'utf8')

  it('recognizes datalab-only while keeping lifecycle, prices, analysis, and IndexNow full-only', () => {
    expect(source).toContain("export type RunMode = 'full' | 'news-only' | 'datalab-only'")
    expect(source).toContain("if (value === 'news-only' || value === 'datalab-only') return value")
    expect(source).toContain("mode === 'full'\n      && collection.criticalFailures === 0")
    expect(source).toContain("if (mode === 'full')")
    expect(source).toContain("if (mode === 'full' && !shouldAbortAnalysisPipeline")
  })
})
