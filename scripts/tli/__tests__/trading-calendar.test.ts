import { describe, expect, it } from 'vitest'
import { isKoreanTradingDate, shouldCollectTliStocks } from '@/lib/tli/trading-calendar'

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
