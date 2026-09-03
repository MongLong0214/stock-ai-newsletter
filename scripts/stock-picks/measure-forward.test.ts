import { describe, expect, it } from 'vitest'

import { buildPriceBook } from '@/scripts/stock-picks/data-handler'
import {
  measureForwardPicks,
  measureShadowForwardComparison,
  renderShadowForwardComparisonSection,
  type PublishedNewsletterRow,
  type ShadowForwardComparison,
} from '@/scripts/stock-picks/measure-forward'
import type { StockPickSnapshot } from '@/scripts/stock-picks/pick-snapshots'
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
      labeledPicks: 4,
      nullPicks: 0,
      touchedPicks: 1,
      hitRate: 0.5,
      nullRate: 0,
      statusCounts: {
        hit: 1,
        miss: 1,
        unexpected_untradeable: 0,
        data_error: 2,
      },
    })
    expect(report.byPicksSource.code.totalPicks).toBe(2)
    expect(report.byPicksSource.llm_fallback.hitRate).toBe(0)
    expect(report.byPicksSource.crash.totalPicks).toBe(0)
    expect(report.byPicksSource.code.statusCounts.data_error).toBe(1)
    expect(report.byPicksSource.null.statusCounts.data_error).toBe(1)
    expect(report.nullBreakdown).toEqual({
      missingEntryOpen: 0,
      missingWindowData: 0,
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

  it('compares published v1 with v0-only breakout picks from stored snapshots', () => {
    const dates = [
      '2026-09-02',
      '2026-09-03',
      '2026-09-04',
      '2026-09-07',
      '2026-09-08',
      '2026-09-09',
    ]
    const symbols = ['BREAKOUT_HIT', 'BREAKOUT_MISS_A', 'VOLUME_HIT', 'BREAKOUT_MISS_B']
    const hitSymbols = new Set(['BREAKOUT_HIT', 'VOLUME_HIT'])
    const prices = buildPriceBook(symbols.flatMap((symbol) => dates.map((tradeDate, index): StockDailyPriceRow => ({
      symbol,
      trade_date: tradeDate,
      open: 100,
      high: index >= 1 && hitSymbols.has(symbol) ? 110 : 109,
      low: 95,
      close: 100,
      volume: 1_000,
      source: 'kis',
    }))))
    const candidate = (
      symbol: string,
      tier: 'breakout' | 'volumeOnly',
      rank: number,
    ) => ({ symbol, tier, rank }) as StockPickSnapshot['picks'][number]
    const publishedPicks = [
      candidate('BREAKOUT_HIT', 'breakout', 1),
      candidate('BREAKOUT_MISS_A', 'breakout', 2),
      candidate('VOLUME_HIT', 'volumeOnly', 3),
    ]
    const snapshot = {
      signal_date: dates[0],
      strategy: 'volumeBreakoutNoGapUp+volumeOnlyFill',
      strategy_version: 'v1-2026-09-03',
      parameters_hash: 'fixture-hash',
      generated_at: '2026-09-03T00:00:00.000Z',
      git_sha: null,
      run_id: null,
      funnel: {
        signalDate: dates[0],
        activeMasters: 4,
        withFreshKisRow: 4,
        withCompleteFeatures: 4,
        gatePassed: 4,
        picked: 3,
      },
      picks: publishedPicks,
      top_candidates: [
        ...publishedPicks,
        candidate('BREAKOUT_MISS_B', 'breakout', 4),
      ],
    } as StockPickSnapshot

    const comparison = measureShadowForwardComparison({
      prices,
      tradingDays: new TradingDayIndex(dates),
      snapshots: [snapshot],
      startDate: dates[0],
      asOfDate: dates.at(-1)!,
    })

    expect(comparison.publishedV1).toMatchObject({
      dayCount: 1,
      pickCount: 3,
      labeledPickCount: 3,
      hitCount: 2,
      slotDenominator: 3,
      slotPrecisionAt3: 2 / 3,
    })
    expect(comparison.productionV0Only).toMatchObject({
      dayCount: 1,
      pickCount: 3,
      labeledPickCount: 3,
      hitCount: 1,
      slotDenominator: 3,
      slotPrecisionAt3: 1 / 3,
    })
    expect(comparison.slotPrecisionDifferencePercentagePoints).toBeCloseTo(100 / 3)
  })

  it('renders the side-by-side shadow comparison and the zero-data waiting message', () => {
    const comparison: ShadowForwardComparison = {
      startDate: '2026-09-02',
      endDate: '2026-09-30',
      snapshotCount: 15,
      publishedV1: {
        dayCount: 10,
        pickCount: 30,
        labeledPickCount: 30,
        hitCount: 15,
        slotDenominator: 30,
        slotPrecisionAt3: 0.5,
      },
      productionV0Only: {
        dayCount: 10,
        pickCount: 20,
        labeledPickCount: 20,
        hitCount: 6,
        slotDenominator: 30,
        slotPrecisionAt3: 0.2,
      },
      slotPrecisionDifferencePercentagePoints: 30,
    }
    const rendered = renderShadowForwardComparisonSection(comparison)

    expect(rendered).toContain('| v1 (published) | 10 | 30 | 30 | 15/30 | 50.0% | +30.0%p |')
    expect(rendered).toContain('| v0-only | 10 | 20 | 20 | 6/30 | 20.0% | - |')
    expect(renderShadowForwardComparisonSection({
      ...comparison,
      snapshotCount: 0,
    })).toContain('스냅샷 대기 중')
  })
})
