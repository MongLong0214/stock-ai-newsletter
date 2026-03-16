import { describe, expect, it } from 'vitest'
import { buildThemeDetailResponse } from './build-response'
import type { ComparisonResult } from '@/lib/tli/types/api'

describe('buildThemeDetailResponse', () => {
  it('preserves level4 comparison metadata in the ThemeDetail payload', () => {
    const comparison: ComparisonResult = {
      pastTheme: 'Past Theme',
      pastThemeId: 'past-1',
      similarity: 0.73,
      currentDay: 12,
      pastPeakDay: 20,
      pastTotalDays: 35,
      estimatedDaysToPeak: 8,
      message: 'sample',
      lifecycleCurve: [{ date: '2026-01-01', score: 50 }],
      featureSim: 0.5,
      curveSim: 0.7,
      keywordSim: 0.1,
      pastPeakScore: 82,
      pastFinalStage: 'Decline',
      pastDeclineDays: 9,
      relevanceProbability: 0.18,
      probabilityCiLower: 0.13,
      probabilityCiUpper: 0.23,
      supportCount: 220,
      confidenceTier: 'medium',
      calibrationVersion: 'cal-2026-03-12',
      weightVersion: 'w-2026-03-12',
      sourceSurface: 'v2_certification',
    }

    const result = buildThemeDetailResponse({
      theme: {
        id: 'theme-1',
        name: 'Theme 1',
        name_en: null,
        description: null,
        first_spike_date: '2026-01-01',
      },
      latestScore: null,
      dayAgoScore: null,
      weekAgoScore: null,
      stockCount: 0,
      stocks: [],
      newsCount: 0,
      newsArticles: [],
      keywords: [],
      comparisonResults: [comparison],
      allScores: [],
      newsList: [],
      interestList: [],
    })

    expect(result.comparisons[0]).toMatchObject({
      relevanceProbability: 0.18,
      probabilityCiLower: 0.13,
      probabilityCiUpper: 0.23,
      supportCount: 220,
      confidenceTier: 'medium',
      calibrationVersion: 'cal-2026-03-12',
      weightVersion: 'w-2026-03-12',
      sourceSurface: 'v2_certification',
    })
  })

  it('includes forecast, analog evidence, and control-plane metadata when present', () => {
    const result = buildThemeDetailResponse({
      theme: {
        id: 'theme-1',
        name: 'Theme 1',
        name_en: null,
        description: null,
        first_spike_date: '2026-01-01',
      },
      latestScore: null,
      dayAgoScore: null,
      weekAgoScore: null,
      stockCount: 0,
      stocks: [],
      newsCount: 0,
      newsArticles: [],
      keywords: [],
      comparisonResults: [],
      allScores: [],
      newsList: [],
      interestList: [],
      forecast: {
        probabilities: { 5: 0.22, 10: 0.54, 20: 0.81 },
        expectedPeakDay: 11,
        confidence: 0.68,
        confidenceLabel: 'medium',
        survival: {
          probabilities: { 5: 0.78, 10: 0.46, 20: 0.19 },
          medianTimeToPeak: 10,
        },
        postPeakRisk: {
          expectedDrawdown: 0.24,
          severeDrawdownProb: 0.12,
        },
        evidenceQualityScore: 0.61,
        abstained: false,
        abstentionReasons: [],
      },
      analogEvidence: {
        analogCount: 5,
        topAnalogs: [
          {
            episodeId: 'ep-1',
            themeId: 'past-1',
            similarity: 0.81,
            peakDay: 14,
            totalDays: 40,
          },
        ],
        concentrationGini: 0.32,
        top1Weight: 0.27,
        evidenceQuality: 'high',
        lowEvidenceBadge: false,
      },
      forecastControl: {
        serving: true,
        version: 'forecast-2026-03-14',
        rollbackAvailable: true,
        rollbackVersion: 'forecast-2026-03-07',
      },
      comparisonSource: 'forecast',
    })

    expect(result.forecast?.probabilities[10]).toBe(0.54)
    expect(result.analogEvidence?.topAnalogs[0].themeId).toBe('past-1')
    expect(result.forecastControl?.version).toBe('forecast-2026-03-14')
    expect(result.comparisonSource).toBe('forecast')
  })
})
