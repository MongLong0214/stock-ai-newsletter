import { describe, expect, it, vi } from 'vitest'

import {
  buildTradingDayIndex,
  findMissingTradingDays,
  TradingDayIndex,
} from '@/scripts/stock-picks/trading-days'

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

  it('finds the first trading day on or after an indexed or non-indexed date', () => {
    const index = new TradingDayIndex(['2026-01-02', '2026-01-05', '2026-01-06'])

    expect(index.firstTradingDayOnOrAfter('2026-01-05')).toBe('2026-01-05')
    expect(index.firstTradingDayOnOrAfter('2026-01-03')).toBe('2026-01-05')
    expect(index.firstTradingDayOnOrAfter('2026-01-07')).toBeNull()
  })

  it('unions KOSPI dates with positive-volume anchor dates', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    try {
      const index = buildTradingDayIndex(
        [{ trade_date: '2026-01-02' }, { trade_date: '2026-01-05' }],
        [
          { symbol: 'KOSPI:005930', trade_date: '2026-01-05', volume: 10 },
          { symbol: 'KOSPI:000660', trade_date: '2026-01-06', volume: 20 },
          { symbol: 'KOSPI:005930', trade_date: '2026-01-07', volume: 0 },
        ],
        '2026-01-07',
      )

      expect(index.tradingDays).toEqual(['2026-01-02', '2026-01-05', '2026-01-06'])
      expect(JSON.parse(String(logSpy.mock.calls[0]?.[0]))).toMatchObject({
        event: 'trading_day_index',
        kospiDates: 2,
        anchorOnlyDates: 1,
      })
    } finally {
      logSpy.mockRestore()
    }
  })

  it('keeps positive-volume anchor evidence even when the calendar says closed', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    try {
      const index = buildTradingDayIndex(
        [{ trade_date: '2026-01-01' }, { trade_date: '2026-01-03' }],
        [
          { symbol: 'KOSPI:005930', trade_date: '2026-01-01', volume: 10 },
          { symbol: 'KOSPI:005930', trade_date: '2026-01-02', volume: 10 },
        ],
        '2026-01-03',
      )

      expect(index.tradingDays).toEqual(['2026-01-01', '2026-01-02'])
      expect(JSON.parse(String(logSpy.mock.calls[0]?.[0]))).toMatchObject({
        droppedNonTradingDates: 1,
        calendarConflicts: ['2026-01-01'],
      })
    } finally {
      logSpy.mockRestore()
    }
  })

  it('drops dates after the last finalized trading session', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    try {
      const index = buildTradingDayIndex(
        [{ trade_date: '2026-09-01' }, { trade_date: '2026-09-02' }],
        [{ symbol: 'KOSPI:005930', trade_date: '2026-09-02', volume: 10 }],
        '2026-09-01',
      )

      expect(index.tradingDays).toEqual(['2026-09-01'])
      expect(JSON.parse(String(logSpy.mock.calls[0]?.[0]))).toMatchObject({
        droppedUnfinalizedDates: 1,
      })
    } finally {
      logSpy.mockRestore()
    }
  })

  it('finds calendar trading days missing from the measured index', () => {
    const index = new TradingDayIndex(['2026-01-02', '2026-01-06'])

    expect(findMissingTradingDays(index, '2026-01-02', '2026-01-07')).toEqual([
      '2026-01-05',
      '2026-01-07',
    ])
  })
})
