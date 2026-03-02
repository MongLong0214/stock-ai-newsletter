import { describe, it, expect } from 'vitest'
import { computeSentimentProxy } from '../sentiment-proxy'

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
})
