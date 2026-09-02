import { describe, expect, it } from 'vitest'

import type { StockPickStrategy } from '@/scripts/stock-picks/backtest'
import type { StockFeatureVector } from '@/scripts/stock-picks/features'
import { PRODUCTION_VOLUME_BREAKOUT_PARAMETERS } from '@/scripts/stock-picks/generate-picks'
import {
  COMPOSITE_ABLATION_FEATURES,
  DEFAULT_PULLBACK_REBOUND_PARAMETERS,
  DEFAULT_VOLUME_BREAKOUT_BULLISH_CANDLE_PARAMETERS,
  DEFAULT_VOLUME_BREAKOUT_NO_GAP_UP_PARAMETERS,
  DEFAULT_VOLUME_BREAKOUT_PARAMETERS,
  VOLUME_BREAKOUT_ATR_RANK_PARAMETERS,
  createTieredFillStrategy,
  passesCommonGate,
  rankStrategyCandidates,
  rankTieredFillCandidates,
  rankVolumeBreakoutAtrRankCandidates,
  scoreStrategy,
  type StockMasterState,
} from '@/scripts/stock-picks/strategies'

const feature = (symbol: string, overrides: Partial<StockFeatureVector> = {}): StockFeatureVector => ({
  symbol,
  simDate: '2026-08-28',
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
  volumePercentile60: 97,
  position52w: 0.8,
  position52wObservations: 200,
  position52wFullWindow: false,
  consecutiveUpDays: 1,
  trendR2_20: 0.6,
  trendSlope20: 0.01,
  trendR2_20Previous: 0.55,
  trendR2_20Change: 0.05,
  trendR2_60: 0.8,
  trendSlope60: 0.01,
  distanceFromHigh60: -1,
  gapFromPreviousClosePercent: -0.5,
  goldenCrossAge: 3,
  bullishCandle: true,
  ...overrides,
})

const master = (symbol: string, overrides: Partial<StockMasterState> = {}): StockMasterState => ({
  symbol,
  is_active: true,
  status_flags: {},
  ...overrides,
})

