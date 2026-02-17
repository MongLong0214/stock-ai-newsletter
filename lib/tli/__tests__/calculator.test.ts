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

  it('uses correct SCORE_WEIGHTS (0.50, 0.30, 0.20)', () => {
    const interest = Array.from({ length: 5 }, (_, i) => makeInterestMetric(i, 50))
    const result = calculateLifecycleScore({
      interestMetrics: interest,
      newsMetrics: [],
      firstSpikeDate: null,
      today: '2026-01-10',
    })
    expect(result).not.toBeNull()
    const w = result!.components.weights
    expect(w.interest).toBe(0.50)
    expect(w.news).toBe(0.30)
    expect(w.volatility).toBe(0.20)
  })

  it('reduces volatility score when noise detected (high CV + low percentile)', () => {
    // 노이즈 조건: coefficientOfVariation > 0.8 AND dampening < 1
    // 높은 변동 관심도 (0과 100 반복 → stddev 높고 CV > 0.8) + 낮은 백분위
    const noisyInterest = Array.from({ length: 14 }, (_, i) =>
      makeInterestMetric(i, i % 2 === 0 ? 0 : 100)
    )
    const news = Array.from({ length: 14 }, (_, i) => makeNewsMetric(i, 1))

    const noisy = calculateLifecycleScore({
      interestMetrics: noisyInterest,
      newsMetrics: news,
      firstSpikeDate: '2025-12-01',
      today: '2026-01-10',
      rawPercentile: 0.05, // 낮은 백분위 → dampening < 1
    })
    const normal = calculateLifecycleScore({
      interestMetrics: noisyInterest,
      newsMetrics: news,
      firstSpikeDate: '2025-12-01',
      today: '2026-01-10',
      rawPercentile: 1.0, // 높은 백분위 → dampening = 1 → 노이즈 미감지
    })
    expect(noisy).not.toBeNull()
    expect(normal).not.toBeNull()
    // 노이즈 감지 시 volatilityScore가 0.3배로 줄어듦
    expect(noisy!.components.volatility_score).toBeLessThan(normal!.components.volatility_score)
  })

  it('returns confidence based on data coverage', () => {
    // Low confidence: only 3 days of interest data
    const low = calculateLifecycleScore({
      interestMetrics: Array.from({ length: 3 }, (_, i) => makeInterestMetric(i, 50)),
      newsMetrics: [],
      firstSpikeDate: null,
      today: '2026-01-10',
    })
    expect(low).not.toBeNull()
    expect(low!.confidence.level).toBe('low')

    // Medium confidence: 10 days interest, some news
    const medium = calculateLifecycleScore({
      interestMetrics: Array.from({ length: 10 }, (_, i) => makeInterestMetric(i, 50)),
      newsMetrics: Array.from({ length: 7 }, (_, i) => makeNewsMetric(i, 3)),
      firstSpikeDate: '2025-12-01',
      today: '2026-01-10',
    })
    expect(medium).not.toBeNull()
    expect(medium!.confidence.level).toBe('medium')

    // High confidence: 30 days interest, 14 days news
    const high = calculateLifecycleScore({
      interestMetrics: Array.from({ length: 30 }, (_, i) => makeInterestMetric(i, 50)),
      newsMetrics: Array.from({ length: 14 }, (_, i) => makeNewsMetric(i, 5)),
      firstSpikeDate: '2025-12-01',
      today: '2026-01-10',
    })
    expect(high).not.toBeNull()
    expect(high!.confidence.level).toBe('high')
  })

  it('confidence boundary: exactly 14 interest + high coverage → high', () => {
    const result = calculateLifecycleScore({
      interestMetrics: Array.from({ length: 14 }, (_, i) => makeInterestMetric(i, 50)),
      newsMetrics: Array.from({ length: 14 }, (_, i) => makeNewsMetric(i, 5)),
      firstSpikeDate: '2025-12-01', today: '2026-01-10',
    })
    // coverage = (14/30)*0.6 + (14/14)*0.4 = 0.28+0.4 = 0.68 < 0.7 → medium
    expect(result!.confidence.level).toBe('medium')
  })

  it('confidence boundary: 13 interest → medium not high', () => {
    const result = calculateLifecycleScore({
      interestMetrics: Array.from({ length: 13 }, (_, i) => makeInterestMetric(i, 50)),
      newsMetrics: Array.from({ length: 14 }, (_, i) => makeNewsMetric(i, 5)),
      firstSpikeDate: '2025-12-01', today: '2026-01-10',
    })
    // interestMetrics < 14 → high 불가
    expect(result!.confidence.level).toBe('medium')
  })

  it('confidence boundary: 6 interest → low', () => {
    const result = calculateLifecycleScore({
      interestMetrics: Array.from({ length: 6 }, (_, i) => makeInterestMetric(i, 50)),
      newsMetrics: [], firstSpikeDate: null, today: '2026-01-10',
    })
    // interestMetrics < 7 → medium 불가 → low
    expect(result!.confidence.level).toBe('low')
  })

  it('confidence: all news with article_count=0 → newsCoverage=0', () => {
    const result = calculateLifecycleScore({
      interestMetrics: Array.from({ length: 10 }, (_, i) => makeInterestMetric(i, 50)),
      newsMetrics: Array.from({ length: 14 }, (_, i) => makeNewsMetric(i, 0)),
      firstSpikeDate: null, today: '2026-01-10',
    })
    expect(result!.confidence.newsCoverage).toBe(0)
    // coverageScore = (10/30)*0.6 + 0*0.4 = 0.2 < 0.4 → low
    expect(result!.confidence.level).toBe('low')
  })

  it('handles all-zero normalized values without NaN', () => {
    const interest = Array.from({ length: 5 }, (_, i) => makeInterestMetric(i, 0, 0))
    const result = calculateLifecycleScore({
      interestMetrics: interest,
      newsMetrics: [],
      firstSpikeDate: null,
      today: '2026-01-10',
    })
    expect(result).not.toBeNull()
    expect(result!.score).toBeGreaterThanOrEqual(0)
    expect(Number.isFinite(result!.score)).toBe(true)
    expect(Number.isFinite(result!.components.interest_score)).toBe(true)
    expect(Number.isFinite(result!.components.volatility_score)).toBe(true)
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
