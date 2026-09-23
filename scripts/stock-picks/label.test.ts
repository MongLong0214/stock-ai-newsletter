import { describe, expect, it } from 'vitest'

import { buildPriceBook } from '@/scripts/stock-picks/data-handler'
import { labelPick } from '@/scripts/stock-picks/label'
import { TradingDayIndex } from '@/scripts/stock-picks/trading-days'
import type { StockDailyPriceRow } from '@/scripts/tli/prices/stock-daily-prices'

const SYMBOL = 'KOSPI:005930'
const DATES = [
  '2026-01-02',
  '2026-01-05',
  '2026-01-06',
  '2026-01-07',
  '2026-01-08',
  '2026-01-09',
  '2026-01-12',
  '2026-01-13',
  '2026-01-14',
] as const

const buildRows = (input: {
  readonly entryOpen?: number | null
  readonly highs?: readonly (number | null)[]
  readonly lows?: readonly (number | null)[]
  readonly close5d?: number
  readonly entryVolume?: number | null
} = {}): StockDailyPriceRow[] => DATES.map((tradeDate, index) => {
  const high = index >= 1 ? input.highs?.[index - 1] : undefined
  const low = index >= 1 ? input.lows?.[index - 1] : undefined
  return {
    symbol: SYMBOL,
    trade_date: tradeDate,
    open: index === 1 ? (input.entryOpen === undefined ? 100 : input.entryOpen) : 100,
    high: index >= 1 ? (high === undefined ? 105 : high) : 105,
    low: index >= 1 ? (low === undefined ? 95 : low) : 95,
    close: index === 5 ? (input.close5d ?? 105) : 100,
    volume: index === 1 ? (input.entryVolume ?? 1000) : 1000,
    source: 'kis',
  }
})

