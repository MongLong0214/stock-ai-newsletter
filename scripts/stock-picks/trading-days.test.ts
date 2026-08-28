import { describe, expect, it } from 'vitest'

import { TradingDayIndex } from '@/scripts/stock-picks/trading-days'

describe('TradingDayIndex', () => {
  it('sorts and indexes measured trading days with first/last boundaries', () => {
    const index = new TradingDayIndex([
      '2026-01-06',
      '2026-01-02',
      '2026-01-05',
      '2026-01-05',
    ])

    expect(index.tradingDays).toEqual(['2026-01-02', '2026-01-05', '2026-01-06'])
    expect(index.indexByDate.get('2026-01-05')).toBe(1)
    expect(index.nextTradingDay('2026-01-02', -1)).toBeNull()
    expect(index.nextTradingDay('2026-01-02', 1)).toBe('2026-01-05')
    expect(index.nextTradingDay('2026-01-06', 1)).toBeNull()
    expect(index.tradingDaysBetween('2026-01-02', '2026-01-06')).toEqual([
      '2026-01-02',
      '2026-01-05',
      '2026-01-06',
    ])
  })
})
