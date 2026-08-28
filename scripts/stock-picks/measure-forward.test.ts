import { describe, expect, it } from 'vitest'

import { buildPriceBook } from '@/scripts/stock-picks/data-handler'
import type { StockFeatureVector } from '@/scripts/stock-picks/features'
import {
  measureForwardPicks,
  measureShadowForwardComparison,
  renderShadowForwardComparisonSection,
  SHADOW_FORWARD_START_DATE,
  type PublishedNewsletterRow,
  type ShadowForwardComparison,
} from '@/scripts/stock-picks/measure-forward'
import type { StockMasterState } from '@/scripts/stock-picks/strategies'
import { TradingDayIndex } from '@/scripts/stock-picks/trading-days'
import type { StockDailyPriceRow } from '@/scripts/tli/prices/stock-daily-prices'

const DATES = [
  '2026-01-02',
  '2026-01-05',
  '2026-01-06',
  '2026-01-07',
  '2026-01-08',
  '2026-01-09',
] as const

const buildRows = (input: {
  readonly symbol: string
  readonly maxHigh: number
  readonly entryOpen?: number | null
  readonly missingHighDate?: string
}): StockDailyPriceRow[] => DATES.map((tradeDate, index) => ({
  symbol: input.symbol,
  trade_date: tradeDate,
  open: index === 1 ? (input.entryOpen === undefined ? 100 : input.entryOpen) : 100,
  high: tradeDate === input.missingHighDate ? null : index >= 1 ? input.maxHigh : 100,
  low: 90,
  close: 100,
  volume: 1000,
  source: 'kis',
}))

const newsletter = (
  date: string,
  source: string | null,
  tickers: readonly string[],
): PublishedNewsletterRow => ({
  newsletter_date: date,
  picks_source: source,
  gemini_analysis: JSON.stringify(tickers.map((ticker) => ({ ticker }))),
})

const shadowFeature = (symbol: string, simDate: string, atrPercentile60: number): StockFeatureVector => ({
  symbol,
  simDate,
  open: 1_900,
  high: 2_050,
  low: 1_850,
  close: 2_000,
  volume: 1_000_000,
  averageTurnover20: 2_000_000_000,
  rsi14: 45,
  macdHistogram: 1,
  sma20: 1_990,
  sma60: 1_800,
  ema20: 1_990,
  sma20Slope5: 0.01,
  sma20DistancePercent: 0.5,
  atrPercent14: 3,
  atrPercentile60,
  adx14: 25,
  adx14Previous: 24,
  adx14Change: 1,
  obvSlope20: 100,
  volumeRatio20: 1.2,
  volumePercentile60: 95,
  position52w: 0.8,
  position52wObservations: 100,
  position52wFullWindow: false,
  consecutiveUpDays: 1,
  trendR2_20: 0.6,
  trendSlope20: 0.01,
  trendR2_20Previous: 0.55,
  trendR2_20Change: 0.05,
  trendR2_60: 0.8,
  trendSlope60: 0.01,
  distanceFromHigh60: 0,
  gapFromPreviousClosePercent: 0,
  goldenCrossAge: 3,
  bullishCandle: true,
})

const stockMaster = (symbol: string): StockMasterState => ({
  symbol,
  is_active: true,
  status_flags: {},
})

