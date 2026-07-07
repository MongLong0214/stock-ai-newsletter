import { describe, expect, it } from 'vitest'
import { GTA_DELTA, GTA_LABELER_VERSION, labelGtA } from '@/lib/tli/labels/gt-a'

const baseInput = {
  pastRaw: [10, 10, 10, 10, 10],
  futureRaw: [12, 12, 12, 12, 12],
  keywordEpochAtBase: 1,
  keywordEpochAtFinalize: 1,
  windowMaxRenewalGapDays: null,
  deactivatedBeforeHorizon: false,
} as const

describe('labelGtA', () => {
  it('finalizes a positive label at or above the fixed delta', () => {
    const exactFuture = Math.exp(GTA_DELTA) * 10
    const result = labelGtA({
      ...baseInput,
      futureRaw: [exactFuture, exactFuture, exactFuture, exactFuture, exactFuture],
    })

    expect(result.status).toBe('final')
    expect(result.yBinary).toBe(true)
    expect(result.gLogRatio).toBeCloseTo(GTA_DELTA, 10)
    expect(result.labelerVersion).toBe(GTA_LABELER_VERSION)
  })

  it('finalizes a negative label below the fixed delta', () => {
    const result = labelGtA({
      ...baseInput,
      futureRaw: [10, 10, 10, 10, 10],
    })

    expect(result.status).toBe('final')
    expect(result.yBinary).toBe(false)
    expect(result.gLogRatio).toBeCloseTo(0, 10)
  })

  it('excludes labels with too few past or future business-day observations', () => {
    const result = labelGtA({
      ...baseInput,
      pastRaw: [10, 10, 10],
    })

    expect(result.status).toBe('excluded')
    expect(result.excludeReason).toBe('insufficient_days')
  })

  it('excludes labels below the denominator floor', () => {
    const result = labelGtA({
      ...baseInput,
      pastRaw: [3, 3, 3, 3, 3],
    })

    expect(result.status).toBe('excluded')
    expect(result.excludeReason).toBe('denominator_floor')
    expect(result.denominator).toBe(3)
    expect(result.lowSignal).toBe(true)
  })

  it('excludes windows that cross a keyword epoch break', () => {
    const result = labelGtA({
      ...baseInput,
      keywordEpochAtBase: 2,
      keywordEpochAtFinalize: 3,
    })

    expect(result.status).toBe('excluded')
    expect(result.excludeReason).toBe('keyword_epoch_break')
    expect(result.denominator).toBe(10)
  })

  it('censors labels when the theme deactivates before the horizon', () => {
    const result = labelGtA({
      ...baseInput,
      deactivatedBeforeHorizon: true,
    })

    expect(result.status).toBe('censored')
    expect(result.yBinary).toBeNull()
    expect(result.excludeReason).toBeNull()
  })

  it('flags low-signal but valid denominators separately from excluded labels', () => {
    const result = labelGtA({
      ...baseInput,
      pastRaw: [5, 5, 5, 5, 5],
      futureRaw: [6, 6, 6, 6, 6],
    })

    expect(result.status).toBe('final')
    expect(result.lowSignal).toBe(true)
    expect(result.denominator).toBe(5)
  })

  it('flags rescale-suspect labels within five business days of a window max renewal', () => {
    const result = labelGtA({
      ...baseInput,
      windowMaxRenewalGapDays: 5,
    })

    expect(result.status).toBe('final')
    expect(result.rescaleSuspect).toBe(true)
  })

  it('winsorizes the log-ratio at both boundaries', () => {
    const high = labelGtA({
      ...baseInput,
      futureRaw: [1000, 1000, 1000, 1000, 1000],
    })
    const low = labelGtA({
      ...baseInput,
      futureRaw: [0, 0, 0, 0, 0],
    })

    expect(high.gLogRatio).toBe(1.5)
    expect(low.gLogRatio).toBe(-1.5)
  })
})
