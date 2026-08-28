import { describe, expect, it } from 'vitest'

import type { StockFeatureVector } from '@/scripts/stock-picks/features'
import {
  DEFAULT_PULLBACK_REBOUND_PARAMETERS,
  passesCommonGate,
  rankStrategyCandidates,
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
})
