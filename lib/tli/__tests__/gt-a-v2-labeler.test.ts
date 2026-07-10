import { describe, expect, it } from 'vitest'
import { canonicalJsonV1 } from '@/lib/tli/canonical-json'
import {
  GTA_V2_WINSOR_MAX,
  GTA_V2_WINSOR_MIN,
  labelGtAV2,
  type GtAV2LabelResult,
} from '@/lib/tli/labels/gt-a-v2'

const five = (value: number): number[] => [value, value, value, value, value]

const target = (result: GtAV2LabelResult): string =>
  result.kind === 'eligible'
    ? canonicalJsonV1({
        eligible: true,
        ratio: result.ratio,
        growth: result.growth,
        g_log_ratio: result.gLogRatio,
        y: result.yBinary,
      })
    : canonicalJsonV1({ eligible: false, reason: 'zero_denominator' })

describe('labelGtAV2 — estimand contract', () => {
  it('finalizes a positive label at exactly ratio 1.10 (growth 0.10)', () => {
    const result = labelGtAV2({ pastValues: five(10), futureValues: five(11) })
    expect(result.kind).toBe('eligible')
    if (result.kind !== 'eligible') return
    expect(result.ratio).toBeCloseTo(1.1, 12)
    expect(result.growth).toBeCloseTo(0.1, 12)
    expect(result.yBinary).toBe(true)
  })

  it('finalizes a negative label just below the ratio threshold (1.099998)', () => {
    const result = labelGtAV2({ pastValues: five(10), futureValues: five(10.99998) })
    expect(result.kind).toBe('eligible')
    if (result.kind !== 'eligible') return
    expect(result.ratio).toBeLessThan(1.1)
    expect(result.yBinary).toBe(false)
  })

  it('uses the ratio>=1.10 threshold, not the log-value 0.10 threshold', () => {
    // ratio 1.103 → ln(1.103)=0.0980 < 0.10, yet y must be true because ratio >= 1.10.
    const result = labelGtAV2({ pastValues: five(200), futureValues: five(220.6) })
    expect(result.kind).toBe('eligible')
    if (result.kind !== 'eligible') return
    expect(result.ratio).toBeCloseTo(1.103, 12)
    expect(result.gLogRatio).toBeLessThan(0.1)
    expect(result.yBinary).toBe(true)
  })

  it('fixes g_log_ratio to -1.5 when the future mean is zero', () => {
    const result = labelGtAV2({ pastValues: five(8), futureValues: five(0) })
    expect(result.kind).toBe('eligible')
    if (result.kind !== 'eligible') return
    expect(result.gLogRatio).toBe(GTA_V2_WINSOR_MIN)
    expect(result.ratio).toBe(0)
    expect(result.yBinary).toBe(false)
  })

  it('winsorizes the log-ratio at the upper boundary', () => {
    const result = labelGtAV2({ pastValues: five(1), futureValues: five(1000) })
    expect(result.kind).toBe('eligible')
    if (result.kind !== 'eligible') return
    expect(result.gLogRatio).toBe(GTA_V2_WINSOR_MAX)
  })
})

describe('labelGtAV2 — denominator contract is exactly past_mean > 0', () => {
  it('excludes only when the past mean is exactly zero', () => {
    const result = labelGtAV2({ pastValues: five(0), futureValues: five(50) })
    expect(result.kind).toBe('zero_denominator')
    expect(result.denominator).toBe(0)
  })

  it('keeps a small positive denominator (3.999) eligible — no absolute floor', () => {
    const result = labelGtAV2({ pastValues: five(3.999), futureValues: five(4.5) })
    expect(result.kind).toBe('eligible')
    if (result.kind !== 'eligible') return
    expect(result.denominator).toBeCloseTo(3.999, 12)
  })

  it('keeps a tiny positive denominator (0.001) eligible — floor cannot be reintroduced', () => {
    const result = labelGtAV2({ pastValues: five(0.001), futureValues: five(0.002) })
    expect(result.kind).toBe('eligible')
  })

  it('never branches eligibility on the future-window maximum', () => {
    // Same past (eligible) with wildly different future maxima → both eligible.
    const modest = labelGtAV2({ pastValues: five(5), futureValues: five(5) })
    const spiked = labelGtAV2({ pastValues: five(5), futureValues: [1, 1, 1, 1, 9999] })
    expect(modest.kind).toBe('eligible')
    expect(spiked.kind).toBe('eligible')
    // Zero past with a huge future max is still ineligible — eligibility depends only on past.
    const zeroPastSpike = labelGtAV2({ pastValues: five(0), futureValues: [0, 0, 0, 0, 9999] })
    expect(zeroPastSpike.kind).toBe('zero_denominator')
  })
})

describe('labelGtAV2 — scale invariance (golden)', () => {
  const past = [3, 4, 2, 5, 4]
  const future = [6, 5, 7, 4, 6]
  const baseline = labelGtAV2({ pastValues: past, futureValues: future })

  for (const c of [0.01, 100]) {
    it(`is bit-identical in eligibility/ratio/growth/g_log_ratio/y and target bytes for c=${c}`, () => {
      const scaled = labelGtAV2({
        pastValues: past.map((value) => value * c),
        futureValues: future.map((value) => value * c),
      })
      expect(baseline.kind).toBe('eligible')
      expect(scaled.kind).toBe('eligible')
      if (baseline.kind !== 'eligible' || scaled.kind !== 'eligible') return
      expect(scaled.ratio).toBe(baseline.ratio)
      expect(scaled.growth).toBe(baseline.growth)
      expect(scaled.gLogRatio).toBe(baseline.gLogRatio)
      expect(scaled.yBinary).toBe(baseline.yBinary)
      expect(target(scaled)).toBe(target(baseline))
    })
  }

  it('keeps y invariant across scaling at the ratio boundary', () => {
    const boundaryPast = five(10)
    const boundaryFuture = five(11)
    for (const c of [0.01, 100]) {
      const scaled = labelGtAV2({
        pastValues: boundaryPast.map((value) => value * c),
        futureValues: boundaryFuture.map((value) => value * c),
      })
      if (scaled.kind !== 'eligible') throw new Error('expected eligible')
      expect(scaled.yBinary).toBe(true)
    }
  })
})

describe('labelGtAV2 — input guards', () => {
  it('requires exactly five past and five future values', () => {
    expect(() => labelGtAV2({ pastValues: [1, 2, 3, 4], futureValues: five(1) })).toThrow(/past window/)
    expect(() => labelGtAV2({ pastValues: five(1), futureValues: [1, 2, 3] })).toThrow(/future window/)
  })

  it('rejects non-finite and negative response values', () => {
    expect(() => labelGtAV2({ pastValues: [1, 1, 1, 1, Number.NaN], futureValues: five(1) })).toThrow(/finite/)
    expect(() => labelGtAV2({ pastValues: [1, 1, 1, 1, -1], futureValues: five(1) })).toThrow(/nonnegative/)
  })
})
