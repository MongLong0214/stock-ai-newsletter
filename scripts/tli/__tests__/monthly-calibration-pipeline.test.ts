import { beforeEach, describe, expect, it, vi } from 'vitest'

const loadCalibrationsFromDB = vi.fn()
const calibrateNoiseThreshold = vi.fn()
const calibrateConfidence = vi.fn()
const calibrateWeights = vi.fn()
const loadMonthlyCalibrationRunDates = vi.fn()
const recordMonthlyCalibrationRun = vi.fn()

vi.mock('@/scripts/tli/scoring/load-calibrations', () => ({
  loadCalibrationsFromDB,
}))

vi.mock('@/scripts/tli/scoring/calibrate-noise', () => ({
  calibrateNoiseThreshold,
}))

vi.mock('@/scripts/tli/scoring/calibrate-confidence', () => ({
  calibrateConfidence,
}))

vi.mock('@/scripts/tli/scoring/calibrate-weights', () => ({
  calibrateWeights,
}))

vi.mock('@/scripts/tli/scoring/monthly-calibration-state', () => ({
  loadMonthlyCalibrationRunDates,
  recordMonthlyCalibrationRun,
}))

describe('monthly calibration pipeline wiring', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    loadCalibrationsFromDB.mockResolvedValue(undefined)
    calibrateNoiseThreshold.mockResolvedValue(null)
    calibrateConfidence.mockResolvedValue(null)
    calibrateWeights.mockResolvedValue(null)
    loadMonthlyCalibrationRunDates.mockResolvedValue([])
    recordMonthlyCalibrationRun.mockResolvedValue(undefined)
  })

  it('runs monthly calibration on the first eligible run even after day one', async () => {
    const { runCalibrationPhase } = await import('@/scripts/tli/batch/pipeline-steps')

    await runCalibrationPhase(new Date('2026-08-03T00:00:00.000Z'))

    expect(calibrateNoiseThreshold).toHaveBeenCalledTimes(1)
    expect(calibrateConfidence).toHaveBeenCalledTimes(1)
    expect(calibrateWeights).toHaveBeenCalledTimes(1)
    expect(recordMonthlyCalibrationRun).toHaveBeenCalledWith('2026-08-03')
  })

  it('defers monthly calibration on a non-trading full run before a monthly marker exists', async () => {
    const { runCalibrationPhase } = await import('@/scripts/tli/batch/pipeline-steps')

    await runCalibrationPhase(new Date('2026-08-02T00:00:00.000Z'))

    expect(calibrateNoiseThreshold).not.toHaveBeenCalled()
    expect(calibrateConfidence).not.toHaveBeenCalled()
    expect(calibrateWeights).not.toHaveBeenCalled()
    expect(recordMonthlyCalibrationRun).not.toHaveBeenCalled()
  })

  it('skips later eligible runs after the month has a run marker', async () => {
    loadMonthlyCalibrationRunDates.mockResolvedValue(['2026-08-03'])
    const { runCalibrationPhase } = await import('@/scripts/tli/batch/pipeline-steps')

    await runCalibrationPhase(new Date('2026-08-04T00:00:00.000Z'))

    expect(calibrateNoiseThreshold).not.toHaveBeenCalled()
    expect(calibrateConfidence).not.toHaveBeenCalled()
    expect(calibrateWeights).not.toHaveBeenCalled()
    expect(recordMonthlyCalibrationRun).not.toHaveBeenCalled()
  })

  it('defers (does not execute) when the run-dates lookup fails, even on an eligible trading day', async () => {
    // Given: the monthly run-marker lookup fails on an otherwise-eligible trading day.
    loadMonthlyCalibrationRunDates.mockRejectedValue(new Error('db unavailable'))
    const { runCalibrationPhase } = await import('@/scripts/tli/batch/pipeline-steps')

    // When: the calibration phase runs.
    await runCalibrationPhase(new Date('2026-08-03T00:00:00.000Z'))

    // Then: it defers to the next run instead of falling back to a "calendar day 1" heuristic
    // that would disagree with planMonthlyCalibration's own eligibility policy.
    expect(calibrateNoiseThreshold).not.toHaveBeenCalled()
    expect(calibrateConfidence).not.toHaveBeenCalled()
    expect(calibrateWeights).not.toHaveBeenCalled()
    expect(recordMonthlyCalibrationRun).not.toHaveBeenCalled()
  })
})
