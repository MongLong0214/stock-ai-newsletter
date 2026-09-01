import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { ComparisonResult, ThemeDetail } from '@/lib/tli/types'
import ComparisonWorkspace from './comparison-workspace'
import MetricGrid from './detail-header/metric-grid'

Object.assign(globalThis, { React })

vi.mock('@/components/tli/lifecycle-curve', () => ({
  default: ({
    currentLabel,
    comparisonData,
  }: {
    currentLabel: string
    comparisonData?: unknown
  }) => (
    <div
      data-current-label={currentLabel}
      data-has-comparison={comparisonData === undefined ? 'false' : 'true'}
    >
      LifecycleCurve
    </div>
  ),
}))

function makeComparison(): ComparisonResult {
  return {
    pastTheme: '무선충전기술',
    pastThemeId: 'past-1',
    comparisonLane: 'completed_analog',
    similarity: 1,
    currentDay: 2,
    pastPeakDay: 5,
    pastTotalDays: 10,
    estimatedDaysToPeak: 3,
    message: '비교 메시지',
    lifecycleCurve: [{ date: '2026-08-31', score: 100 }],
    featureSim: 1,
    curveSim: 1,
    keywordSim: 1,
    pastPeakScore: 100,
    pastFinalStage: 'Dormant',
    pastDeclineDays: 5,
  }
}

function makeTheme(): ThemeDetail {
  return {
    id: 'theme-1',
    name: '희귀금속',
    nameEn: null,
    description: null,
    firstSpikeDate: '2026-08-01',
    keywords: [],
    score: {
      value: 75,
      stage: 'Growth',
      stageKo: '성장',
      updatedAt: '2026-09-01T00:00:00.000Z',
      change24h: 1.2,
      change7d: 4.5,
      isReigniting: false,
      components: {
        interest: 0.7,
        newsMomentum: 0.6,
        volatility: 0.5,
      },
      raw: null,
      confidence: null,
    },
    stockCount: 3,
    stocks: [],
    newsCount: 4,
    recentNews: [],
    comparisons: [makeComparison()],
    lifecycleCurve: [{ date: '2026-09-01', score: 75 }],
    newsTimeline: [],
    interestTimeline: [],
  }
}

describe('comparison feature sunset', () => {
  it('renders the lifecycle curve without comparison selection UI or an overlay', () => {
    const html = renderToStaticMarkup(
      <ComparisonWorkspace
        themeName="희귀금속"
        currentData={[
          { date: '2026-08-31', score: 70 },
          { date: '2026-09-01', score: 75 },
        ]}
        newsTimeline={[{ date: '2026-09-01', count: 4 }]}
        interestTimeline={[{ date: '2026-09-01', value: 75 }]}
        shouldReduceMotion
      />,
    )

    expect(html).toContain('LifecycleCurve')
    expect(html).toContain('data-current-label="희귀금속 (현재)"')
    expect(html).toContain('data-has-comparison="false"')
    expect(html).not.toContain('유사 패턴')
    expect(html).not.toContain('유사도')
    expect(html).not.toContain('비교선')
  })

  it('does not render a similar-pattern metric when comparisons exist in the response', () => {
    const html = renderToStaticMarkup(<MetricGrid theme={makeTheme()} themeAge={31} />)

    expect(html).toContain('관련 종목')
    expect(html).toContain('뉴스')
    expect(html).not.toContain('유사 패턴')
    expect(html).not.toContain('100%')
  })
})
