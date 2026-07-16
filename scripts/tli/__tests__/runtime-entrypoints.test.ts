import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const loadActiveThemes = vi.fn()
const discoverAndManageThemes = vi.fn()
const autoActivate = vi.fn()
const autoDeactivate = vi.fn()
const getKSTDate = vi.fn()
const getKSTDateString = vi.fn()
const shouldCollectTliStocks = vi.fn()
const collectDailyStockPricesForDate = vi.fn()
const collectDataSources = vi.fn()
const runInterestObservationGapWatchdog = vi.fn()
const runCalibrationPhase = vi.fn()
const runAnalysisPipeline = vi.fn()
const shouldAbortAnalysisPipeline = vi.fn()
const submitIndexNowStep = vi.fn()
const calculateThemeComparisons = vi.fn()
const computeOptimalThreshold = vi.fn()
const materializePhase0Artifacts = vi.fn()

const failOnProcessExit = (code?: string | number | null): never => {
  throw new Error(`process.exit should not be called in runtime entrypoint tests: ${String(code)}`)
}

vi.mock('@/scripts/tli/shared/data-ops', () => ({
  loadActiveThemes,
}))

vi.mock('@/scripts/tli/themes/discover-themes', () => ({
  discoverAndManageThemes,
}))

vi.mock('@/scripts/tli/themes/theme-lifecycle', () => ({
  autoActivate,
  autoDeactivate,
}))

vi.mock('@/lib/tli/date-utils', () => ({
  getKSTDate,
  getKSTDateString,
}))

vi.mock('@/lib/tli/trading-calendar', () => ({
  shouldCollectTliStocks,
}))

vi.mock('@/scripts/tli/prices/kis-daily-price-collector', () => ({
  collectDailyStockPricesForDate,
}))

vi.mock('@/scripts/tli/batch/pipeline-steps', () => ({
  collectDataSources,
  runInterestObservationGapWatchdog,
  runCalibrationPhase,
  runAnalysisPipeline,
  shouldAbortAnalysisPipeline,
  submitIndexNowStep,
}))

vi.mock('@/scripts/tli/comparison/calculate-comparisons', () => ({
  calculateThemeComparisons,
}))

vi.mock('@/scripts/tli/comparison/auto-tune', () => ({
  computeOptimalThreshold,
}))

vi.mock('@/scripts/tli/comparison/materialize-phase0-artifacts', () => ({
  materializePhase0Artifacts,
}))