describe('labelPick', () => {
  it('counts a high exactly 10% above entry as touched using the integer tick boundary', () => {
    const tradingDays = new TradingDayIndex(DATES)
    const prices = buildPriceBook(buildRows({ highs: [101, 105, 110, 108, 109] }))

    const label = labelPick(SYMBOL, DATES[0], prices, tradingDays)
    expect(label).toMatchObject({
      entryDate: DATES[1],
      entry: 100,
      entryVolume: 1000,
      maxHigh: 110,
      touched: true,
      status: 'hit',
    })
    expect(label?.return5d).toBeCloseTo(0.05)
    expect(label?.maxDrawdown).toBeCloseTo(-0.05)
  })

  it('counts a 10% touch on the entry day even when later holding days stay below it', () => {
    const tradingDays = new TradingDayIndex(DATES)
    const prices = buildPriceBook(buildRows({ highs: [110, 109, 108, 107, 106] }))

    const label = labelPick(SYMBOL, DATES[0], prices, tradingDays)
    expect(label).toMatchObject({
      maxHigh: 110,
      touched: true,
    })
  })

  it('returns null before the full five-day post-entry window matures', () => {
    const tradingDays = new TradingDayIndex(DATES.slice(0, 5))
    const prices = buildPriceBook(buildRows())

    expect(labelPick(SYMBOL, DATES[0], prices, tradingDays)).toBeNull()
  })

  it('returns data_error when the next-trading-day open is missing', () => {
    const tradingDays = new TradingDayIndex(DATES)
    const prices = buildPriceBook(buildRows({ entryOpen: null }))

    expect(labelPick(SYMBOL, DATES[0], prices, tradingDays)).toMatchObject({
      entry: null,
      touched: false,
      status: 'data_error',
    })
  })

  it('returns data_error when any high in the five-day window is missing', () => {
    const tradingDays = new TradingDayIndex(DATES)
    const prices = buildPriceBook(buildRows({ highs: [105, 106, null, 108, 109] }))

    expect(labelPick(SYMBOL, DATES[0], prices, tradingDays)).toMatchObject({
      touched: false,
      status: 'data_error',
    })
  })

  it('labels a clear success and computes the close return and low-based drawdown', () => {
    const tradingDays = new TradingDayIndex(DATES)
    const prices = buildPriceBook(buildRows({
      highs: [102, 111, 108, 107, 106],
      lows: [99, 94, 96, 98, 97],
      close5d: 104,
    }))

    expect(labelPick(SYMBOL, DATES[0], prices, tradingDays)).toEqual({
      entryDate: DATES[1],
      entry: 100,
      entryVolume: 1000,
      maxHigh: 111,
      touched: true,
      status: 'hit',
      return5d: 0.040000000000000036,
      maxDrawdown: -0.06000000000000005,
      // D1~D4 종가 100(보합), D5만 104 — 상승 마감은 D5 하루뿐이다.
      upDayCount: 1,
    })
  })

  /**
   * "1주일 꾸준히 오를 종목"의 경로 조건. return5d만 보면 하루 급등 뒤 4일 흘러내린
   * 종목과 매일 조금씩 오른 종목이 구분되지 않는다.
   */
  describe('upDayCount', () => {
    const withCloses = (closes: readonly number[]): StockDailyPriceRow[] => DATES.map((tradeDate, index) => ({
      symbol: SYMBOL,
      trade_date: tradeDate,
      open: 100,
      high: 200,
      low: 50,
      close: index === 0 ? 100 : closes[index - 1]!,
      volume: 1000,
      source: 'kis',
    }))

    const count = (closes: readonly number[]): number | null => labelPick(
      SYMBOL, DATES[0], buildPriceBook(withCloses(closes)), new TradingDayIndex(DATES),
    )?.upDayCount ?? null

    it('D1은 진입가(D1 시가) 대비로 센다 — 독자의 매수가가 기준이다', () => {
      expect(count([101, 101, 101, 101, 101])).toBe(1)
    })

    it('매일 오르면 5', () => {
      expect(count([101, 102, 103, 104, 105])).toBe(5)
    })

    it('매일 내리면 0', () => {
      expect(count([99, 98, 97, 96, 95])).toBe(0)
    })

    it('하루 급등 뒤 흘러내리면 1 — 꾸준한 상승과 구분된다', () => {
      expect(count([130, 125, 120, 118, 115])).toBe(1)
    })

    it('같은 수익률이라도 경로가 고르면 더 높다', () => {
      expect(count([102, 104, 106, 108, 110])).toBe(5)
      expect(count([110, 105, 100, 105, 110])).toBe(3)
    })

    it('보합은 상승으로 세지 않는다', () => {
      expect(count([100, 100, 100, 100, 100])).toBe(0)
    })
  })

  it('labels a complete window below 10% as a failure', () => {
    const tradingDays = new TradingDayIndex(DATES)
    const prices = buildPriceBook(buildRows({ highs: [101, 109, 108, 107, 106] }))

    expect(labelPick(SYMBOL, DATES[0], prices, tradingDays)).toMatchObject({
      touched: false,
      status: 'miss',
    })
  })

  it('labels a valid zero-volume entry session as unexpected_untradeable', () => {
    const tradingDays = new TradingDayIndex(DATES)
    const rows = buildRows({ entryVolume: 0 })
    rows[1] = { ...rows[1], open: 100, high: 105, low: 95, close: 101 }

    expect(labelPick(SYMBOL, DATES[0], buildPriceBook(rows), tradingDays)).toMatchObject({
      entryVolume: 0,
      touched: false,
      status: 'unexpected_untradeable',
    })
  })

  it('classifies a missing entry volume as a data error', () => {
    const tradingDays = new TradingDayIndex(DATES)
    const rows = buildRows()
    rows[1] = { ...rows[1], volume: null }

    expect(labelPick(SYMBOL, DATES[0], buildPriceBook(rows), tradingDays)).toMatchObject({
      entryVolume: null,
      touched: false,
      status: 'data_error',
    })
  })

  it('classifies a flat zero-volume entry followed by normal rows as a phantom data error', () => {
    const tradingDays = new TradingDayIndex(DATES)
    const rows = buildRows({ entryVolume: 0 })
    rows[1] = { ...rows[1], open: 100, high: 100, low: 100, close: 100 }

    expect(labelPick(SYMBOL, DATES[0], buildPriceBook(rows), tradingDays)).toMatchObject({
      entryVolume: 0,
      touched: false,
      status: 'data_error',
    })
  })

  it('classifies OHLC invariant violations anywhere in the window as data_error', () => {
    const tradingDays = new TradingDayIndex(DATES)
    const rows = buildRows()
    rows[3] = { ...rows[3], open: 110, high: 105, low: 95 }

    expect(labelPick(SYMBOL, DATES[0], buildPriceBook(rows), tradingDays)).toMatchObject({
      touched: false,
      status: 'data_error',
    })
  })

  it('counts D6 through D8 touches only in the informational eight-holding-day horizon', () => {
    const tradingDays = new TradingDayIndex(DATES)
    const prices = buildPriceBook(buildRows({
      highs: [101, 102, 103, 104, 105, 110, 109, 108],
    }))

    expect(labelPick(SYMBOL, DATES[0], prices, tradingDays)?.touched).toBe(false)
    expect(labelPick(SYMBOL, DATES[0], prices, tradingDays, 8)).toMatchObject({
      maxHigh: 110,
      touched: true,
    })
    expect(labelPick(
      SYMBOL,
      DATES[0],
      prices,
      new TradingDayIndex(DATES.slice(0, -1)),
      8,
    )).toBeNull()
  })
})
