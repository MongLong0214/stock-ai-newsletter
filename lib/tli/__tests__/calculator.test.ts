import { describe, it, expect } from 'vitest'
import { calculateLifecycleScore } from '@/lib/tli/calculator'
import type { InterestMetric, NewsMetric } from '@/lib/tli/types'

function makeInterestMetric(day: number, normalized: number, rawValue = 50): InterestMetric {
  return {
    id: `im-${day}`,
    theme_id: 't-1',
    time: `2026-01-${String(day + 1).padStart(2, '0')}`,
    source: 'naver',
    raw_value: rawValue,
    normalized,
  }
}

function makeNewsMetric(day: number, articleCount: number): NewsMetric {
  return {
    id: `nm-${day}`,
    theme_id: 't-1',
    time: `2026-01-${String(day + 1).padStart(2, '0')}`,
    article_count: articleCount,
    growth_rate: null,
  }
}

describe('calculateLifecycleScore', () => {
  it('returns null when interest metrics < MIN_INTEREST_DAYS (3)', () => {
    const result = calculateLifecycleScore({
      interestMetrics: [makeInterestMetric(0, 50), makeInterestMetric(1, 50)],
      newsMetrics: [],
      firstSpikeDate: null,
    })
    expect(result).toBeNull()
  })

  it('returns a score object with exactly 3 interest metrics', () => {
    const result = calculateLifecycleScore({
      interestMetrics: Array.from({ length: 3 }, (_, i) => makeInterestMetric(i, 50)),
      newsMetrics: [],
      firstSpikeDate: null,
      today: '2026-01-10',
    })
    expect(result).not.toBeNull()
    expect(result!.score).toBeGreaterThanOrEqual(0)
    expect(result!.score).toBeLessThanOrEqual(100)
  })

  it('score is clamped to [0, 100]', () => {
    // 높은 관심도 비율 + 전 컴포넌트 고점 → 100으로 클램핑
    const interest = [
      ...Array.from({ length: 7 }, (_, i) => makeInterestMetric(i, 90)),
      ...Array.from({ length: 23 }, (_, i) => makeInterestMetric(i + 7, 10)),
    ]
    const news = [
      ...Array.from({ length: 7 }, (_, i) => makeNewsMetric(i, 20)),
      ...Array.from({ length: 7 }, (_, i) => makeNewsMetric(i + 7, 1)),
    ]
    const result = calculateLifecycleScore({
      interestMetrics: interest,
      newsMetrics: news,
      firstSpikeDate: '2025-10-01',
      today: '2026-01-10',
      sentimentScores: [0.8, 0.9, 1.0],
    })
    expect(result).not.toBeNull()
    expect(result!.score).toBeLessThanOrEqual(100)
    expect(result!.score).toBeGreaterThanOrEqual(0)
  })

  it('applies percentile dampening for low rawPercentile', () => {
    const interest = Array.from({ length: 10 }, (_, i) => makeInterestMetric(i, 50))
    const news = Array.from({ length: 14 }, (_, i) => makeNewsMetric(i, 5))

    const withoutDampening = calculateLifecycleScore({
      interestMetrics: interest,
      newsMetrics: news,
      firstSpikeDate: '2025-12-01',
      today: '2026-01-10',
      rawPercentile: 1.0,
    })
    const withDampening = calculateLifecycleScore({
      interestMetrics: interest,
      newsMetrics: news,
      firstSpikeDate: '2025-12-01',
      today: '2026-01-10',
      rawPercentile: 0.05,
    })
    expect(withoutDampening).not.toBeNull()
    expect(withDampening).not.toBeNull()
    expect(withDampening!.score).toBeLessThanOrEqual(withoutDampening!.score)
  })

  it('computes news momentum from week-over-week growth', () => {
    const interest = Array.from({ length: 10 }, (_, i) => makeInterestMetric(i, 50))
    // This week: 10/day, last week: 2/day → growth = (70-14)/14 = 4.0
    const news = [
      ...Array.from({ length: 7 }, (_, i) => makeNewsMetric(i, 10)),
      ...Array.from({ length: 7 }, (_, i) => makeNewsMetric(i + 7, 2)),
    ]
    const result = calculateLifecycleScore({
      interestMetrics: interest,
      newsMetrics: news,
      firstSpikeDate: '2025-12-01',
      today: '2026-01-10',
    })
    expect(result).not.toBeNull()
    expect(result!.components.news_momentum).toBeGreaterThan(0)
  })

  it('uses fallback news momentum when no last week data', () => {
    const interest = Array.from({ length: 10 }, (_, i) => makeInterestMetric(i, 50))
    // 이번 주 뉴스만 존재, 지난 주 없음 → 폴백 공식
    const news = Array.from({ length: 7 }, (_, i) => makeNewsMetric(i, 3))

    const result = calculateLifecycleScore({
      interestMetrics: interest,
      newsMetrics: news,
      firstSpikeDate: null,
      today: '2026-01-10',
    })
    expect(result).not.toBeNull()
    // 폴백: normalize(newsThisWeek=21, 0, 15) * 0.5 → 최대 0.5
    expect(result!.components.news_momentum).toBeGreaterThan(0)
    expect(result!.components.news_momentum).toBeLessThanOrEqual(0.5)
  })

  it('returns 0.5 sentiment when no sentiment data', () => {
    const interest = Array.from({ length: 5 }, (_, i) => makeInterestMetric(i, 50))
    const result = calculateLifecycleScore({
      interestMetrics: interest,
      newsMetrics: [],
      firstSpikeDate: null,
      today: '2026-01-10',
    })
    expect(result).not.toBeNull()
    expect(result!.components.sentiment_score).toBe(0.5)
  })

  it('uses correct SCORE_WEIGHTS (0.40, 0.25, 0.20, 0.15)', () => {
    const interest = Array.from({ length: 5 }, (_, i) => makeInterestMetric(i, 50))
    const result = calculateLifecycleScore({
      interestMetrics: interest,
      newsMetrics: [],
      firstSpikeDate: null,
      today: '2026-01-10',
    })
    expect(result).not.toBeNull()
    const w = result!.components.weights
    expect(w.interest).toBe(0.4)
    expect(w.news).toBe(0.25)
    expect(w.sentiment).toBe(0.2)
    expect(w.volatility).toBe(0.15)
  })

  it('includes maturity_ratio from firstSpikeDate', () => {
    const interest = Array.from({ length: 5 }, (_, i) => makeInterestMetric(i, 50))
    const result = calculateLifecycleScore({
      interestMetrics: interest,
      newsMetrics: [],
      firstSpikeDate: '2025-10-01',
      today: '2026-01-10',
    })
    expect(result).not.toBeNull()
    // 101 days / 90 = ~1.12
    expect(result!.components.maturity_ratio).toBeGreaterThan(1)
    expect(result!.components.maturity_ratio).toBeLessThanOrEqual(1.5)
  })
})
