import { beforeEach, describe, expect, it, vi } from 'vitest'

const loadActiveThemes = vi.fn()
const discoverAndManageThemes = vi.fn()
const autoActivate = vi.fn()
const autoDeactivate = vi.fn()
const getKSTDate = vi.fn()
const collectDataSources = vi.fn()
const runCalibrationPhase = vi.fn()
const runAnalysisPipeline = vi.fn()
const shouldAbortAnalysisPipeline = vi.fn()
const submitIndexNowStep = vi.fn()
const calculateThemeComparisons = vi.fn()
const computeOptimalThreshold = vi.fn()

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

vi.mock('@/scripts/tli/shared/utils', () => ({
  getKSTDate,
}))

vi.mock('@/scripts/tli/batch/pipeline-steps', () => ({
  collectDataSources,
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

describe('runtime entrypoints', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()

    process.env.TLI_MODE = 'full'

    loadActiveThemes.mockResolvedValue([{ id: 'theme-1' }, { id: 'theme-2' }])
    discoverAndManageThemes.mockResolvedValue(undefined)
    autoActivate.mockResolvedValue(undefined)
    autoDeactivate.mockResolvedValue(undefined)
    getKSTDate.mockReturnValue('2026-03-20')
    collectDataSources.mockResolvedValue({
      criticalFailures: 0,
      datalabFailed: false,
    })
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
  })

  it('does not terminate the process when the main pipeline is imported and invoked', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
    const { runTliMainPipeline } = await import('@/scripts/tli/batch/collect-and-score')

    const result = await runTliMainPipeline()

    expect(result).toMatchObject({
      mode: 'full',
      themeCount: 2,
      criticalFailures: 0,
      warningFailures: 0,
      exitCode: 0,
    })
    expect(exitSpy).not.toHaveBeenCalled()
  })

  it('does not terminate the process when the comparison pipeline is imported and invoked', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
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
})
