import { describe, expect, it, vi } from 'vitest'
import {
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
  it('returns one warning when a trading day has zero immutable interest observations', async () => {
    // Given: the news-only follow-up sees no observation for an open Korean market date.
    const countInterestObservations = vi.fn(async () => 0)
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    try {
      // When: the watchdog checks the completed collection surface.
      const warningFailures = await runInterestObservationGapWatchdog(
        '2026-07-16',
        countInterestObservations,
      )

      // Then: the missing vintage is explicit but remains non-critical.
      expect(warningFailures).toBe(1)
      expect(countInterestObservations).toHaveBeenCalledWith('2026-07-16')
      expect(consoleWarn).toHaveBeenCalledWith(
        '⚠️ 거래일 interest observation 누락 감지',
        { tradingDate: '2026-07-16', observationCount: 0 },
      )
    } finally {
      consoleWarn.mockRestore()
    }
  })

  it('skips the observation query when the Korean market is closed', async () => {
    // Given: Saturday cannot have a valid immutable interest observation.
    const countInterestObservations = vi.fn(async () => 0)

    // When: the watchdog receives the closed-market date.
    const warningFailures = await runInterestObservationGapWatchdog(
      '2026-07-18',
      countInterestObservations,
    )

    // Then: absence is expected and no warning is emitted.
    expect(warningFailures).toBe(0)
    expect(countInterestObservations).not.toHaveBeenCalled()
  })

  it('downgrades an observation count failure to a warning', async () => {
    // Given: the watchdog query fails independently of the successful news collection.
    const countInterestObservations = vi.fn(async () => {
      throw new Error('count unavailable')
    })
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    try {
      // When: the watchdog cannot prove presence or absence.
      const warningFailures = await runInterestObservationGapWatchdog(
        '2026-07-16',
        countInterestObservations,
      )

      // Then: the safety-net failure is visible without becoming critical.
      expect(warningFailures).toBe(1)
      expect(consoleWarn).toHaveBeenCalledWith(
        '⚠️ interest observation 누락 점검 실패',
        { tradingDate: '2026-07-16', error: 'count unavailable' },
      )
    } finally {
      consoleWarn.mockRestore()
    }
  })
})
