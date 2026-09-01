import React from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ComparisonResult } from '@/lib/tli/types'
import ComparisonList from './index'

function makeComparison(overrides: Partial<ComparisonResult> = {}): ComparisonResult {
  return {
    pastTheme: '자동 후보',
    pastThemeId: 'candidate-1',
    comparisonLane: 'completed_analog',
    retrievalSurface: 'dtw_baseline',
    generationVersion: 'retrieval_spec_version:1.0',
    similarity: 1,
    currentDay: 12,
    pastPeakDay: 20,
    pastTotalDays: 35,
    observedWindowDays: 35,
    completedCycleDays: 35,
    cycleCompletionStatus: 'completed',
    isPastActive: false,
    estimatedDaysToPeak: 8,
    message: '정점까지 약 8일 추정',
    lifecycleCurve: [{ date: '2026-01-01', score: 50 }],
    featureSim: 1,
    curveSim: 1,
    keywordSim: 1,
    pastPeakScore: 80,
    pastFinalStage: 'Dormant',
    pastDeclineDays: 15,
    confidenceTier: 'high',
    ...overrides,
  }
}

describe('ComparisonList claim-safe rendering', () => {
  it('renders fallback lane copy and provenance without precision, grades, pillars, rank, or ETA', () => {
    const html = renderToStaticMarkup(
      <ComparisonList
        comparisons={[makeComparison({
          comparisonLane: 'active_peer',
          retrievalSurface: 'comparison_v2',
          generationVersion: 'algorithm_version:comparison-v4-shadow-v1',
          pastFinalStage: null,
          completedCycleDays: null,
          cycleCompletionStatus: 'observed',
          isPastActive: true,
        })]}
        comparisonSource="v2_active_peer"
        comparisonGenerationVersion="algorithm_version:comparison-v4-shadow-v1"
      />,
    )

    expect(html).toContain('자동 비교 후보')
    expect(html).toContain('복수의 수치 기반 검색 방식이 자동으로 추출한 대상입니다.')
    expect(html).toContain('업종·사업 연관성, 의미적 유사성,')
    expect(html).toContain('향후 흐름 또는 투자 성과를 검증한 결과가 아닙니다.')
    expect(html).toContain('이름순으로 최대 5개 자동 후보를 표시합니다.')
    expect(html).toContain('완결 비교선이 없어 진행 중 관측 후보를 대신 표시합니다')
    expect(html).toContain('진행 중 관측 후보 · 대체 표시')
    expect(html).toContain('comparison_v2')
    expect(html).toContain('algorithm_version:comparison-v4-shadow-v1')
    expect(html).toContain('데이터 나란히 보기')

    for (const forbidden of [
      '%',
      '매우 유사',
      '다소 비슷',
      '강함',
      '보통',
      '약함',
      '핵심 지표',
      '추세 흐름',
      '연관어',
      '정점까지',
      '종합 인사이트',
      'Top',
    ]) {
      expect(html).not.toContain(forbidden)
    }
  })

  it('separates lanes, sorts each lane by name, and caps the total at five', () => {
    const completed = ['Echo', 'Charlie', 'Alpha'].map((name) => makeComparison({
      pastTheme: name,
      pastThemeId: `completed-${name}`,
    }))
    const active = ['Foxtrot', 'Delta', 'Bravo'].map((name) => makeComparison({
      pastTheme: name,
      pastThemeId: `active-${name}`,
      comparisonLane: 'active_peer',
      retrievalSurface: 'price_volume_knn',
      pastFinalStage: null,
      completedCycleDays: null,
      cycleCompletionStatus: 'observed',
      isPastActive: true,
    }))

    const html = renderToStaticMarkup(
      <ComparisonList
        comparisons={[...completed, ...active]}
        comparisonSource="analog"
        comparisonGenerationVersion="retrieval_spec_version:1.0"
      />,
    )

    expect(html).toContain('완결 관측 후보')
    expect(html).toContain('진행 중 관측 후보')
    expect(html).not.toContain('대체 표시')
    expect(html.indexOf('Alpha')).toBeLessThan(html.indexOf('Charlie'))
    expect(html.indexOf('Charlie')).toBeLessThan(html.indexOf('Echo'))
    expect(html.indexOf('Bravo')).toBeLessThan(html.indexOf('Delta'))
    expect(html).not.toContain('Foxtrot')
    expect(html).toContain('표시 5')
  })
})
