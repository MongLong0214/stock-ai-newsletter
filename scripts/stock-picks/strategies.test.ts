import { describe, expect, it } from 'vitest'

import type { StockPickStrategy } from '@/scripts/stock-picks/backtest'
import type { StockFeatureVector } from '@/scripts/stock-picks/features'
import { PRODUCTION_VOLUME_BREAKOUT_PARAMETERS } from '@/scripts/stock-picks/generate-picks'
import { FROZEN_COMPOSITE_RETURN_MODEL } from '@/scripts/stock-picks/production-strategy'
import { normalizeUtilityScore } from '@/scripts/stock-picks/utility-model'
import {
  COMPOSITE_ABLATION_FEATURES,
  DEFAULT_PULLBACK_REBOUND_PARAMETERS,
  DEFAULT_VOLUME_BREAKOUT_BULLISH_CANDLE_PARAMETERS,
  DEFAULT_VOLUME_BREAKOUT_NO_GAP_UP_PARAMETERS,
  DEFAULT_VOLUME_BREAKOUT_PARAMETERS,
  LOW_VOLATILITY_STABLE_PARAMETERS,
  VOLUME_BREAKOUT_ATR_RANK_PARAMETERS,
  createTieredFillStrategy,
  isPreferredShare,
  passesCommonGate,
  rankStrategyCandidates,
  rankLowVolatilityStableCandidates,
  rankUtilityAtrPenaltyCandidates,
  rankUtilityScoreCandidates,
  rankSeededRandomCandidates,
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

describe('per-date utility ATR penalty ranking', () => {
  const rank = (candidates: readonly StockFeatureVector[], utilities: readonly number[], excludeSymbols = new Set<string>()) => (
    rankUtilityAtrPenaltyCandidates({ features: candidates,
      masters: new Map(candidates.map((candidate) => [candidate.symbol, master(candidate.symbol)])),
      utilities: new Map(candidates.map((candidate, index) => [candidate.symbol, utilities[index]!])),
      parameters: LOW_VOLATILITY_STABLE_PARAMETERS, excludeSymbols, pickCount: candidates.length })
  )

  it('uses population z-scores and subtracts half the ATR z-score', () => {
    const candidates = [
      feature('KOSPI:000010', { atrPercent14: 1 }),
      feature('KOSPI:000020', { atrPercent14: 5 }),
      feature('KOSPI:000030', { atrPercent14: 3 }),
    ]
    // Prediction mean=1, variance=2/3; ATR mean=3, variance=8/3.
    const result = rank(candidates, [0, 1, 2])
    expect(result.map(({ symbol, score }) => ({ symbol, score }))).toEqual([
      { symbol: 'KOSPI:000030', score: 74 },
      { symbol: 'KOSPI:000010', score: 38 },
      { symbol: 'KOSPI:000020', score: 38 },
    ])
    expect(result[0]!.adjusted).toBeCloseTo(Math.sqrt(1.5), 12)
    expect(result[1]!.adjusted).toBeCloseTo(-Math.sqrt(1.5) / 2, 12)
    expect(result[2]!.adjusted).toBeCloseTo(-Math.sqrt(1.5) / 2, 12)
  })

  it('orders continuous adjustments before turnover and ASCII symbols, including rounded score ties', () => {
    const candidates = [
      feature('KOSPI:000010', { averageTurnover20: 20_000_000_000 }),
      feature('KOSPI:000020', { averageTurnover20: 500_000_000 }),
      feature('KOSPI:000030'),
      feature('KOSDAQ:000040'),
      feature('KOSPI:000050', { averageTurnover20: 3_000_000_000 }),
    ]
    const result = rank(candidates, [0, 0.001, 10, 10, 10])
    expect(result.map(({ symbol }) => symbol)).toEqual([
      'KOSPI:000050', 'KOSDAQ:000040', 'KOSPI:000030', 'KOSPI:000020', 'KOSPI:000010',
    ])
    expect(result[3]!.score).toBe(result[4]!.score)
    expect(result[3]!.adjusted).toBeGreaterThan(result[4]!.adjusted)
    expect(rank([...candidates].reverse(), [10, 10, 10, 0.001, 0]).map(({ symbol }) => symbol))
      .toEqual(result.map(({ symbol }) => symbol))
  })

  it.each([
    { utilities: [1, 1, 1], atrs: [3, 3, 3], adjusted: [0, 0, 0] },
    { utilities: [0.1, 0.1, 0.1], atrs: [0.2, 0.2, 0.2], adjusted: [0, 0, 0] },
    { utilities: [-1, 0, 1], atrs: [3, 3, 3], adjusted: [-Math.sqrt(1.5), 0, Math.sqrt(1.5)] },
    { utilities: [1, 1, 1], atrs: [1, 3, 5], adjusted: [Math.sqrt(1.5) / 2, 0, -Math.sqrt(1.5) / 2] },
  ])('uses std=1 for a constant prediction or ATR column: $utilities / $atrs', ({ utilities, atrs, adjusted }) => {
    const candidates = atrs.map((atrPercent14, index) => feature(`KOSPI:0000${index + 1}0`, { atrPercent14 }))
    const result = rank(candidates, utilities)
    for (const [index, candidate] of candidates.entries()) {
      expect(result.find(({ symbol }) => symbol === candidate.symbol)!.adjusted).toBeCloseTo(adjusted[index]!, 12)
    }
    expect(result.every(({ score }) => Number.isInteger(score) && score >= 0 && score <= 100)).toBe(true)
  })

  it('keeps cooldown symbols in the statistics while excluding them before the pick limit', () => {
    const candidates = [1, 3, 5].map((atrPercent14, index) => feature(`KOSPI:0000${index + 1}0`, { atrPercent14 }))
    const baseline = rank(candidates, [0, 1, 2])
    const result = rank(candidates, [0, 1, 2], new Set(['KOSPI:000030']))
    expect(result).toEqual(baseline.filter(({ symbol }) => symbol !== 'KOSPI:000030'))
    expect(result.map(({ score }) => score)).toEqual([50, 38])
    expect(rankUtilityAtrPenaltyCandidates({ features: candidates,
      masters: new Map(candidates.map((candidate) => [candidate.symbol, master(candidate.symbol)])),
      utilities: new Map(candidates.map((candidate, index) => [candidate.symbol, index])),
      parameters: LOW_VOLATILITY_STABLE_PARAMETERS, excludeSymbols: new Set(['KOSPI:000030']), pickCount: 1 }))
      .toEqual([result[0]])
  })

  it('leaves rejected gates and locked-down candles out of both statistics and inference', () => {
    const candidates = [feature('KOSPI:000010'), feature('KOSPI:000020')]
    const rejected = [
      feature('KOSPI:000030', { open: 1_400, high: 1_400, low: 1_400, close: 1_400,
        gapFromPreviousClosePercent: -20, atrPercent14: 100 }),
      feature('KOSPI:000045', { atrPercent14: 100 }),
      feature('KOSPI:000050', { rsi14: 76, atrPercent14: 100 }),
      feature('KOSPI:000060', { atrPercent14: null }),
    ]
    // No predictions are supplied for the rejected rows.
    expect(rank([...candidates, ...rejected], [0, 1])).toEqual(rank(candidates, [0, 1]))
  })

  it('clamps display scores at 0 and 100 while preserving continuous ordering', () => {
    const candidates = Array.from({ length: 40 }, (_, index) => feature(`KOSPI:${String((index + 1) * 10).padStart(6, '0')}`, {
      averageTurnover20: index === 1 || index === 3 ? 20_000_000_000 : 500_000_000,
    }))
    const result = rank(candidates, [10, 9, -9, -10, ...Array<number>(36).fill(0)])
    expect(result.slice(0, 2).map(({ symbol, score }) => ({ symbol, score }))).toEqual([
      { symbol: 'KOSPI:000010', score: 100 }, { symbol: 'KOSPI:000020', score: 100 },
    ])
    expect(result.slice(-2).map(({ symbol, score }) => ({ symbol, score }))).toEqual([
      { symbol: 'KOSPI:000030', score: 0 }, { symbol: 'KOSPI:000040', score: 0 },
    ])
  })

  it('handles empty and single-symbol pools and rejects missing or non-finite pre-cooldown predictions', () => {
    expect(rank([], [])).toEqual([])
    expect(rank([feature('KOSPI:000010')], [0.0123])).toEqual([
      { symbol: 'KOSPI:000010', score: 50, adjusted: 0 },
    ])
    for (const utilities of [[], [Number.NaN], [Number.POSITIVE_INFINITY]]) {
      expect(() => rank([feature('KOSPI:000010')], utilities, new Set(['KOSPI:000010'])))
        .toThrow(/후보 추론 누락/)
    }
  })
})

describe('stock-picks strategy gates and ranking', () => {
  it('retains the stronger high-score candidate instead of letting ceiling ties favor turnover', () => {
    const reference = FROZEN_COMPOSITE_RETURN_MODEL.normalization
    const utilities = [1.5, 2, 2.5, 3].map((z) => reference.mean + reference.standardDeviation * z)
    const candidates = utilities.map((_, i) => feature(`KOSDAQ:0000${i + 1}0`, {
      averageTurnover20: i === 3 ? 500_000_000 : (5 - i) * 10_000_000_000,
    }))
    const result = rankUtilityScoreCandidates({ features: candidates,
      masters: new Map(candidates.map((c) => [c.symbol, master(c.symbol)])),
      scores: new Map(candidates.map((c, i) => [c.symbol,
        normalizeUtilityScore(FROZEN_COMPOSITE_RETURN_MODEL.normalization, utilities[i]!)])),
      parameters: LOW_VOLATILITY_STABLE_PARAMETERS, excludeSymbols: new Set() })
    expect(result).toEqual([
      { symbol: 'KOSDAQ:000040', score: 90 },
      { symbol: 'KOSDAQ:000030', score: 87 },
      { symbol: 'KOSDAQ:000020', score: 83 },
    ])
  })

  it('selects the published integer utility score even when ATR and latent utility order disagree', () => {
    const candidates = [
      feature('KOSPI:000010', { atrPercent14: 0.5 }),
      feature('KOSPI:000020', { atrPercent14: 5, averageTurnover20: 3_000_000_000 }),
      feature('KOSPI:000030', { atrPercent14: 7 }),
      feature('KOSPI:000040', { atrPercent14: 1 }),
    ]
    const masters = new Map(candidates.map((c) => [c.symbol, master(c.symbol)]))
    const result = rankUtilityScoreCandidates({ features: candidates, masters,
      scores: new Map([['KOSPI:000010', 12], ['KOSPI:000020', 65], ['KOSPI:000030', 65], ['KOSPI:000040', 64]]),
      parameters: LOW_VOLATILITY_STABLE_PARAMETERS, excludeSymbols: new Set() })
    expect(result).toEqual([{ symbol: 'KOSPI:000020', score: 65 }, { symbol: 'KOSPI:000030', score: 65 }, { symbol: 'KOSPI:000040', score: 64 }])
    expect(rankLowVolatilityStableCandidates({ features: candidates, masters,
      parameters: LOW_VOLATILITY_STABLE_PARAMETERS, excludeSymbols: new Set() }))
      .toEqual(['KOSPI:000010', 'KOSPI:000040', 'KOSPI:000020'])
  })

  it('breaks equal integer scores by turnover then ASCII symbol and keeps the existing cooldown', () => {
    const candidates = ['KOSPI:000010', 'KOSDAQ:000030', 'KOSDAQ:000020', 'KOSPI:000040'].map((s) => feature(s))
    const masters = new Map(candidates.map((c) => [c.symbol, master(c.symbol)]))
    const input = { features: candidates, masters, scores: new Map(candidates.map((c) => [c.symbol, 30])),
      parameters: LOW_VOLATILITY_STABLE_PARAMETERS, excludeSymbols: new Set(['KOSDAQ:000020']) }
    expect(rankUtilityScoreCandidates(input).map((p) => p.symbol)).toEqual(['KOSDAQ:000030', 'KOSPI:000010', 'KOSPI:000040'])
    expect(() => rankUtilityScoreCandidates({ ...input, scores: new Map() })).toThrow(/후보 추론 누락/)
    expect(() => rankUtilityScoreCandidates({ ...input, scores: new Map(candidates.map((c) => [c.symbol, 30.1])) })).toThrow(/후보 추론 누락/)
    expect(() => rankUtilityScoreCandidates({ ...input, features: [candidates[0]!, candidates[0]!] })).toThrow(/중복/)
  })

  it('applies the frozen price, status, preferred, RSI, return and turnover gates before requiring scores', () => {
    const candidates = [
      feature('KOSPI:000010'),
      feature('KOSPI:000025'),
      feature('KOSPI:000030', { rsi14: 75.01 }),
      feature('KOSPI:000040', { close: 2_090, high: 2_100, gapFromPreviousClosePercent: 0 }),
      feature('KOSPI:000050', { averageTurnover20: 499_999_999 }),
      feature('KOSPI:000060', { open: 999, close: 999, low: 990, high: 1_000 }),
      feature('KOSPI:000070'),
    ]
    const masters = new Map(candidates.map((c) => [c.symbol, master(c.symbol)]))
    masters.set('KOSPI:000070', master('KOSPI:000070', { status_flags: { trading_suspended: true } }))
    expect(rankUtilityScoreCandidates({ features: candidates, masters, scores: new Map([['KOSPI:000010', 0]]),
      parameters: LOW_VOLATILITY_STABLE_PARAMETERS, excludeSymbols: new Set() }))
      .toEqual([{ symbol: 'KOSPI:000010', score: 0 }])
  })

  it('excludes genuinely flat locked-down -29.98% and exact -20% candles before requiring scores', () => {
    const candidates = [
      feature('KOSPI:000010', { open: 1_400, high: 1_400, low: 1_400, close: 1_400,
        gapFromPreviousClosePercent: -29.98 }),
      feature('KOSPI:000020', { open: 1_600, high: 1_600, low: 1_600, close: 1_600,
        gapFromPreviousClosePercent: -20 }),
      feature('KOSPI:000030', { open: 1_600, high: 1_600, low: 1_600, close: 1_600,
        gapFromPreviousClosePercent: -19.99 }),
      feature('KOSPI:000040', { open: 1_900, high: 1_920, low: 1_590, close: 1_600,
        gapFromPreviousClosePercent: -5 }),
      feature('KOSPI:000050'),
    ]
    const masters = new Map(candidates.map((c) => [c.symbol, master(c.symbol)]))
    const safeScores = new Map([['KOSPI:000030', 90], ['KOSPI:000040', 85], ['KOSPI:000050', 80]])
    const input = { features: candidates, masters, parameters: LOW_VOLATILITY_STABLE_PARAMETERS,
      excludeSymbols: new Set<string>() }
    const expected = [{ symbol: 'KOSPI:000030', score: 90 }, { symbol: 'KOSPI:000040', score: 85 },
      { symbol: 'KOSPI:000050', score: 80 }]
    expect(rankUtilityScoreCandidates({ ...input, scores: safeScores })).toEqual(expected)
    expect(rankUtilityScoreCandidates({ ...input, scores: new Map([
      ...safeScores, ['KOSPI:000010', 100], ['KOSPI:000020', 100],
    ]) })).toEqual(expected)
    // The other selectors retain their existing eligible pool.
    expect(rankLowVolatilityStableCandidates({ ...input, pickCount: 5 })).toContain('KOSPI:000010')
    expect(rankLowVolatilityStableCandidates({ ...input, pickCount: 5 })).toContain('KOSPI:000020')
  })

  it('classifies preferred shares by the final code character', () => {
    expect(['005930', '005935', 'KOSPI:003547', 'KOSDAQ:0130H0', 'KOSPI:159910', '097955']
      .map(isPreferredShare)).toEqual([false, true, true, false, false, true])
  })

  it('ranks stable candidates by ascending ATR, excludes constraints, and breaks ties by symbol', () => {
    const candidates = [
      feature('KOSPI:000030', { atrPercent14: 2 }),
      feature('KOSPI:000020', { atrPercent14: 1 }),
      feature('KOSPI:000010', { atrPercent14: 1 }),
      feature('KOSPI:000015', { atrPercent14: 0.5 }),
      feature('KOSPI:000040', { open: 2_000, close: 2_199.8, high: 2_250, atrPercent14: 3 }),
      feature('KOSPI:000050', { open: 2_000, close: 2_200, high: 2_250, atrPercent14: 0.1 }),
      feature('KOSPI:000060', { rsi14: 76, atrPercent14: 0.1 }),
      feature('KOSPI:000070', { atrPercent14: null }),
    ]
    const masters = new Map(candidates.map((candidate) => [candidate.symbol, master(candidate.symbol)]))
    const input = { features: candidates, masters, parameters: LOW_VOLATILITY_STABLE_PARAMETERS,
      excludeSymbols: new Set(['KOSPI:000030']), pickCount: 10 }
    expect(rankLowVolatilityStableCandidates(input)).toEqual([
      'KOSPI:000010', 'KOSPI:000020', 'KOSPI:000040',
    ])
    expect(rankLowVolatilityStableCandidates({ ...input, features: [...candidates].reverse() }))
      .toEqual(rankLowVolatilityStableCandidates(input))
  })

  it('requires both intraday and previous-close returns below the signal limit for H and J', () => {
    const gapUp = feature('KOSPI:000010', {
      open: 1_120, close: 1_130, high: 1_140, low: 1_110,
      gapFromPreviousClosePercent: 12,
    })
    const belowLimit = feature('KOSPI:000020', {
      open: 1_090, close: 1_099.9, high: 1_110, low: 1_080,
      gapFromPreviousClosePercent: 9,
    })
    const unknownGap = feature('KOSPI:000030', {
      open: 1_090, close: 1_099, high: 1_110, low: 1_080,
      gapFromPreviousClosePercent: null,
    })
    const features = [gapUp, belowLimit, unknownGap]
    const masters = new Map(features.map((candidate) => [candidate.symbol, master(candidate.symbol)]))
    expect(rankLowVolatilityStableCandidates({
      features, masters, parameters: LOW_VOLATILITY_STABLE_PARAMETERS,
      excludeSymbols: new Set(),
    })).toEqual([belowLimit.symbol])
    expect(rankSeededRandomCandidates({
      features, masters, minTurnover: LOW_VOLATILITY_STABLE_PARAMETERS.minTurnover,
      maxRsi: LOW_VOLATILITY_STABLE_PARAMETERS.maxRsi, excludePreferred: true,
      maxSignalDayReturn: LOW_VOLATILITY_STABLE_PARAMETERS.maxSignalDayReturn,
      seed: 'signal:J',
    })).toEqual([belowLimit.symbol])
  })

  it('shuffles deterministically and applies optional random constraints', () => {
    const candidates = Array.from({ length: 20 }, (_, index) => feature(`KOSPI:${String((index + 1) * 10).padStart(6, '0')}`))
    candidates.push(feature('KOSPI:000015', { atrPercent14: 0.1 }))
    candidates.push(feature('KOSPI:000220', { close: 2_200, high: 2_250 }))
    candidates.push(feature('KOSPI:000230', { rsi14: 90 }))
    const masters = new Map(candidates.map((candidate) => [candidate.symbol, master(candidate.symbol)]))
    const base = { features: candidates, masters, minTurnover: 500_000_000, maxRsi: 75,
      excludePreferred: false, seed: '2026-09-23:B', pickCount: 20 }
    const first = rankSeededRandomCandidates(base)
    expect(rankSeededRandomCandidates(base)).toEqual(first)
    expect(rankSeededRandomCandidates({ ...base, seed: '2026-09-23:J' })).not.toEqual(first)
    const constrained = rankSeededRandomCandidates({ ...base, excludePreferred: true,
      maxSignalDayReturn: 0.10, excludeSymbols: new Set([first[0]!]) })
    expect(constrained).not.toContain('KOSPI:000015')
    expect(constrained).not.toContain('KOSPI:000220')
    expect(constrained).not.toContain('KOSPI:000230')
    expect(constrained).not.toContain(first[0])
  })
  it('rejects invalid or untraded signal candles in both breakout and fill tiers', () => {
    for (const overrides of [
      { volume: 0 }, { volume: -1 }, { close: NaN }, { open: null },
      { high: 1_900 }, { low: 2_010 }, { averageTurnover20: Infinity }, { rsi14: -1 },
    ]) {
      const candidate = feature('A', { distanceFromHigh60: 1, ...overrides })
      const masters = new Map([['A', master('A')]])
      expect(passesCommonGate(candidate, masters.get('A'))).toBe(false)
      expect(rankTieredFillCandidates({
        features: [candidate], masters, parameters: PRODUCTION_VOLUME_BREAKOUT_PARAMETERS,
      })).toEqual([])
    }
  })

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

  it('excludes hard KIS warning flags while retaining soft investment caution code 01', () => {
    expect(passesCommonGate(feature('A'), master('A', {
      status_flags: { market_warning_code: ' 02 ' },
    }))).toBe(false)
    expect(passesCommonGate(feature('A'), master('A', {
      status_flags: { market_warning_code: '03' },
    }))).toBe(false)
    expect(passesCommonGate(feature('A'), master('A', {
      status_flags: { short_term_overheat_code: ' 2 ' },
    }))).toBe(false)
    expect(passesCommonGate(feature('A'), master('A', {
      status_flags: { short_term_overheat_code: '3' },
    }))).toBe(false)
    expect(passesCommonGate(feature('A'), master('A', {
      status_flags: { investment_caution: 'Y' },
    }))).toBe(false)
    expect(passesCommonGate(feature('A'), master('A', {
      status_flags: { market_warning_risk_notice: ' Y ' },
    }))).toBe(false)
    expect(passesCommonGate(feature('A'), master('A', {
      status_flags: { market_warning_code: '01' },
    }))).toBe(true)
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
