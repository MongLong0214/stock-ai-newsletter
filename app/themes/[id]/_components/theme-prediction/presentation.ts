import type { Scenario } from '@/lib/tli/prediction'

export interface ScenarioCardConfig {
  label: string
  accent: 'emerald' | 'slate' | 'red'
  scenario: Scenario
}

export function shouldRenderPredictionPanel(firstSpikeDate: string | null, comparisonCount: number): boolean {
  return Boolean(firstSpikeDate) && comparisonCount >= 3
}

export function getScenarioCards(scenarios: {
  best: Scenario
  median: Scenario
  worst: Scenario
}): ScenarioCardConfig[] {
  const { best, median, worst } = scenarios
  const allSame = best.themeName === median.themeName && median.themeName === worst.themeName
  const bestMedianSame = best.themeName === median.themeName
  const medianWorstSame = median.themeName === worst.themeName

  if (allSame) {
    return [
      { label: '참고 경로', scenario: median, accent: 'slate' },
    ]
  }

  if (bestMedianSame || medianWorstSame) {
    return [
      { label: '빠른 경로', scenario: best, accent: 'emerald' },
      { label: '긴 경로', scenario: worst, accent: 'red' },
    ]
  }

  return [
    { label: '빠른 경로', scenario: best, accent: 'emerald' },
    { label: '기준 경로', scenario: median, accent: 'slate' },
    { label: '긴 경로', scenario: worst, accent: 'red' },
  ]
}
