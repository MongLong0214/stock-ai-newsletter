import { describe, expect, it } from 'vitest'
import type { ComparisonResult } from '@/lib/tli/types/api'
import {
  generateInsight,
  getComparisonPositionText,
  getIndependentFlowAlertText,
  shouldShowIndependentFlowAlert,
} from './logic'

function makeComparison(overrides: Partial<ComparisonResult> = {}): ComparisonResult {
  return {
    pastTheme: '과거 테마',
    pastThemeId: 'past-1',
    similarity: 0.8,
    currentDay: 41,
    pastPeakDay: 15,
    pastTotalDays: 40,
    estimatedDaysToPeak: 0,
    message: 'sample',
    lifecycleCurve: [],
    featureSim: 0.7,
    curveSim: 0.8,
    keywordSim: 0.1,
    pastPeakScore: 82,
    pastFinalStage: null,
    pastDeclineDays: null,
    observedWindowDays: 40,
    completedCycleDays: null,
    cycleCompletionStatus: 'observed',
    isPastActive: true,
    comparisonLane: 'active_peer',
    ...overrides,
  }
}

describe('comparison list interpretation', () => {
  it('does not show independent-flow alert for observed-only analogs', () => {
    const comparison = makeComparison()

    expect(shouldShowIndependentFlowAlert(comparison)).toBe(false)
    expect(getIndependentFlowAlertText(comparison)).toBeNull()
  })

  it('shows independent-flow alert only for completed cycles beyond the completed duration', () => {
    const comparison = makeComparison({
      pastFinalStage: 'Dormant',
      pastDeclineDays: 25,
      completedCycleDays: 40,
      cycleCompletionStatus: 'completed',
      isPastActive: false,
    })

    expect(shouldShowIndependentFlowAlert(comparison)).toBe(true)
    expect(getIndependentFlowAlertText(comparison)).toContain('완결 주기')
  })

  it('does not show independent-flow alert when current progress is still within the completed cycle', () => {
    const comparison = makeComparison({
      currentDay: 31,
      pastFinalStage: 'Dormant',
      pastDeclineDays: 25,
      completedCycleDays: 40,
      cycleCompletionStatus: 'completed',
      isPastActive: false,
    })

    expect(shouldShowIndependentFlowAlert(comparison)).toBe(false)
  })

  it('uses observational wording for active analogs even when they exceed the observed window', () => {
    const comparison = makeComparison()

    expect(getComparisonPositionText(comparison)).toContain('현재 관측 구간')
    expect(getComparisonPositionText(comparison)).not.toContain('쇠퇴')
  })

  it('reports completed analog dominance separately from active peers in the insight text', () => {
    const text = generateInsight([
      makeComparison({
        similarity: 0.82,
        pastFinalStage: 'Dormant',
        pastDeclineDays: 20,
        completedCycleDays: 40,
        cycleCompletionStatus: 'completed',
        isPastActive: false,
        comparisonLane: 'completed_analog',
      }),
      makeComparison({
        similarity: 0.79,
        pastFinalStage: 'Dormant',
        pastDeclineDays: 18,
        completedCycleDays: 38,
        cycleCompletionStatus: 'completed',
        isPastActive: false,
        comparisonLane: 'completed_analog',
      }),
      makeComparison({
        similarity: 0.91,
        comparisonLane: 'active_peer',
      }),
    ])

    expect(text).toContain('완결 아날로그')
    expect(text).toContain('활성 피어')
  })
})
