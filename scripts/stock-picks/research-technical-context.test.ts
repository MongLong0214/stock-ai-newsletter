import { describe, expect, it } from 'vitest'
import { runBacktest } from '@/scripts/stock-picks/backtest'
import { buildPriceBook, StockDataHandler } from '@/scripts/stock-picks/data-handler'
import { buildFeatureVector } from '@/scripts/stock-picks/features'
import { evaluateTechnicalContexts, passesTechnicalConfirmation, summarizeTechnicalReturns } from '@/scripts/stock-picks/research-technical-context'
import { buildTechnicalContextMap } from '@/scripts/stock-picks/technical-context'
import { TradingDayIndex } from '@/scripts/stock-picks/trading-days'
import { KOSPI_INDEX_SYMBOL, type StockDailyPriceRow } from '@/scripts/tli/prices/stock-daily-prices'

describe('technical context comparison', () => {
  it('keeps three unique picks when confirmation promotes a lower-ranked candidate', () => {
    const dates = Array.from({ length: 80 }, (_, i) => new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10))
    const symbols = ['A', 'B', 'C', 'D']
    const signalDate = dates.at(-6)!
    const tradingDays = new TradingDayIndex(dates)
    const prices = buildPriceBook(symbols.flatMap((symbol) => dates.map((date, i): StockDailyPriceRow => ({
      symbol, trade_date: date, open: 2_000 + i, high: 2_010 + i, low: 1_990 + i,
      close: 2_005 + i, volume: 1_000_000, source: 'kis',
    }))))
    const handler = new StockDataHandler(prices, tradingDays).at(signalDate)
    const computed = buildTechnicalContextMap({ handler, symbols, dates: dates.slice(0, -5) }).get(signalDate)!
    const contexts = new Map([[signalDate, new Map(symbols.map((symbol) => [symbol, {
      ...computed.get(symbol)!, relativeReturn20PercentagePoints: symbol === 'D' ? 1 : -1,
    }]))]])
    const features = new Map([[signalDate, symbols.map((symbol, i) => ({
      ...buildFeatureVector(handler, symbol), rsi14: 50, distanceFromHigh60: 1,
      gapFromPreviousClosePercent: 0, volumePercentile60: 99 - i,
    }))]])
    const results = evaluateTechnicalContexts({
      prices, tradingDays, dates: [signalDate], features, contexts, costBps: 30,
      masters: symbols.map((symbol) => ({ symbol, is_active: true, status_flags: {} })),
    })
    const picks = (name: string) => results.find((result) => result.name === name)!.backtest.daily[0]!.picks.map((pick) => pick.symbol)
    expect(picks('production')).toEqual(['A', 'B', 'C'])
    expect(picks('confirmedFirstFill3')).toEqual(['D', 'A', 'B'])
    expect(picks('confirmedBreakout')).toEqual(['D'])
    expect(picks('confirmedBreakoutMarket')).toEqual([])
  })

  it('requires independent confirmation and leaves missing market observations unevaluable', () => {
    const dates = Array.from({ length: 61 }, (_, i) => new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10))
    const prices = buildPriceBook(['A', KOSPI_INDEX_SYMBOL].flatMap((symbol) => dates.map((date, i): StockDailyPriceRow => ({
      symbol, trade_date: date, open: 100 + i, high: 104 + i, low: 99 + i, close: 103 + i,
      volume: 1000, source: 'kis',
    }))))
    const context = buildTechnicalContextMap({
      handler: new StockDataHandler(prices, new TradingDayIndex(dates)).at(dates.at(-1)!),
      symbols: ['A'], dates,
    }).get(dates.at(-1)!)!.get('A')!
    // 종목과 지수 수익률이 동일하면 상대강도 확인이 아니다.
    expect(passesTechnicalConfirmation(context, false)).toBe(false)
    const stronger = { ...context, relativeReturn20PercentagePoints: 1 }
    expect(passesTechnicalConfirmation(stronger, false)).toBe(true)
    expect(passesTechnicalConfirmation(stronger, true)).toBe(true)
    expect(passesTechnicalConfirmation({ ...stronger, benchmarkSma20DistancePercent: null }, true)).toBe(false)
    expect(passesTechnicalConfirmation({ ...stronger, breadthAboveSma20: 0.49 }, true)).toBe(false)
    expect(passesTechnicalConfirmation({ ...stronger, chaikinMoneyFlow21: -0.1 }, false)).toBe(false)
    expect(passesTechnicalConfirmation(undefined, false)).toBe(false)
  })

  it('reports target touch separately from loss and keeps abstention in the slot denominator', () => {
    const dates = ['2026-01-02', '2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09']
    const prices = buildPriceBook(dates.map((date): StockDailyPriceRow => ({
      symbol: 'A', trade_date: date, open: 100, high: 111, low: 90, close: 95, volume: 1000, source: 'kis',
    })))
    const report = runBacktest({
      strategyName: 'fixture', strategy: () => ['A'], universe: ['A'], prices,
      tradingDays: new TradingDayIndex(dates), startDate: dates[0], endDate: dates[0],
    })
    const result = summarizeTechnicalReturns(report, 30)
    expect(report.precisionAt3).toBe(1)
    expect(report.slotPrecisionAt3).toBe(1 / 3)
    expect(result.positiveRate).toBe(0)
    expect(result.meanNetReturn).toBeCloseTo(-0.053)
    expect(result.dailySlotNetReturns[0]).toBeCloseTo(-0.053 / 3)
    expect(result.allThreeHitRate).toBe(0)
  })
})
