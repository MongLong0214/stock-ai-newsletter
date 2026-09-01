import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ComparisonResult } from '@/lib/tli/types'
import ComparisonCard from './comparison-card'

Object.assign(globalThis, { React })

function makeComparison(): ComparisonResult {
  return {
    pastTheme: '과거 테마',
    pastThemeId: 'past-1',
    comparisonLane: 'completed_analog',
    similarity: 0.999,
    currentDay: 2,
    pastPeakDay: 5,
    pastTotalDays: 10,
    observedWindowDays: 10,
    completedCycleDays: 10,
    cycleCompletionStatus: 'completed',
    isPastActive: false,
    estimatedDaysToPeak: 3,
    message: '수치 기반 비교. 과거 위치 분석',
    lifecycleCurve: [],
    featureSim: 0.41,
    curveSim: 0.52,
    keywordSim: 0.63,
    pastPeakScore: 82,
    pastFinalStage: 'Dormant',
    pastDeclineDays: 5,
  }
}

describe('ComparisonCard', () => {
  it('백분율·등급·정점 ETA·pillar bar를 렌더하지 않고 lane 배지는 유지한다', () => {
    const html = renderToStaticMarkup(
      <ComparisonCard
        comp={makeComparison()}
        idx={0}
        isSelected={false}
        onToggle={() => {}}
      />,
    )

    expect(html).not.toContain('99%')
    expect(html).not.toContain('종합 유사도')
    expect(html).not.toContain('매우 유사')
    expect(html).not.toContain('과거 패턴 기준, 정점까지 약')
    expect(html).not.toContain('핵심 지표')
    expect(html).not.toContain('추세 흐름')
    expect(html).not.toContain('연관어')
    expect(html).toContain('완결 아날로그')
  })
})
