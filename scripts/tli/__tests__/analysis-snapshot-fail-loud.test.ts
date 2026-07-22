import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  snapshotPredictions: vi.fn(),
  snapshotThemePredictionsV3: vi.fn(),
  calculateAndSaveScores: vi.fn(),
  runDailyLabelPhase: vi.fn(),
  countExpiredPendingLabels: vi.fn(),
  runGtAV2FoundationPhase: vi.fn(),
  materializePhase0Artifacts: vi.fn(),
  computeOptimalThreshold: vi.fn(),
  calculateThemeComparisons: vi.fn(),
  collectBablPhaseSnapshot: vi.fn(),
  runMondayOrigins: vi.fn(),
  evaluatePredictions: vi.fn(),
  evaluateThemePredictionsV3: vi.fn(),
  countExpiredPendingPredictions: vi.fn(),
  evaluateComparisonOutcomes: vi.fn(),
}))

vi.mock('@/scripts/tli/shared/data-ops', () => ({
  countActiveThemeStocks: vi.fn(),
  upsertInterestMetrics: vi.fn(),
  upsertNewsMetrics: vi.fn(),
  upsertThemeStocks: vi.fn(),
  upsertNewsArticles: vi.fn(),
}))
vi.mock('@/scripts/tli/scoring/calculate-scores', () => ({
  calculateAndSaveScores: mocks.calculateAndSaveScores,
}))
vi.mock('@/scripts/tli/labels/daily-label-phase', () => ({
  runDailyLabelPhase: mocks.runDailyLabelPhase,
  countExpiredPendingLabels: mocks.countExpiredPendingLabels,
}))
vi.mock('@/scripts/tli/labels/gta-v2-daily', () => ({
  runGtAV2FoundationPhase: mocks.runGtAV2FoundationPhase,
}))
vi.mock('@/scripts/tli/comparison/materialize-phase0-artifacts', () => ({
  materializePhase0Artifacts: mocks.materializePhase0Artifacts,
}))
vi.mock('@/scripts/tli/comparison/auto-tune', () => ({
  computeOptimalThreshold: mocks.computeOptimalThreshold,
}))
vi.mock('@/scripts/tli/comparison/calculate-comparisons', () => ({
  calculateThemeComparisons: mocks.calculateThemeComparisons,
}))
vi.mock('@/scripts/tli/comparison/snapshot-predictions', () => ({
  snapshotPredictions: mocks.snapshotPredictions,
}))
vi.mock('@/scripts/tli/comparison/theme-predictions-v3', () => ({
  snapshotThemePredictionsV3: mocks.snapshotThemePredictionsV3,
}))
vi.mock('@/scripts/tli/collectors/babl-phase-snapshot', () => ({
  collectBablPhaseSnapshot: mocks.collectBablPhaseSnapshot,
}))
vi.mock('@/scripts/tli/origins/run-monday-origins', () => ({
  runMondayOrigins: mocks.runMondayOrigins,
}))
vi.mock('@/scripts/tli/comparison/evaluate-predictions', () => ({
  evaluatePredictions: mocks.evaluatePredictions,
}))
vi.mock('@/scripts/tli/comparison/theme-predictions-v3-scoring', () => ({
  evaluateThemePredictionsV3: mocks.evaluateThemePredictionsV3,
  countExpiredPendingPredictions: mocks.countExpiredPendingPredictions,
}))
vi.mock('@/scripts/tli/comparison/evaluate-comparisons', () => ({
  evaluateComparisonOutcomes: mocks.evaluateComparisonOutcomes,
}))
vi.mock('@/scripts/tli/collectors/naver-datalab', () => ({
  collectForecastInterestRuns: vi.fn(),
  collectNaverDatalab: vi.fn(),
}))
vi.mock('@/scripts/tli/collectors/naver-news', () => ({ collectNaverNews: vi.fn() }))
vi.mock('@/scripts/tli/collectors/naver-finance-themes', () => ({
  collectNaverFinanceStocks: vi.fn(),
}))
vi.mock('@/scripts/tli/collectors/naver-finance-theme-gates', () => ({
  shouldRejectStockCollection: vi.fn(),
}))
vi.mock('@/scripts/tli/shared/utils', () => ({ daysAgo: vi.fn() }))
vi.mock('@/lib/indexnow', () => ({ submitToIndexNow: vi.fn(), buildThemeUrls: vi.fn() }))
vi.mock('@/lib/tli/trading-calendar', () => ({ shouldCollectTliStocks: vi.fn() }))
vi.mock('@/lib/tli/date-utils', () => ({ getKSTDateString: vi.fn(() => '2026-07-13') }))

