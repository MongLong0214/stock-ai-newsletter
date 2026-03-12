import { describe, expect, it } from 'vitest'
import type { ComparisonResult } from '@/lib/tli/types'
import { generateInsight, getConfidenceAlertText, shouldShowPeakEta } from './logic'

function makeComparison(overrides: Partial<ComparisonResult> = {}): ComparisonResult {
  return {
    pastTheme: overrides.pastTheme ?? 'Past Theme',
    pastThemeId: overrides.pastThemeId ?? 'past-1',
    similarity: overrides.similarity ?? 0.7,
    currentDay: overrides.currentDay ?? 10,
    pastPeakDay: overrides.pastPeakDay ?? 30,
    pastTotalDays: overrides.pastTotalDays ?? 60,
    estimatedDaysToPeak: overrides.estimatedDaysToPeak ?? 20,
    message: overrides.message ?? '',
    lifecycleCurve: overrides.lifecycleCurve ?? [],
    featureSim: overrides.featureSim ?? null,
    curveSim: overrides.curveSim ?? null,
    keywordSim: overrides.keywordSim ?? null,
    pastPeakScore: overrides.pastPeakScore ?? null,
    pastFinalStage: overrides.pastFinalStage ?? null,
    pastDeclineDays: overrides.pastDeclineDays ?? null,
    relevanceProbability: overrides.relevanceProbability ?? null,
    probabilityCiLower: overrides.probabilityCiLower ?? null,
    probabilityCiUpper: overrides.probabilityCiUpper ?? null,
    supportCount: overrides.supportCount ?? null,
    confidenceTier: overrides.confidenceTier ?? null,
    calibrationVersion: overrides.calibrationVersion ?? null,
    weightVersion: overrides.weightVersion ?? null,
    sourceSurface: overrides.sourceSurface ?? null,
  }
}

describe('comparison list logic', () => {
  it('requires at least two supporting comparisons before showing a peak ETA insight', () => {
    const insight = generateInsight([
      makeComparison({ estimatedDaysToPeak: 12, similarity: 0.75 }),
      makeComparison({ pastThemeId: 'past-2', estimatedDaysToPeak: 0, similarity: 0.72 }),
    ])

    expect(insight).not.toContain('정점까지 약')
  })

  it('shows the peak ETA alert only for pre-peak, sufficiently similar comparisons', () => {
    expect(shouldShowPeakEta(makeComparison({ similarity: 0.7, estimatedDaysToPeak: 14 }), true)).toBe(true)
    expect(shouldShowPeakEta(makeComparison({ similarity: 0.49, estimatedDaysToPeak: 14 }), true)).toBe(false)
    expect(shouldShowPeakEta(makeComparison({ similarity: 0.7, estimatedDaysToPeak: 0 }), true)).toBe(false)
    expect(shouldShowPeakEta(makeComparison({ similarity: 0.7, estimatedDaysToPeak: 14 }), false)).toBe(false)
  })

  it('returns a low-confidence alert copy when the comparison confidence tier is low', () => {
    expect(
      getConfidenceAlertText(makeComparison({
        confidenceTier: 'low',
        supportCount: 12,
      })),
    ).toContain('비교 신뢰도가 낮아요')

    expect(
      getConfidenceAlertText(makeComparison({
        confidenceTier: 'high',
        supportCount: 240,
      })),
    ).toBeNull()
  })
})