describe('stock-picks strategy gates and ranking', () => {
  it('excludes overbought and below-liquidity candidates', () => {
    const state = master('A')
    expect(passesCommonGate(feature('A', { rsi14: 70 }), state)).toBe(true)
    expect(passesCommonGate(feature('A', { rsi14: 70.01 }), state)).toBe(false)
    expect(passesCommonGate(feature('A', { averageTurnover20: 999_999_999 }), state)).toBe(false)
  })

  it('excludes inactive, managed, suspended, and penny stocks', () => {
    expect(passesCommonGate(feature('A'), master('A', { is_active: false }))).toBe(false)
    expect(passesCommonGate(feature('A'), master('A', { status_flags: { managed_stock: 'Y' } }))).toBe(false)
    expect(passesCommonGate(feature('A'), master('A', { status_flags: { trading_suspended: true } }))).toBe(false)
    expect(passesCommonGate(feature('A', { close: 999 }), master('A'))).toBe(false)
  })

  it('is deterministic and breaks equal-score ties by symbol', () => {
    const features = [feature('C'), feature('A'), feature('B')]
    const masters = new Map(features.map((row) => [row.symbol, master(row.symbol)]))
    const input = {
      name: 'pullbackRebound' as const,
      features,
      masters,
      parameters: DEFAULT_PULLBACK_REBOUND_PARAMETERS,
      mode: 'force3' as const,
    }

    const first = rankStrategyCandidates(input)
    const second = rankStrategyCandidates(input)
    expect(first).toEqual(second)
    expect(first.map((row) => row.symbol)).toEqual(['A', 'B', 'C'])
  })

  it('lets abstain mode enforce minScore while force3 ranks all valid candidates', () => {
    const candidate = feature('A')
    const masters = new Map([['A', master('A')]])
    const parameters = { ...DEFAULT_PULLBACK_REBOUND_PARAMETERS, minScore: 101 }

    expect(rankStrategyCandidates({
      name: 'pullbackRebound', features: [candidate], masters, parameters, mode: 'force3',
    })).toHaveLength(1)
    expect(rankStrategyCandidates({
      name: 'pullbackRebound', features: [candidate], masters, parameters, mode: 'abstain',
    })).toHaveLength(0)
  })

  it('applies the bullish-candle and no-gap-up breakout variants deterministically', () => {
    const features = [
      feature('C', { bullishCandle: true, gapFromPreviousClosePercent: -1 }),
      feature('A', { bullishCandle: true, gapFromPreviousClosePercent: 0 }),
      feature('B', { bullishCandle: false, gapFromPreviousClosePercent: 1 }),
    ]
    const masters = new Map(features.map((row) => [row.symbol, master(row.symbol)]))
    const bullishInput = {
      name: 'volumeBreakoutBullishCandle' as const,
      features,
      masters,
      parameters: DEFAULT_VOLUME_BREAKOUT_BULLISH_CANDLE_PARAMETERS,
      mode: 'force3' as const,
    }
    const noGapInput = {
      name: 'volumeBreakoutNoGapUp' as const,
      features,
      masters,
      parameters: DEFAULT_VOLUME_BREAKOUT_NO_GAP_UP_PARAMETERS,
      mode: 'force3' as const,
    }

    expect(rankStrategyCandidates(bullishInput)).toEqual(rankStrategyCandidates(bullishInput))
    expect(rankStrategyCandidates(bullishInput).map((row) => row.symbol)).toEqual(['A', 'C'])
    expect(rankStrategyCandidates(noGapInput)).toEqual(rankStrategyCandidates(noGapInput))
    expect(rankStrategyCandidates(noGapInput).map((row) => row.symbol)).toEqual(['A', 'C'])
  })

  it('fills tiers in order without duplicates and preserves production picks as the prefix', () => {
    const simDate = '2026-08-28'
    const features = [
      feature('VOLUME', { volumePercentile60: 99, distanceFromHigh60: -4 }),
      feature('RELAXED', { volumePercentile60: 85, distanceFromHigh60: -1 }),
      feature('BREAKOUT', { volumePercentile60: 99, distanceFromHigh60: 1 }),
      feature('OUTSIDE', { volumePercentile60: 100, distanceFromHigh60: 5 }),
    ]
    const universe = ['BREAKOUT', 'RELAXED', 'VOLUME']
    const universeSet = new Set(universe)
    const masters = new Map(features.map((row) => [row.symbol, master(row.symbol)]))
    const production = rankStrategyCandidates({
      name: 'volumeBreakoutNoGapUp',
      features,
      masters,
      parameters: PRODUCTION_VOLUME_BREAKOUT_PARAMETERS,
      mode: 'force3',
      universe: universeSet,
    }).map((row) => row.symbol)
    const input = {
      features,
      masters,
      parameters: PRODUCTION_VOLUME_BREAKOUT_PARAMETERS,
      universe: universeSet,
    }

    const first = rankTieredFillCandidates(input)
    expect(first).toEqual([
      { symbol: 'BREAKOUT', tier: 'breakout' },
      { symbol: 'RELAXED', tier: 'relaxedBreakout' },
      { symbol: 'VOLUME', tier: 'volumeOnly' },
    ])
    expect(rankTieredFillCandidates(input)).toEqual(first)
    expect(first.slice(0, production.length).map((row) => row.symbol)).toEqual(production)
    expect(new Set(first.map((row) => row.symbol)).size).toBe(first.length)
    expect(rankTieredFillCandidates({
      ...input,
      tiers: ['breakout', 'volumeOnly'],
    })).toEqual([
      { symbol: 'BREAKOUT', tier: 'breakout' },
      { symbol: 'VOLUME', tier: 'volumeOnly' },
      { symbol: 'RELAXED', tier: 'volumeOnly' },
    ])

    const strategy = createTieredFillStrategy({
      featuresByDate: new Map([[simDate, features]]),
      masters,
      parameters: PRODUCTION_VOLUME_BREAKOUT_PARAMETERS,
    })
    const handler = {} as Parameters<StockPickStrategy>[0]
    expect(strategy(handler, universe, simDate)).toEqual(first.map((row) => row.symbol))
    expect(strategy(handler, universe, simDate)).toEqual(first.map((row) => row.symbol))
  })

  it('keeps gates intact when ablation zeros only a score contribution', () => {
    const valid = feature('A', { rsi14: 45 })
    const overbought = feature('A', { rsi14: 71 })
    const state = master('A')
    const baseline = scoreStrategy({
      name: 'pullbackRebound',
      feature: valid,
      master: state,
      parameters: DEFAULT_PULLBACK_REBOUND_PARAMETERS,
    })
    const ablated = scoreStrategy({
      name: 'pullbackRebound',
      feature: valid,
      master: state,
      parameters: DEFAULT_PULLBACK_REBOUND_PARAMETERS,
      omittedFeature: 'rsi14',
    })

    expect(COMPOSITE_ABLATION_FEATURES).not.toContain('rsi14')
    expect(ablated).not.toBeNull()
    expect(ablated).toBeLessThan(baseline!)
    expect(scoreStrategy({
      name: 'pullbackRebound',
      feature: overbought,
      master: state,
      parameters: DEFAULT_PULLBACK_REBOUND_PARAMETERS,
      omittedFeature: 'rsi14',
    })).toBeNull()
  })

  it('uses the fold-selected RSI cap in the breakout hard gate', () => {
    const state = master('A')
    expect(scoreStrategy({
      name: 'volumeBreakout',
      feature: feature('A', { rsi14: 74 }),
      master: state,
      parameters: { ...DEFAULT_VOLUME_BREAKOUT_PARAMETERS, maxRsi: 75 },
    })).not.toBeNull()
    expect(scoreStrategy({
      name: 'volumeBreakout',
      feature: feature('A', { rsi14: 66 }),
      master: state,
      parameters: { ...DEFAULT_VOLUME_BREAKOUT_PARAMETERS, maxRsi: 65 },
    })).toBeNull()
  })

  it('ranks the preregistered shadow by ATR14 rolling percentile, then the production score', () => {
    const features = [
      feature('A', {
        atrPercent14: 9,
        atrPercentile60: 90,
        volumePercentile60: 91,
        distanceFromHigh60: 0,
      }),
      feature('B', {
        atrPercent14: 2,
        atrPercentile60: 20,
        volumePercentile60: 99,
        distanceFromHigh60: 4,
      }),
      feature('C', {
        atrPercent14: 3,
        atrPercentile60: 90,
        volumePercentile60: 95,
        distanceFromHigh60: 1,
      }),
    ]
    const masters = new Map(features.map((row) => [row.symbol, master(row.symbol)]))

    expect(rankVolumeBreakoutAtrRankCandidates({ features, masters }).map((row) => row.symbol))
      .toEqual(['C', 'A', 'B'])
  })

  it('keeps the ATR shadow gate identical to the frozen production breakout gate', () => {
    const features = [
      feature('VALID', { distanceFromHigh60: 0, volumePercentile60: 90 }),
      feature('RSI', { distanceFromHigh60: 0, rsi14: 75.01 }),
      feature('GAP', { distanceFromHigh60: 0, gapFromPreviousClosePercent: 0.01 }),
      feature('DISTANCE', { distanceFromHigh60: -0.01 }),
      feature('VOLUME', { distanceFromHigh60: 0, volumePercentile60: 89.99 }),
      feature('TURNOVER', { distanceFromHigh60: 0, averageTurnover20: 499_999_999 }),
    ]
    const masters = new Map(features.map((row) => [row.symbol, master(row.symbol)]))
    const productionSymbols = rankStrategyCandidates({
      name: 'volumeBreakout',
      features,
      masters,
      parameters: PRODUCTION_VOLUME_BREAKOUT_PARAMETERS,
      mode: 'force3',
      pickCount: features.length,
    }).map((row) => row.symbol).sort()
    const shadowSymbols = rankVolumeBreakoutAtrRankCandidates({
      features,
      masters,
    }).map((row) => row.symbol).sort()

    expect(VOLUME_BREAKOUT_ATR_RANK_PARAMETERS).toEqual(PRODUCTION_VOLUME_BREAKOUT_PARAMETERS)
    expect(shadowSymbols).toEqual(productionSymbols)
    expect(shadowSymbols).toEqual(['VALID'])
  })
})
