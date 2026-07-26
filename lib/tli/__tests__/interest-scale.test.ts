import { describe, expect, it } from 'vitest'

import { calculateLifecycleScore } from '@/lib/tli/calculator'
import { MIN_ANCHOR_INTEREST } from '@/lib/tli/constants/score-config'
import { resolveInterestLevel, resolveRunInterestScale } from '@/lib/tli/interest-scale'
import type { InterestMetric, NewsMetric } from '@/lib/tli/types/db'

/**
 * 앵커(`계산기`) 투입 이후 raw_value가 정수 반올림으로 해상도를 잃은 구간을 재현한다.
 * ratio 0.4~1.4 → round() → 0 또는 1. 실측 중앙값 테마의 모습이다.
 */
const anchorEraMetric = (index: number, ratio: number): InterestMetric => ({
  id: `m${index}`,
  theme_id: 'theme-a',
  time: `2026-07-${String(24 - index).padStart(2, '0')}`,
  source: 'naver_datalab',
  raw_value: Math.round(ratio),
  normalized: 50,
  anchor_scaled_value: ratio / 79,
})

const rawEraMetric = (index: number, raw: number): InterestMetric => ({
  id: `m${index}`,
  theme_id: 'theme-a',
  time: `2026-06-${String(6 - index).padStart(2, '0')}`,
  source: 'naver_datalab',
  raw_value: raw,
  normalized: 50,
  anchor_scaled_value: null,
})

const news: NewsMetric[] = Array.from({ length: 14 }, (_, i) => ({
  id: `n${i}`,
  theme_id: 'theme-a',
  time: `2026-07-${String(24 - i).padStart(2, '0')}`,
  article_count: 5,
  growth_rate: null,
}))

/** ratio 합 6.1 / 7일 = 0.8714…  — 반올림하면 0,1,1,1,1,1,1 → 6/7 = 0.8571… */
const RATIOS = [0.4, 1.4, 0.6, 1.2, 0.5, 1.3, 0.7] as const
const RATIO_MEAN = RATIOS.reduce((a, b) => a + b, 0) / RATIOS.length
const ROUNDED_MEAN = RATIOS.map(Math.round).reduce((a, b) => a + b, 0) / RATIOS.length

describe('resolveInterestLevel — 척도별 절대 수준', () => {
  const window = RATIOS.map((ratio, i) => anchorEraMetric(i, ratio))

  it('raw 척도에서는 반올림된 정수 평균이 나온다', () => {
    // 0.4는 0으로, 1.4는 1로 뭉개진다 — 3.5배 차이가 사라진다
    expect(resolveInterestLevel(window, 'raw')).toBeCloseTo(ROUNDED_MEAN, 10)
    expect(ROUNDED_MEAN).not.toBeCloseTo(RATIO_MEAN, 3)
  })

  it('앵커 척도는 반올림 전 실수를 보존한다', () => {
    const level = resolveInterestLevel(window, 'anchor')
    expect(level).not.toBeNull()
    expect(level!).toBeCloseTo(RATIO_MEAN / 79, 10)
  })

  it('해당 척도의 관측이 없으면 null — 다른 척도 값으로 대체하지 않는다', () => {
    expect(resolveInterestLevel([rawEraMetric(0, 20)], 'anchor')).toBeNull()
  })
})

describe('resolveRunInterestScale — 런 단위 확정', () => {
  const anchorWindow = [0.4, 1.4, 0.6].map((r, i) => anchorEraMetric(i, r))
  const rawWindow = [20, 22, 24].map((r, i) => rawEraMetric(i, r))

  it('과반이 앵커를 갖추면 앵커 척도', () => {
    expect(resolveRunInterestScale([anchorWindow, anchorWindow, rawWindow])).toBe('anchor')
  })

  it('앵커 적재 이전 구간을 재계산하면 raw 척도로 남는다', () => {
    expect(resolveRunInterestScale([rawWindow, rawWindow, anchorWindow])).toBe('raw')
  })

  it('테마가 없으면 raw 척도 (기존 동작)', () => {
    expect(resolveRunInterestScale([])).toBe('raw')
  })
})

describe('calculateLifecycleScore — 앵커 이후 감쇠 폭주 회귀', () => {
  const metrics = RATIOS.map((r, i) => anchorEraMetric(i, r))

  it('raw 척도로 매기면 감쇠가 min_raw_interest(4) 대비 1/5 수준으로 떨어진다', () => {
    const result = calculateLifecycleScore({
      interestMetrics: metrics,
      newsMetrics: news,
      firstSpikeDate: '2026-06-01',
      today: '2026-07-24',
      allThemesRawAvg: [0, 1, 2, 3, 4],
      interestScale: 'raw',
    })

    expect(result).not.toBeNull()
    expect(result!.components.raw.dampening_factor).toBeCloseTo(ROUNDED_MEAN / 4, 10)
    expect(result!.components.raw.dampening_factor).toBeLessThan(0.25)
    expect(result!.components.raw.interest_scale).toBe('raw')
  })

  it('앵커 척도로 매기면 같은 테마가 감쇠를 받지 않는다', () => {
    // 0.8714/79 ≈ 0.011 > MIN_ANCHOR_INTEREST(0.003)
    const level = resolveInterestLevel(metrics, 'anchor')!
    expect(level).toBeGreaterThan(MIN_ANCHOR_INTEREST)

    const result = calculateLifecycleScore({
      interestMetrics: metrics,
      newsMetrics: news,
      firstSpikeDate: '2026-06-01',
      today: '2026-07-24',
      allThemesRawAvg: [0.001, 0.003, 0.006, 0.018, 0.058],
      interestScale: 'anchor',
    })

    expect(result).not.toBeNull()
    expect(result!.components.raw.dampening_factor).toBe(1)
    expect(result!.components.raw.interest_scale).toBe('anchor')
  })

  it('앵커 척도에서도 진짜 바닥 테마는 여전히 감쇠된다', () => {
    const dead = [0.05, 0.02, 0.03, 0.04, 0.02, 0.03, 0.05].map((r, i) => anchorEraMetric(i, r))

    const result = calculateLifecycleScore({
      interestMetrics: dead,
      newsMetrics: news,
      firstSpikeDate: '2026-06-01',
      today: '2026-07-24',
      allThemesRawAvg: [0.001, 0.003, 0.006, 0.018, 0.058],
      interestScale: 'anchor',
    })

    expect(result!.components.raw.dampening_factor).toBeLessThan(1)
  })

  it('interestScale 미지정 시 기존 raw 동작을 유지한다', () => {
    const result = calculateLifecycleScore({
      interestMetrics: metrics,
      newsMetrics: news,
      firstSpikeDate: '2026-06-01',
      today: '2026-07-24',
      allThemesRawAvg: [0, 1, 2, 3, 4],
    })

    expect(result!.components.raw.interest_scale).toBe('raw')
  })
})
