import { describe, expect, it } from 'vitest'
import {
  getLastFinalizedTradingDate,
  isKoreanTradingDate,
  shouldCollectTliStocks,
} from '@/lib/tli/trading-calendar'

describe('TLI trading calendar stock collection gate', () => {
  it('collects stocks on a normal Korean trading weekday', () => {
    expect(isKoreanTradingDate('2026-01-02')).toBe(true)
    expect(shouldCollectTliStocks({ mode: 'full', kstDate: '2026-01-02' })).toBe(true)
  })

  it('skips stocks on a weekday market holiday', () => {
    expect(isKoreanTradingDate('2026-01-01')).toBe(false)
    expect(shouldCollectTliStocks({ mode: 'full', kstDate: '2026-01-01' })).toBe(false)
  })

  it('skips stocks on weekends and news-only runs', () => {
    expect(isKoreanTradingDate('2026-01-03')).toBe(false)
    expect(shouldCollectTliStocks({ mode: 'full', kstDate: '2026-01-03' })).toBe(false)
    expect(shouldCollectTliStocks({ mode: 'news-only', kstDate: '2026-01-02' })).toBe(false)
  })
})

describe('getLastFinalizedTradingDate', () => {
  it('uses the previous trading day before the 15:40 KST finalization cutoff', () => {
    expect(getLastFinalizedTradingDate(new Date('2026-09-01T21:10:00.000Z'))).toBe('2026-09-01')
  })

  it('uses today after the 15:40 KST finalization cutoff', () => {
    expect(getLastFinalizedTradingDate(new Date('2026-09-02T07:30:00.000Z'))).toBe('2026-09-02')
  })

  it.each([
    ['Saturday', '2026-09-05T07:30:00.000Z'],
    ['Sunday', '2026-09-06T07:30:00.000Z'],
  ])('uses Friday on %s', (_label, now) => {
    expect(getLastFinalizedTradingDate(new Date(now))).toBe('2026-09-04')
  })

  it('uses the previous trading day on a market holiday', () => {
    expect(getLastFinalizedTradingDate(new Date('2026-01-01T07:30:00.000Z'))).toBe('2025-12-30')
  })

  it('uses Friday on Monday morning', () => {
    expect(getLastFinalizedTradingDate(new Date('2026-08-30T21:10:00.000Z'))).toBe('2026-08-28')
  })
})
