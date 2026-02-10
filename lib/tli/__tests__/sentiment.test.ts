import { describe, it, expect } from 'vitest'
import { analyzeSentiment, aggregateSentiment } from '@/lib/tli/sentiment'

describe('analyzeSentiment', () => {
  it('detects positive keywords', () => {
    const result = analyzeSentiment('삼성전자 급등 신고가 돌파')
    expect(result.positive).toBeGreaterThanOrEqual(2)
    expect(result.negative).toBe(0)
    expect(result.label).toBe('긍정')
    expect(result.score).toBeGreaterThan(0.1)
  })

  it('detects negative keywords', () => {
    const result = analyzeSentiment('반도체 급락 위기 폭락')
    expect(result.negative).toBeGreaterThanOrEqual(2)
    expect(result.positive).toBe(0)
    expect(result.label).toBe('부정')
    expect(result.score).toBeLessThan(-0.1)
  })

  it('returns neutral for no keywords', () => {
    const result = analyzeSentiment('오늘 날씨가 좋습니다')
    expect(result.score).toBe(0)
    expect(result.label).toBe('중립')
  })

  it('handles mixed positive and negative', () => {
    // 1 positive (급등), 1 negative (급락) → score = 0 → 중립
    const result = analyzeSentiment('급등 후 급락')
    expect(result.positive).toBe(1)
    expect(result.negative).toBe(1)
    expect(result.label).toBe('중립')
  })

  it('handles empty string', () => {
    const result = analyzeSentiment('')
    expect(result.score).toBe(0)
    expect(result.label).toBe('중립')
  })
})

describe('aggregateSentiment', () => {
  it('returns neutral defaults for empty array', () => {
    const result = aggregateSentiment([])
    expect(result.average).toBe(0)
    expect(result.normalized).toBe(0)
    expect(result.label).toBe('중립')
  })

  it('normalizes positive scores to [0, 1]', () => {
    // average = 0.5, normalized = (0.5 + 1) / 2 = 0.75
    const result = aggregateSentiment([0.5, 0.5])
    expect(result.average).toBe(0.5)
    expect(result.normalized).toBe(0.75)
    expect(result.label).toBe('긍정')
  })

  it('normalizes negative scores', () => {
    // average = -0.5, normalized = (-0.5 + 1) / 2 = 0.25
    const result = aggregateSentiment([-0.5, -0.5])
    expect(result.average).toBe(-0.5)
    expect(result.normalized).toBe(0.25)
    expect(result.label).toBe('부정')
  })

  it('labels near-zero as neutral', () => {
    const result = aggregateSentiment([0.05, -0.05])
    expect(result.average).toBe(0)
    expect(result.label).toBe('중립')
  })

  it('handles extreme values', () => {
    const result = aggregateSentiment([1, 1, 1])
    expect(result.average).toBe(1)
    expect(result.normalized).toBe(1)
    expect(result.label).toBe('긍정')
  })
})