describe('measureForwardPicks', () => {
  it('measures only mature published picks and splits source and null results', () => {
    const hit = 'KOSPI:000001'
    const miss = 'KOSPI:000002'
    const missingEntry = 'KOSPI:000003'
    const immature = 'KOSPI:000004'
    const missingWindow = 'KOSPI:000005'
    const newsletters: PublishedNewsletterRow[] = [
      newsletter('2026-01-05', 'code', [hit]),
      newsletter('2026-01-05', 'llm_fallback', [miss]),
      newsletter('2026-01-05', null, [missingEntry]),
      newsletter('2026-01-09', 'code', [immature]),
      newsletter('2026-01-05', 'code', [missingWindow]),
      {
        newsletter_date: '2026-01-06',
        picks_source: 'crash',
        gemini_analysis: '{"type":"crash_alert"}',
      },
      {
        newsletter_date: '2026-01-07',
        picks_source: 'code',
        gemini_analysis: 'not json',
      },
    ]
    const prices = buildPriceBook([
      ...buildRows({ symbol: hit, maxHigh: 110 }),
      ...buildRows({ symbol: miss, maxHigh: 109 }),
      ...buildRows({ symbol: missingEntry, maxHigh: 110, entryOpen: null }),
      ...buildRows({ symbol: immature, maxHigh: 110 }),
      ...buildRows({ symbol: missingWindow, maxHigh: 110, missingHighDate: '2026-01-07' }),
    ])

    const report = measureForwardPicks({
      newsletters,
      prices,
      tradingDays: new TradingDayIndex(DATES),
      asOfDate: '2026-01-10',
      lookbackDays: 60,
    })

    expect(report.publishedNewsletterCount).toBe(7)
    expect(report.invalidNewsletterCount).toBe(1)
    expect(report.crashNewsletterCount).toBe(1)
    expect(report.loadedPickCount).toBe(5)
    expect(report.immaturePickCount).toBe(1)
    expect(report.overall).toEqual({
      totalPicks: 4,
      labeledPicks: 2,
      nullPicks: 2,
      touchedPicks: 1,
      hitRate: 0.5,
      nullRate: 0.5,
    })
    expect(report.byPicksSource.code.totalPicks).toBe(2)
    expect(report.byPicksSource.llm_fallback.hitRate).toBe(0)
    expect(report.byPicksSource.crash.totalPicks).toBe(0)
    expect(report.byPicksSource.null.nullPicks).toBe(1)
    expect(report.nullBreakdown).toEqual({
      missingEntryOpen: 1,
      missingWindowData: 1,
    })
    expect(report.recent4Weeks).toHaveLength(4)
    expect(report.informational8HoldingDays.labeledPicks).toBe(0)
  })

  it('reports a D6 touch only in the informational eight-holding-day metric', () => {
    const dates = Array.from({ length: 9 }, (_value, index) => `2026-02-${String(index + 2).padStart(2, '0')}`)
    const symbol = 'KOSPI:000010'
    const prices = buildPriceBook(dates.map((tradeDate, index): StockDailyPriceRow => ({
      symbol,
      trade_date: tradeDate,
      open: 100,
      high: index === 6 ? 110 : 105,
      low: 95,
      close: 100,
      volume: 1_000,
      source: 'kis',
    })))

    const report = measureForwardPicks({
      newsletters: [newsletter(dates[1], 'code', [symbol])],
      prices,
      tradingDays: new TradingDayIndex(dates),
      asOfDate: dates.at(-1)!,
    })

    expect(report.overall).toMatchObject({ labeledPicks: 1, touchedPicks: 0, hitRate: 0 })
    expect(report.informational8HoldingDays).toMatchObject({
      labeledPicks: 1,
      touchedPicks: 1,
      hitRate: 1,
    })
  })

  it('excludes signal dates before the preregistered shadow start date', () => {
    const dates = [
      '2026-08-28',
      SHADOW_FORWARD_START_DATE,
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
      '2026-09-04',
      '2026-09-07',
    ]
    const oldSymbols = ['KOSPI:100001', 'KOSPI:100002', 'KOSPI:100003']
    const newSymbols = ['KOSPI:200001', 'KOSPI:200002', 'KOSPI:200003']
    const symbols = [...oldSymbols, ...newSymbols]
    const prices = buildPriceBook(symbols.flatMap((symbol) => dates.map((tradeDate): StockDailyPriceRow => ({
      symbol,
      trade_date: tradeDate,
      open: 100,
      high: 110,
      low: 95,
      close: 100,
      volume: 1_000,
      source: 'kis',
    }))))
    const featuresByDate = new Map([
      [dates[0], oldSymbols.map((symbol, index) => shadowFeature(symbol, dates[0], 10 + index))],
      [dates[1], newSymbols.map((symbol, index) => shadowFeature(symbol, dates[1], 10 + index))],
    ])

    const comparison = measureShadowForwardComparison({
      prices,
      tradingDays: new TradingDayIndex(dates),
      featuresByDate,
      masters: symbols.map(stockMaster),
      asOfDate: dates.at(-1)!,
    })

    expect(comparison.startDate).toBe(SHADOW_FORWARD_START_DATE)
    expect(comparison.production).toMatchObject({ pickCount: 3, maturePickCount: 3 })
    expect(comparison.volumeBreakoutAtrRank).toMatchObject({ pickCount: 3, maturePickCount: 3 })
  })

  it('renders the side-by-side shadow comparison and the zero-data waiting message', () => {
    const comparison: ShadowForwardComparison = {
      startDate: SHADOW_FORWARD_START_DATE,
      endDate: '2026-09-30',
      production: { pickCount: 45, maturePickCount: 40, hitCount: 20, hitRate: 0.5 },
      volumeBreakoutAtrRank: { pickCount: 45, maturePickCount: 40, hitCount: 30, hitRate: 0.75 },
      hitRateDifferencePercentagePoints: 25,
    }
    const rendered = renderShadowForwardComparisonSection(comparison)

    expect(rendered).toContain('| production | 45 | 40 | 20 | 50.0% | - |')
    expect(rendered).toContain('| volumeBreakoutAtrRank | 45 | 40 | 30 | 75.0% | +25.0%p |')
    expect(renderShadowForwardComparisonSection({
      ...comparison,
      production: { pickCount: 0, maturePickCount: 0, hitCount: 0, hitRate: null },
      volumeBreakoutAtrRank: { pickCount: 0, maturePickCount: 0, hitCount: 0, hitRate: null },
      hitRateDifferencePercentagePoints: null,
    })).toContain('포워드 데이터 대기 중')
  })
})