describe('runtime entrypoints', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()

    process.env.TLI_MODE = 'full'
    delete process.env.TLI_RESULT_PATH

    loadActiveThemes.mockResolvedValue([{ id: 'theme-1' }, { id: 'theme-2' }])
    discoverAndManageThemes.mockResolvedValue(undefined)
    autoActivate.mockResolvedValue(undefined)
    autoDeactivate.mockResolvedValue(undefined)
    getKSTDate.mockReturnValue(new Date('2026-03-20T00:00:00.000Z'))
    getKSTDateString.mockReturnValue('2026-03-20')
    shouldCollectTliStocks.mockReturnValue(true)
    collectDailyStockPricesForDate.mockResolvedValue({
      failureCount: 0,
    })
    collectDataSources.mockResolvedValue({
      criticalFailures: 0,
      datalabFailed: false,
    })
    runInterestObservationGapWatchdog.mockResolvedValue(0)
    runCalibrationPhase.mockResolvedValue(undefined)
    runAnalysisPipeline.mockResolvedValue({
      criticalFailures: 0,
      warningFailures: 0,
    })
    shouldAbortAnalysisPipeline.mockReturnValue(false)
    submitIndexNowStep.mockResolvedValue(undefined)
    calculateThemeComparisons.mockResolvedValue(undefined)
    computeOptimalThreshold.mockResolvedValue({
      threshold: 0.67,
      confidence: 'high',
      sampleSize: 42,
    })
    materializePhase0Artifacts.mockResolvedValue({
      stateHistoryBackfillCount: 0,
      episodeCount: 0,
      querySnapshotCount: 0,
      labelCount: 0,
      analogCandidateCount: 0,
      analogEvidenceCount: 0,
    })
  })

  it('does not terminate the process when the main pipeline is imported and invoked', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(failOnProcessExit)
    const { runTliMainPipeline } = await import('@/scripts/tli/batch/collect-and-score')

    const result = await runTliMainPipeline()

    expect(result).toMatchObject({
      mode: 'full',
      themeCount: 2,
      criticalFailures: 0,
      warningFailures: 0,
      exitCode: 0,
    })
    expect(collectDailyStockPricesForDate).toHaveBeenCalledWith('2026-03-20')
    expect(exitSpy).not.toHaveBeenCalled()
  })

  it('returns exitCode 1 when collection reports a critical failure', async () => {
    collectDataSources.mockResolvedValue({
      criticalFailures: 1,
      datalabFailed: false,
    })
    shouldAbortAnalysisPipeline.mockReturnValue(true)
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(failOnProcessExit)
    const { runTliMainPipeline } = await import('@/scripts/tli/batch/collect-and-score')

    const result = await runTliMainPipeline()

    expect(result).toMatchObject({
      criticalFailures: 1,
      exitCode: 1,
    })
    expect(collectDailyStockPricesForDate).not.toHaveBeenCalled()
    expect(runAnalysisPipeline).not.toHaveBeenCalled()
    expect(exitSpy).not.toHaveBeenCalled()
  })

  it('returns exitCode 1 when analysis reports a critical snapshot failure', async () => {
    runAnalysisPipeline.mockResolvedValue({
      criticalFailures: 1,
      warningFailures: 0,
    })
    const { runTliMainPipeline } = await import('@/scripts/tli/batch/collect-and-score')

    const result = await runTliMainPipeline()

    expect(result).toMatchObject({
      criticalFailures: 1,
      warningFailures: 0,
      exitCode: 1,
    })
  })

  it('counts daily stock price ingest failures as warnings', async () => {
    collectDailyStockPricesForDate.mockResolvedValue({
      failureCount: 2,
    })
    const { runTliMainPipeline } = await import('@/scripts/tli/batch/collect-and-score')

    const result = await runTliMainPipeline()

    expect(result).toMatchObject({
      criticalFailures: 0,
      warningFailures: 1,
      exitCode: 0,
    })
  })

  it('adds the interest observation watchdog warning on a news-only run', async () => {
    // Given: news succeeds, but the trading-day interest watchdog reports a missing vintage.
    process.env.TLI_MODE = 'news-only'
    shouldCollectTliStocks.mockReturnValue(false)
    runInterestObservationGapWatchdog.mockResolvedValue(1)

    // When: the news-only pipeline completes.
    const { runTliMainPipeline } = await import('@/scripts/tli/batch/collect-and-score')
    const result = await runTliMainPipeline()

    // Then: the warning is surfaced without changing critical status or exit code.
    expect(runInterestObservationGapWatchdog).toHaveBeenCalledWith('2026-03-20')
    expect(result).toMatchObject({
      mode: 'news-only',
      criticalFailures: 0,
      warningFailures: 1,
      exitCode: 0,
    })
  })

  it('does not terminate the process when the comparison pipeline is imported and invoked', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(failOnProcessExit)
    const { runTliComparisonPipeline } = await import('@/scripts/tli/batch/run-comparisons')

    const result = await runTliComparisonPipeline()

    expect(result).toMatchObject({
      themeCount: 2,
      threshold: 0.67,
      confidence: 'high',
      sampleSize: 42,
      exitCode: 0,
    })
    expect(calculateThemeComparisons).toHaveBeenCalledWith(
      [{ id: 'theme-1' }, { id: 'theme-2' }],
      0.67,
    )
    expect(exitSpy).not.toHaveBeenCalled()
  })

  it('writes structured pipeline result when TLI_RESULT_PATH is set', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'tli-result-'))
    const resultPath = join(tempDir, 'result.json')
    process.env.TLI_RESULT_PATH = resultPath

    try {
      const { writeTliMainPipelineResult } = await import('@/scripts/tli/batch/collect-and-score')

      await writeTliMainPipelineResult({
        mode: 'full',
        themeCount: 2,
        criticalFailures: 0,
        warningFailures: 2,
        durationSeconds: 1.25,
        exitCode: 0,
      })

      const result = JSON.parse(await readFile(resultPath, 'utf8')) as {
        mode: string
        criticalFailures: number
        warningFailures: number
        exitCode: number
      }
      expect(result).toMatchObject({
        mode: 'full',
        criticalFailures: 0,
        warningFailures: 2,
        exitCode: 0,
      })
    } finally {
      delete process.env.TLI_RESULT_PATH
      await rm(tempDir, { recursive: true, force: true })
    }
  })
})
