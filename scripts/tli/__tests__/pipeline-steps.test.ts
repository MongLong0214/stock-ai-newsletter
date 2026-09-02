import { describe, expect, it, vi } from 'vitest'
import {
  INTEREST_OBSERVATION_MAX_LAG_TRADING_DAYS,
  isInterestObservationGap,
  runInterestObservationGapWatchdog,
  shouldAbortAnalysisPipeline,
} from '@/scripts/tli/batch/pipeline-steps'

describe('pipeline fail-closed policy', () => {
  it('aborts downstream analysis when any critical collection failure occurred', () => {
    expect(shouldAbortAnalysisPipeline({
      mode: 'full',
      datalabFailed: false,
      criticalFailures: 1,
    })).toBe(true)
  })

  it('aborts downstream analysis when datalab fails', () => {
    expect(shouldAbortAnalysisPipeline({
      mode: 'full',
      datalabFailed: true,
      criticalFailures: 0,
    })).toBe(true)
  })

  it('allows downstream analysis only when full mode collection is clean', () => {
    expect(shouldAbortAnalysisPipeline({
      mode: 'full',
      datalabFailed: false,
      criticalFailures: 0,
    })).toBe(false)
  })
})

describe('interest observation gap watchdog', () => {
  it.each<{
    label: string
    latestObserved: string | null
    expected: boolean
  }>([
    { label: 'today', latestObserved: '2026-07-16', expected: false },
    { label: 'T-1', latestObserved: '2026-07-15', expected: false },
    { label: 'T-2', latestObserved: '2026-07-14', expected: false },
    { label: 'T-3', latestObserved: '2026-07-13', expected: true },
    { label: 'null', latestObserved: null, expected: true },
  ])('classifies $label against the two-trading-day lag allowance', ({ latestObserved, expected }) => {
    expect(isInterestObservationGap({
      latestObserved,
      today: '2026-07-16',
      maxLagTradingDays: INTEREST_OBSERVATION_MAX_LAG_TRADING_DAYS,
    })).toBe(expected)
  })

  it('returns zero when the latest observation is within the allowed lag', async () => {
    // Given: DataLab has reached T-2, which is still valid at the morning watchdog cutoff.
    const readLatestObservedTradingDate = vi.fn(async () => '2026-07-14')

    // When: the watchdog checks the latest immutable observation date.
    const warningFailures = await runInterestObservationGapWatchdog(
      '2026-07-16',
      readLatestObservedTradingDate,
    )

    // Then: the permitted source lag does not create a rolling warning.
    expect(warningFailures).toBe(0)
    expect(readLatestObservedTradingDate).toHaveBeenCalledWith('2026-07-16')
  })

  it('returns one warning when the latest observation is beyond the allowed lag', async () => {
    // Given: the latest immutable observation has silently fallen three trading days behind.
    const readLatestObservedTradingDate = vi.fn(async () => '2026-07-13')
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    try {
      // When: the watchdog checks the latest immutable observation date.
      const warningFailures = await runInterestObservationGapWatchdog(
        '2026-07-16',
        readLatestObservedTradingDate,
      )

      // Then: the accumulated gap is explicit but remains non-critical.
      expect(warningFailures).toBe(1)
      expect(readLatestObservedTradingDate).toHaveBeenCalledWith('2026-07-16')
      expect(consoleWarn).toHaveBeenCalledWith(
        '⚠️ interest observation 최신 거래일 지연 감지',
        {
          latestObservedTradingDate: '2026-07-13',
          maxLagTradingDays: 2,
          today: '2026-07-16',
        },
      )
    } finally {
      consoleWarn.mockRestore()
    }
  })

  it('skips the observation query when the Korean market is closed', async () => {
    // Given: Saturday cannot have a valid immutable interest observation.
    const readLatestObservedTradingDate = vi.fn(async () => null)

    // When: the watchdog receives the closed-market date.
    const warningFailures = await runInterestObservationGapWatchdog(
      '2026-07-18',
      readLatestObservedTradingDate,
    )

    // Then: absence is expected and no warning is emitted.
    expect(warningFailures).toBe(0)
    expect(readLatestObservedTradingDate).not.toHaveBeenCalled()
  })

  it('downgrades an empty latest-date query failure to a diagnostic warning', async () => {
    // Given: the watchdog query fails independently of the successful news collection.
    const readLatestObservedTradingDate = vi.fn(async () => {
      throw new Error('')
    })
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    try {
      // When: the watchdog cannot prove presence or absence.
      const warningFailures = await runInterestObservationGapWatchdog(
        '2026-07-16',
        readLatestObservedTradingDate,
      )

      // Then: the safety-net failure is visible without becoming critical.
      expect(warningFailures).toBe(1)
      expect(consoleWarn).toHaveBeenCalledWith(
        '⚠️ interest observation 누락 점검 실패',
        {
          tradingDate: '2026-07-16',
          error: '(빈 응답 — statement timeout 가능성)',
        },
      )
    } finally {
      consoleWarn.mockRestore()
    }
  })
})
