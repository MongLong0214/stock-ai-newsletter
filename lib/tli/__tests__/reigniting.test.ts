import { describe, it, expect } from 'vitest'
import { checkReigniting } from '@/lib/tli/reigniting'
import type { InterestMetric } from '@/lib/tli/types'

function makeMetric(day: number, normalized: number): InterestMetric {
  const date = new Date(2026, 0, day + 1)
  return {
    id: `m-${day}`,
    theme_id: 't-1',
    time: date.toISOString().slice(0, 10),
    source: 'naver',
    raw_value: normalized * 100,
    normalized,
  }
}

describe('checkReigniting', () => {
  it('returns false if stage is not Decay', () => {
    const metrics = Array.from({ length: 14 }, (_, i) => makeMetric(i, 50))
    expect(checkReigniting('Early', metrics)).toBe(false)
    expect(checkReigniting('Peak', metrics)).toBe(false)
    expect(checkReigniting('Growth', metrics)).toBe(false)
    expect(checkReigniting('Dormant', metrics)).toBe(false)
  })

  it('returns false if fewer than 7 metrics', () => {
    const metrics = Array.from({ length: 5 }, (_, i) => makeMetric(i, 50))
    expect(checkReigniting('Decay', metrics)).toBe(false)
  })

  it('returns true when recent half shows >= 30% growth over older half', () => {
    // older half: normalized = 10, recent half: normalized = 20 → growth = 100%
    const metrics = [
      ...Array.from({ length: 7 }, (_, i) => makeMetric(i, 10)),
      ...Array.from({ length: 7 }, (_, i) => makeMetric(i + 7, 20)),
    ]
    expect(checkReigniting('Decay', metrics)).toBe(true)
  })

  it('returns false when growth is below 30%', () => {
    // older half: 10, recent half: 12 → growth = 20%
    const metrics = [
      ...Array.from({ length: 7 }, (_, i) => makeMetric(i, 10)),
      ...Array.from({ length: 7 }, (_, i) => makeMetric(i + 7, 12)),
    ]
    expect(checkReigniting('Decay', metrics)).toBe(false)
  })

  it('returns false when older average is 0', () => {
    const metrics = [
      ...Array.from({ length: 7 }, (_, i) => makeMetric(i, 0)),
      ...Array.from({ length: 7 }, (_, i) => makeMetric(i + 7, 50)),
    ]
    expect(checkReigniting('Decay', metrics)).toBe(false)
  })

  it('sorts by time before splitting halves', () => {
    // Pass unsorted: recent values first, old values second
    // After sorting, old (low) comes first, recent (high) comes second → should reignite
    const metrics = [
      ...Array.from({ length: 7 }, (_, i) => makeMetric(i + 7, 20)), // recent but listed first
      ...Array.from({ length: 7 }, (_, i) => makeMetric(i, 10)),     // older but listed second
    ]
    expect(checkReigniting('Decay', metrics)).toBe(true)
  })
})