describe('analysis snapshot fail-loud contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.calculateAndSaveScores.mockResolvedValue(undefined)
    mocks.runDailyLabelPhase.mockResolvedValue({
      warningFailures: 0,
      gtAFinalized: [],
      gtBFinalized: [],
      finalizeCutoffDate: '2026-07-06',
      nonTradingPendingClosed: 0,
    })
    mocks.countExpiredPendingLabels.mockResolvedValue(0)
    mocks.runGtAV2FoundationPhase.mockResolvedValue({
      pendingCreated: 0, finalized: 0, keptPending: 0, failures: 0,
    })
    mocks.materializePhase0Artifacts.mockResolvedValue({
      episodeCount: 0,
      querySnapshotCount: 0,
      analogCandidateCount: 0,
    })
    mocks.computeOptimalThreshold.mockResolvedValue(null)
    mocks.calculateThemeComparisons.mockResolvedValue(undefined)
    mocks.snapshotPredictions.mockResolvedValue(undefined)
    mocks.snapshotThemePredictionsV3.mockResolvedValue({ championRows: 0, challengerRows: 0 })
    mocks.collectBablPhaseSnapshot.mockResolvedValue(undefined)
    mocks.runMondayOrigins.mockResolvedValue({ skippedReason: 'up_to_date', origins: [] })
    mocks.evaluatePredictions.mockResolvedValue(undefined)
    mocks.evaluateThemePredictionsV3.mockResolvedValue({
      cutoffDate: '2026-07-06', updates: 0, metrics: 0, skippedPending: 0,
    })
    mocks.countExpiredPendingPredictions.mockResolvedValue(0)
    mocks.evaluateComparisonOutcomes.mockResolvedValue(undefined)
  })

  it('classifies a legacy v3 snapshot persistence failure as critical', async () => {
    mocks.snapshotThemePredictionsV3.mockRejectedValue(new Error('legacy prediction upsert failed'))
    const { runAnalysisPipeline } = await import('@/scripts/tli/batch/pipeline-steps')

    const result = await runAnalysisPipeline([], '2026-07-13')

    expect(result).toEqual({ criticalFailures: 1, warningFailures: 0 })
  })

  it('keeps the global label backlog fail-loud and requests version-specific diagnostics', async () => {
    mocks.countExpiredPendingLabels.mockImplementation(async (input) => {
      if (input.labelerVersion === 'gta-v1') return 269
      if (input.labelerVersion === 'gta-v2') return 0
      if (input.labelerVersion === 'gtb-v1') return 723
      return input.labelType === 'gt_a' ? 269 : 723
    })
    const { runAnalysisPipeline } = await import('@/scripts/tli/batch/pipeline-steps')

    const result = await runAnalysisPipeline([], '2026-07-13')

    expect(result).toEqual({ criticalFailures: 1, warningFailures: 0 })
    expect(mocks.countExpiredPendingLabels).toHaveBeenCalledWith(expect.objectContaining({
      labelType: 'gt_a',
      labelerVersion: 'gta-v1',
    }))
    expect(mocks.countExpiredPendingLabels).toHaveBeenCalledWith(expect.objectContaining({
      labelType: 'gt_a',
      labelerVersion: 'gta-v2',
    }))
    expect(mocks.countExpiredPendingLabels).toHaveBeenCalledWith(expect.objectContaining({
      labelType: 'gt_b',
      labelerVersion: 'gtb-v1',
    }))
  })
})
