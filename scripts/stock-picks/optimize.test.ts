import { describe, expect, it } from 'vitest'

import { createVolumeOnlyStrategy, type StockPickStrategy } from '@/scripts/stock-picks/backtest'
import { buildPriceBook } from '@/scripts/stock-picks/data-handler'
import type { StockFeatureVector } from '@/scripts/stock-picks/features'
import {
  PARAMETER_GRIDS,
  createWalkForwardSplits,
  runFrozenProductionEvaluation,
  runWalkForwardOptimization,
  type WalkForwardSplit,
} from '@/scripts/stock-picks/optimize'
import {
  DEFAULT_COMPOSITE_PARAMETERS,
  DEFAULT_EARLY_TREND_PARAMETERS,
  DEFAULT_PULLBACK_REBOUND_PARAMETERS,
  DEFAULT_VOLUME_BREAKOUT_BULLISH_CANDLE_PARAMETERS,
  DEFAULT_VOLUME_BREAKOUT_NO_GAP_UP_PARAMETERS,
  DEFAULT_VOLUME_BREAKOUT_PARAMETERS,
  type StockMasterState,
} from '@/scripts/stock-picks/strategies'
import { TradingDayIndex } from '@/scripts/stock-picks/trading-days'
import type { StockDailyPriceRow } from '@/scripts/tli/prices/stock-daily-prices'

const makeFeature = (symbol: string, simDate: string): StockFeatureVector => ({
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
  atrPercentile60: 50,
  adx14: 25,
  adx14Previous: 24,
  adx14Change: 1,
  obvSlope20: 100,
  volumeRatio20: 1.2,
  volumePercentile60: 99,
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
  distanceFromHigh60: 1,
  gapFromPreviousClosePercent: -0.5,
  goldenCrossAge: 2,
  bullishCandle: true,
})

