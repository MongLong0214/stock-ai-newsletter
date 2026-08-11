/**
 * ARC-001: pipeline-steps must stop/skip dependent intra-analysis stages
 * after a critical predecessor failure and must NOT publish artifacts
 * after score/materialization failure.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock all downstream modules to track calls
const calculateAndSaveScores = vi.fn()
const calculateThemeComparisons = vi.fn()
const computeOptimalThreshold = vi.fn()
const snapshotPredictions = vi.fn()
const snapshotThemePredictionsV3 = vi.fn()
const evaluateThemePredictionsV3 = vi.fn()
const evaluatePredictions = vi.fn()
const collectBablPhaseSnapshot = vi.fn()
const evaluateComparisonOutcomes = vi.fn()
const materializePhase0Artifacts = vi.fn()
const runDailyLabelPhase = vi.fn()
const runGtAV2FoundationPhase = vi.fn()
const submitToIndexNow = vi.fn()
const buildThemeUrls = vi.fn()
const countExpiredPendingLabels = vi.fn()
const countExpiredPendingPredictions = vi.fn()
const runMondayOriginsStep = vi.fn()

vi.mock('@/scripts/tli/scoring/calculate-scores', () => ({ calculateAndSaveScores }))
vi.mock('@/scripts/tli/comparison/calculate-comparisons', () => ({ calculateThemeComparisons }))
vi.mock('@/scripts/tli/comparison/auto-tune', () => ({ computeOptimalThreshold }))
vi.mock('@/scripts/tli/comparison/snapshot-predictions', () => ({ snapshotPredictions }))
vi.mock('@/scripts/tli/comparison/theme-predictions-v3', () => ({ snapshotThemePredictionsV3 }))
vi.mock('@/scripts/tli/comparison/theme-predictions-v3-scoring', () => ({ evaluateThemePredictionsV3, countExpiredPendingPredictions }))
vi.mock('@/scripts/tli/comparison/evaluate-predictions', () => ({ evaluatePredictions }))
vi.mock('@/scripts/tli/collectors/babl-phase-snapshot', () => ({ collectBablPhaseSnapshot }))
vi.mock('@/scripts/tli/comparison/evaluate-comparisons', () => ({ evaluateComparisonOutcomes }))
vi.mock('@/scripts/tli/comparison/materialize-phase0-artifacts', () => ({ materializePhase0Artifacts }))
vi.mock('@/scripts/tli/labels/daily-label-phase', () => ({ runDailyLabelPhase, countExpiredPendingLabels }))
vi.mock('@/scripts/tli/labels/gta-v2-daily', () => ({ runGtAV2FoundationPhase }))
vi.mock('@/lib/tli/labels/gt-a', () => ({ GTA_LABELER_VERSION: 'gt-a-v1' }))
vi.mock('@/lib/tli/labels/gt-a-v2', () => ({ GTA_V2_LABELER_VERSION: 'gt-a-v2' }))
vi.mock('@/lib/tli/labels/gt-b', () => ({ GTB_LABELER_VERSION: 'gt-b-v1' }))
vi.mock('@/lib/indexnow', () => ({ submitToIndexNow, buildThemeUrls }))
vi.mock('@/lib/tli/date-utils', () => ({ getKSTDateString: () => '2025-07-15' }))
vi.mock('@/lib/tli/trading-calendar', () => ({ isKoreanTradingDate: () => true }))
vi.mock('@/scripts/tli/shared/supabase-admin', () => ({
  supabaseAdmin: { from: () => ({ select: () => ({ eq: () => ({ select: () => Promise.resolve({ count: 0, error: null }) }) }) }) },
}))
vi.mock('@/scripts/tli/batch/collection-pipeline', () => ({ runMondayOriginsStep }))

describe('pipeline-steps — abort on critical failure', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    runMondayOriginsStep.mockResolvedValue(0)
  })

  it('does NOT call comparison/prediction stages after score calculation failure', async () => {
    calculateAndSaveScores.mockRejectedValue(new Error('Score calculation failed'))

    const { runAnalysisPipeline } = await import('@/scripts/tli/batch/pipeline-steps')
    const result = await runAnalysisPipeline([], '2025-07-15')

    expect(result.criticalFailures).toBeGreaterThan(0)
    // These should NOT have been called
    expect(calculateThemeComparisons).not.toHaveBeenCalled()
    expect(snapshotPredictions).not.toHaveBeenCalled()
    expect(snapshotThemePredictionsV3).not.toHaveBeenCalled()
    expect(evaluatePredictions).not.toHaveBeenCalled()
    expect(evaluateComparisonOutcomes).not.toHaveBeenCalled()
    expect(materializePhase0Artifacts).not.toHaveBeenCalled()
  })

  it('does NOT call prediction/evaluation stages after materialization failure', async () => {
    calculateAndSaveScores.mockResolvedValue(undefined)
    runDailyLabelPhase.mockResolvedValue({
      gtAPending: { pendingCount: 0 },
      gtAFinalized: [],
      gtBFinalized: [],
      nonTradingPendingClosed: 0,
      finalizeCutoffDate: '2025-07-10',
      warningFailures: 0,
    })
    runGtAV2FoundationPhase.mockResolvedValue({ pendingCreated: 0, finalized: 0, keptPending: 0, failures: 0 })
    countExpiredPendingLabels.mockResolvedValue(0)
    materializePhase0Artifacts.mockRejectedValue(new Error('Materialization failed'))

    const { runAnalysisPipeline } = await import('@/scripts/tli/batch/pipeline-steps')
    const result = await runAnalysisPipeline([], '2025-07-15')

    expect(result.criticalFailures).toBeGreaterThan(0)
    // Comparison and prediction stages should NOT have been called
    expect(calculateThemeComparisons).not.toHaveBeenCalled()
    expect(snapshotPredictions).not.toHaveBeenCalled()
    expect(evaluatePredictions).not.toHaveBeenCalled()
  })

  it('does NOT call prediction/evaluation stages after comparison failure', async () => {
    calculateAndSaveScores.mockResolvedValue(undefined)
    runDailyLabelPhase.mockResolvedValue({
      gtAPending: { pendingCount: 0 },
      gtAFinalized: [],
      gtBFinalized: [],
      nonTradingPendingClosed: 0,
      finalizeCutoffDate: '2025-07-10',
      warningFailures: 0,
    })
    runGtAV2FoundationPhase.mockResolvedValue({ pendingCreated: 0, finalized: 0, keptPending: 0, failures: 0 })
    countExpiredPendingLabels.mockResolvedValue(0)
    materializePhase0Artifacts.mockResolvedValue({ episodeCount: 5, querySnapshotCount: 3, analogCandidateCount: 10 })
    computeOptimalThreshold.mockResolvedValue(null)
    calculateThemeComparisons.mockRejectedValue(new Error('Comparison failed'))

    const { runAnalysisPipeline } = await import('@/scripts/tli/batch/pipeline-steps')
    const result = await runAnalysisPipeline([], '2025-07-15')

    expect(result.criticalFailures).toBeGreaterThan(0)
    expect(snapshotPredictions).not.toHaveBeenCalled()
    expect(snapshotThemePredictionsV3).not.toHaveBeenCalled()
    expect(collectBablPhaseSnapshot).not.toHaveBeenCalled()
    expect(evaluatePredictions).not.toHaveBeenCalled()
    expect(evaluateComparisonOutcomes).not.toHaveBeenCalled()
  })

  it('does NOT call evaluation stages after prediction snapshot failure', async () => {
    calculateAndSaveScores.mockResolvedValue(undefined)
    runDailyLabelPhase.mockResolvedValue({
      gtAPending: { pendingCount: 0 },
      gtAFinalized: [],
      gtBFinalized: [],
      nonTradingPendingClosed: 0,
      finalizeCutoffDate: '2025-07-10',
      warningFailures: 0,
    })
    runGtAV2FoundationPhase.mockResolvedValue({ pendingCreated: 0, finalized: 0, keptPending: 0, failures: 0 })
    countExpiredPendingLabels.mockResolvedValue(0)
    materializePhase0Artifacts.mockResolvedValue({ episodeCount: 5, querySnapshotCount: 3, analogCandidateCount: 10 })
    computeOptimalThreshold.mockResolvedValue(null)
    calculateThemeComparisons.mockResolvedValue(undefined)
    snapshotPredictions.mockRejectedValue(new Error('Snapshot failed'))

    const { runAnalysisPipeline } = await import('@/scripts/tli/batch/pipeline-steps')
    const result = await runAnalysisPipeline([], '2025-07-15')

    expect(result.criticalFailures).toBeGreaterThan(0)
    // B-Abl and evaluation should NOT have been called
    expect(collectBablPhaseSnapshot).not.toHaveBeenCalled()
    expect(evaluatePredictions).not.toHaveBeenCalled()
    expect(evaluateComparisonOutcomes).not.toHaveBeenCalled()
  })
})
