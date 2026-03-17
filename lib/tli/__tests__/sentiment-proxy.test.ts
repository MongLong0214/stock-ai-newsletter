import { describe, it, expect } from 'vitest'
import { computeSentimentProxy } from '../sentiment-proxy'
import type { TLIParams } from '@/lib/tli/constants/tli-params'

describe('computeSentimentProxy', () => {
  it('returns ~0.5 for neutral inputs', () => {
    const result = computeSentimentProxy({
      avgPriceChangePct: 0,
      newsThisWeek: 10,
      newsLastWeek: 10,
      avgVolume: 1000000,
    })
    expect(result).toBeGreaterThan(0.4)
    expect(result).toBeLessThan(0.6)
  })

  it('returns > 0.5 for bullish signals', () => {
    const result = computeSentimentProxy({
      avgPriceChangePct: 5,
      newsThisWeek: 20,
      newsLastWeek: 10,
      avgVolume: 2000000,
      prevAvgVolume: 1000000,
    })
    expect(result).toBeGreaterThan(0.5)
  })

  it('returns < 0.5 for bearish signals', () => {
    const result = computeSentimentProxy({
      avgPriceChangePct: -5,
      newsThisWeek: 5,
      newsLastWeek: 20,
      avgVolume: 2000000,
      prevAvgVolume: 1000000,
    })
    expect(result).toBeLessThan(0.5)
  })

  it('returns ~0.5 when news baseline insufficient', () => {
    const result = computeSentimentProxy({
      avgPriceChangePct: 0,
      newsThisWeek: 5,
      newsLastWeek: 2, // < 3 → neutral
      avgVolume: 0,
    })
    expect(result).toBeGreaterThan(0.4)
    expect(result).toBeLessThan(0.6)
  })

  it('is always in [0, 1] range', () => {
    const extremeCases = [
      { avgPriceChangePct: 100, newsThisWeek: 1000, newsLastWeek: 1, avgVolume: 1e12, prevAvgVolume: 1 },
      { avgPriceChangePct: -100, newsThisWeek: 0, newsLastWeek: 1000, avgVolume: 1, prevAvgVolume: 1e12 },
    ]
    for (const input of extremeCases) {
      const result = computeSentimentProxy(input)
      expect(result).toBeGreaterThanOrEqual(0)
      expect(result).toBeLessThanOrEqual(1)
    }
  })

  it('detects bearish divergence (high volume + negative price)', () => {
    const bearishDiv = computeSentimentProxy({
      avgPriceChangePct: -3,
      newsThisWeek: 10,
      newsLastWeek: 10,
      avgVolume: 5000000,
      prevAvgVolume: 1000000,
    })
    const neutral = computeSentimentProxy({
      avgPriceChangePct: -3,
      newsThisWeek: 10,
      newsLastWeek: 10,
      avgVolume: 1000000,
      prevAvgVolume: 1000000,
    })
    // Bearish divergence should give lower sentiment
    expect(bearishDiv).toBeLessThan(neutral)
  })

  it('with custom weights: price=0.70 shifts result toward price signal', () => {
    const config: Partial<TLIParams> = { sent_price_weight: 0.70, sent_news_weight: 0.20 }
    const input = {
      avgPriceChangePct: 5,
      newsThisWeek: 5,
      newsLastWeek: 20,
      avgVolume: 1000000,
      prevAvgVolume: 1000000,
    }

    const defaultResult = computeSentimentProxy(input)
    const customResult = computeSentimentProxy(input, config)

    // price is bullish (+5%), news is bearish (decline from 20 to 5)
    // With price weight 0.70 (vs default 0.50), result should be more bullish
    expect(customResult).toBeGreaterThan(defaultResult)
  })
})
