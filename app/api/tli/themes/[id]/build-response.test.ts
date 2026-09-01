import { describe, expect, it } from 'vitest'
import { buildThemeDetailResponse } from './build-response'
import type { ComparisonResult } from '@/lib/tli/types/api'

describe('buildThemeDetailResponse', () => {
  it('preserves level4 comparison metadata in the ThemeDetail payload', () => {
    const comparison: ComparisonResult = {
      pastTheme: 'Past Theme',
      pastThemeId: 'past-1',
      comparisonLane: 'completed_analog',
      retrievalSurface: 'dtw_baseline',
      generationVersion: 'retrieval_spec_version:1.0',
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
      comparisonSource: 'analog',
      comparisonGenerationVersion: 'retrieval_spec_version:1.0',
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
    expect(result).toMatchObject({
      comparisonSource: 'analog',
      comparisonGenerationVersion: 'retrieval_spec_version:1.0',
    })
  })

  it('preserves cycle-completion comparison metadata in the ThemeDetail payload', () => {
    const comparison: ComparisonResult = {
      pastTheme: 'Past Theme',
      pastThemeId: 'past-1',
      comparisonLane: 'active_peer',
      retrievalSurface: 'comparison_v2',
      generationVersion: 'algorithm_version:comparison-v4-shadow-v1',
      similarity: 0.73,
      currentDay: 41,
      pastPeakDay: 20,
      pastTotalDays: 40,
      observedWindowDays: 40,
      completedCycleDays: null,
      cycleCompletionStatus: 'observed',
      isPastActive: true,
      estimatedDaysToPeak: 0,
      message: 'sample',
      lifecycleCurve: [],
      featureSim: 0.5,
      curveSim: 0.7,
      keywordSim: 0.1,
      pastPeakScore: 82,
      pastFinalStage: null,
      pastDeclineDays: null,
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
      comparisonSource: 'v2_active_peer',
      comparisonGenerationVersion: 'algorithm_version:comparison-v4-shadow-v1',
      allScores: [],
      newsList: [],
      interestList: [],
    })

    expect(result.comparisons[0]).toMatchObject({
      observedWindowDays: 40,
      completedCycleDays: null,
      cycleCompletionStatus: 'observed',
      isPastActive: true,
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
      comparisonSource: 'none',
      comparisonGenerationVersion: null,
      allScores: [],
      newsList: [],
      interestList: [],
    })

    expect(result.comparisons).toEqual([])
  })

  it('deduplicates repeated keywords in the ThemeDetail payload', () => {
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
      keywords: ['전기자전거', ' 전기자전거 ', '전고체', '전고체', ''],
      comparisonResults: [],
      comparisonSource: 'none',
      comparisonGenerationVersion: null,
      allScores: [],
      newsList: [],
      interestList: [],
    })

    expect(result.keywords).toEqual(['전기자전거', '전고체'])
  })
})
