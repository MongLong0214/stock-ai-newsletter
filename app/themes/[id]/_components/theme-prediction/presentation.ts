import type { Scenario } from '@/lib/tli/prediction'
import type { Phase } from '@/lib/tli/prediction'

export interface ScenarioCardConfig {
  readonly label: string
  readonly accent: 'emerald' | 'slate' | 'red'
  readonly scenario: Scenario
}

export interface PeakTimingStat {
  readonly label: string
  readonly value: string
}

export function shouldRenderPredictionPanel(
  firstSpikeDate: string | null,
  comparisonCount: number,
): boolean {
  return Boolean(firstSpikeDate) && comparisonCount >= 3
}

export function getScenarioCards(scenarios: {
  readonly best: Scenario
  readonly median: Scenario
  readonly worst: Scenario
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

export function getPeakTimingStat(input: {
  readonly phase: Phase
  readonly avgDaysToPeak: number
  readonly avgPeakDay: number
}): PeakTimingStat {
  if (input.phase === 'cooling') {
    return {
      label: '기록상 정점',
      value: input.avgPeakDay > 0 ? `${input.avgPeakDay}일차 부근` : '정점 이후',
    }
  }

  return {
    label: '예상 정점',
    value: input.avgDaysToPeak > 0 ? `약 ${input.avgDaysToPeak}일 후` : '정점 부근',
  }
}