describe('stock-picks walk-forward optimizer', () => {
  it('ranks only common-gate-eligible stocks by volume percentile with symbol tie-breaks', () => {
    const simDate = '2026-01-02'
    const features = new Map([[simDate, [
      { ...makeFeature('B', simDate), volumePercentile60: 98 },
      { ...makeFeature('A', simDate), volumePercentile60: 98 },
      { ...makeFeature('C', simDate), volumePercentile60: 99 },
      { ...makeFeature('D', simDate), volumePercentile60: 100, rsi14: 71 },
    ]]])
    const masters = new Map(['A', 'B', 'C', 'D'].map((symbol) => [symbol, {
      symbol,
      is_active: true,
      status_flags: null,
    } satisfies StockMasterState]))
    const strategy = createVolumeOnlyStrategy(features, masters, DEFAULT_VOLUME_BREAKOUT_PARAMETERS)

    expect(strategy(
      {} as Parameters<StockPickStrategy>[0],
      ['A', 'B', 'C', 'D'],
      simDate,
    )).toEqual(['C', 'A', 'B'])
  })

  it('purges the final five train trading days before the test label boundary', () => {
    const dates = [
      ...Array.from({ length: 8 }, (_value, index) => `2026-01-${String(index + 1).padStart(2, '0')}`),
      ...Array.from({ length: 8 }, (_value, index) => `2026-02-${String(index + 1).padStart(2, '0')}`),
      ...Array.from({ length: 8 }, (_value, index) => `2026-03-${String(index + 1).padStart(2, '0')}`),
      ...Array.from({ length: 8 }, (_value, index) => `2026-04-${String(index + 1).padStart(2, '0')}`),
    ]
    const tradingDays = new TradingDayIndex(dates)
    const [split] = createWalkForwardSplits(dates)

    expect(split.purgedDates).toEqual(dates.slice(19, 24))
    expect(split.trainDates.at(-1)).toBe(dates[18])
    const trainLastLabelDay = tradingDays.nextTradingDay(split.trainDates.at(-1)!, 5)
    expect(trainLastLabelDay !== null && trainLastLabelDay < split.testDates[0]).toBe(true)
  })

  it('keeps every default strategy grid at or below 200 combinations', () => {
    for (const grid of Object.values(PARAMETER_GRIDS)) expect(grid.length).toBeLessThanOrEqual(200)
    for (const name of [
      'volumeBreakout',
      'volumeBreakoutBullishCandle',
      'volumeBreakoutNoGapUp',
    ] as const) {
      const grid = PARAMETER_GRIDS[name]
      expect(grid).toHaveLength(108)
      expect(new Set(grid.map((row) => row.minVolumePercentile))).toEqual(new Set([90, 95, 97, 99]))
      expect(new Set(grid.map((row) => row.minDistanceFromHighPercent))).toEqual(new Set([-5, -2, 0]))
      expect(new Set(grid.map((row) => row.maxRsi))).toEqual(new Set([65, 70, 75]))
      expect(new Set(grid.map((row) => row.minTurnover))).toEqual(new Set([
        500_000_000, 1_000_000_000, 3_000_000_000,
      ]))
    }
  })

  it('runs one full train-select then OOS-test fixture iteration deterministically', () => {
    const evaluationDates = [
      '2026-01-02', '2026-01-05',
      '2026-02-02', '2026-02-03',
      '2026-03-02', '2026-03-03',
      '2026-04-01', '2026-04-02',
    ]
    const futureDates = ['2026-04-03', '2026-04-06', '2026-04-07', '2026-04-08', '2026-04-09']
    const allDates = [...evaluationDates, ...futureDates]
    const symbols = ['KOSPI:000001', 'KOSPI:000002', 'KOSPI:000003']
    const rows: StockDailyPriceRow[] = symbols.flatMap((symbol) => allDates.map((tradeDate) => ({
      symbol,
      trade_date: tradeDate,
      open: 100,
      high: 111,
      low: 95,
      close: 105,
      volume: 1_000,
      source: 'kis',
    })))
    const masters: StockMasterState[] = symbols.map((symbol) => ({
      symbol,
      is_active: true,
      status_flags: {},
    }))
    const featuresByDate = new Map(evaluationDates.map((date) => [
      date,
      symbols.map((symbol) => makeFeature(symbol, date)),
    ]))
    const split: WalkForwardSplit = {
      index: 0,
      trainMonths: ['2026-01', '2026-02', '2026-03'],
      testMonths: ['2026-04'],
      trainDates: evaluationDates.slice(0, 5),
      purgedDates: [evaluationDates[5]],
      testDates: evaluationDates.slice(6),
    }
    const parameterGrids = {
      pullbackRebound: [DEFAULT_PULLBACK_REBOUND_PARAMETERS],
      volumeBreakout: [DEFAULT_VOLUME_BREAKOUT_PARAMETERS],
      volumeBreakoutBullishCandle: [DEFAULT_VOLUME_BREAKOUT_BULLISH_CANDLE_PARAMETERS],
      volumeBreakoutNoGapUp: [DEFAULT_VOLUME_BREAKOUT_NO_GAP_UP_PARAMETERS],
      earlyTrend: [DEFAULT_EARLY_TREND_PARAMETERS],
      composite: [DEFAULT_COMPOSITE_PARAMETERS],
    }
    const input = {
      prices: buildPriceBook(rows),
      tradingDays: new TradingDayIndex(allDates),
      masters,
      featuresByDate,
      splits: [split],
      parameterGrids,
      generatedAt: '2026-08-28T00:00:00.000Z',
    }

    const first = runWalkForwardOptimization(input)
    const second = runWalkForwardOptimization(input)
    expect(first).toEqual(second)
    expect(first.strategies.composite.force3.aggregate).toMatchObject({
      evaluationScope: 'out_of_sample',
      totalDates: 2,
      totalPicks: 6,
      labeledPicks: 6,
      precisionAt3: 1,
      slotPrecisionAt3: 1,
      slotCoverage: 1,
      anyHitRate: 1,
      twoPlusHitRate: 1,
      nullRate: 0,
    })
    expect(first.baselines.oosPolicyRandom3).toMatchObject({
      totalDates: 2,
      totalPicks: 6,
      slotPrecisionAt3: 1,
    })
    expect(first.baselines.oosVolumeOnly3).toMatchObject({
      totalDates: 2,
      totalPicks: 6,
      slotPrecisionAt3: 1,
    })
    expect(first.strategies.composite.force3.segments[0].train.inSampleReference.precisionAt3).toBe(1)
    expect(first.compositeAblation.evaluationScope).toBe('out_of_sample')
    expect(first.compositeAblation.method).toBe('score_weight_zero_gate_preserved')
    expect(first.compositeAblation.excludedFeatures.map((row) => row.feature)).toContain('rsi14')
    expect(first.caveats.survivorshipBias).toContain('current stock_master')

    const frozen = runFrozenProductionEvaluation(input)
    expect(frozen.evaluationPolicy).toMatchObject({
      evaluationScope: 'walk_forward_test_dates',
      parameterSelection: 'frozen_no_fold_reselection',
      strategy: 'volumeBreakoutNoGapUp+volumeOnlyFill',
      mode: 'force3',
    })
    expect(frozen.parameters.minScore).toBe(0)
    expect(frozen.strategy).toMatchObject({
      name: 'volumeBreakoutNoGapUp+volumeOnlyFill',
      version: 'v1-2026-09-03',
      parametersHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    })
    expect(frozen.datasetFingerprint).toEqual({
      tradingDays: {
        first: allDates[0],
        last: allDates.at(-1),
        count: allDates.length,
      },
      priceRows: rows.length,
      symbols: symbols.length,
    })
    expect(frozen.aggregate).toMatchObject({
      totalDates: 2,
      totalPicks: 6,
      labeledPicks: 6,
      precisionAt3: 1,
      slotPrecisionAt3: 1,
    })
    expect(frozen.baselines.oosPolicyRandom3.slotPrecisionAt3).toBe(1)
    expect(frozen.baselines.oosVolumeOnly3.slotPrecisionAt3).toBe(1)
    expect(frozen.baselines.productionV0.slotPrecisionAt3).toBe(1)
    expect(frozen.pairedDailyDelta.productionMinusVolumeOnly).toMatchObject({
      excludedDates: { onlyProduction: 0, onlyBaseline: 0, total: 0 },
      slotPrecisionAt3DeltaCi: { mean: 0, lower95: 0, upper95: 0 },
    })
    expect(frozen.experiments.tieredFill).toMatchObject({
      evaluationScope: 'exploratory_dev_window',
      tiers: ['breakout', 'relaxedBreakout', 'volumeOnly'],
      picksByTier: { breakout: 6, relaxedBreakout: 0, volumeOnly: 0 },
      hitsByTier: { breakout: 6, relaxedBreakout: 0, volumeOnly: 0 },
      totalPicks: 6,
      slotPrecisionAt3: 1,
    })
    expect(frozen.experiments.breakoutThenVolumeOnly).toMatchObject({
      evaluationScope: 'exploratory_dev_window',
      tiers: ['breakout', 'volumeOnly'],
      picksByTier: { breakout: 6, relaxedBreakout: 0, volumeOnly: 0 },
      hitsByTier: { breakout: 6, relaxedBreakout: 0, volumeOnly: 0 },
      totalPicks: 6,
      slotPrecisionAt3: 1,
    })
  })

  it('attributes exploratory picks and hits to each fill tier', () => {
    const simDate = '2026-04-01'
    const futureDates = ['2026-04-02', '2026-04-03', '2026-04-06', '2026-04-07', '2026-04-08']
    const allDates = [simDate, ...futureDates]
    const symbols = ['BREAKOUT', 'RELAXED', 'VOLUME']
    const rows: StockDailyPriceRow[] = symbols.flatMap((symbol) => allDates.map((tradeDate) => ({
      symbol,
      trade_date: tradeDate,
      open: 100,
      high: 111,
      low: 95,
      close: 105,
      volume: 1_000,
      source: 'kis',
    })))
    const masters: StockMasterState[] = symbols.map((symbol) => ({
      symbol,
      is_active: true,
      status_flags: {},
    }))
    const featuresByDate = new Map([[simDate, [
      { ...makeFeature('VOLUME', simDate), volumePercentile60: 99, distanceFromHigh60: -4 },
      { ...makeFeature('RELAXED', simDate), volumePercentile60: 85, distanceFromHigh60: -1 },
      { ...makeFeature('BREAKOUT', simDate), volumePercentile60: 99, distanceFromHigh60: 1 },
    ]]])
    const split: WalkForwardSplit = {
      index: 0,
      trainMonths: ['2026-01', '2026-02', '2026-03'],
      testMonths: ['2026-04'],
      trainDates: ['2026-03-30'],
      purgedDates: ['2026-03-31'],
      testDates: [simDate],
    }

    const frozen = runFrozenProductionEvaluation({
      prices: buildPriceBook(rows),
      tradingDays: new TradingDayIndex(allDates),
      masters,
      featuresByDate,
      splits: [split],
      generatedAt: '2026-08-28T00:00:00.000Z',
    })

    expect(frozen.aggregate.totalPicks).toBe(3)
    expect(frozen.baselines.productionV0.totalPicks).toBe(1)
    expect(frozen.experiments.tieredFill).toMatchObject({
      evaluationScope: 'exploratory_dev_window',
      totalPicks: 3,
      slotCoverage: 1,
      picksByTier: { breakout: 1, relaxedBreakout: 1, volumeOnly: 1 },
      hitsByTier: { breakout: 1, relaxedBreakout: 1, volumeOnly: 1 },
      pairedDailyDelta: {
        experimentMinusProduction: {
          excludedDates: { onlyProduction: 0, onlyBaseline: 0, total: 0 },
          slotPrecisionAt3DeltaCi: { mean: 0, lower95: 0, upper95: 0 },
        },
        experimentMinusVolumeOnly: {
          slotPrecisionAt3DeltaCi: { mean: 0, lower95: 0, upper95: 0 },
        },
      },
    })
    expect(frozen.experiments.breakoutThenVolumeOnly).toMatchObject({
      evaluationScope: 'exploratory_dev_window',
      totalPicks: 3,
      picksByTier: { breakout: 1, relaxedBreakout: 0, volumeOnly: 2 },
      hitsByTier: { breakout: 1, relaxedBreakout: 0, volumeOnly: 2 },
    })
  })
})
