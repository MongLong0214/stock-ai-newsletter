import { describe, expect, it } from 'vitest'
import { getScenarioCards, shouldRenderPredictionPanel } from './presentation'

const scenarios = {
  best: { themeName: 'Fast', peakDay: 12, totalDays: 40, similarity: 0.7 },
  median: { themeName: 'Typical', peakDay: 20, totalDays: 60, similarity: 0.6 },
  worst: { themeName: 'Late', peakDay: 40, totalDays: 120, similarity: 0.5 },
}

describe('getScenarioCards', () => {
  it('uses neutral labels for distinct scenarios', () => {
    const cards = getScenarioCards(scenarios)

    expect(cards.map((card) => card.label)).toEqual(['빠른 경로', '기준 경로', '긴 경로'])
  })

  it('collapses identical scenarios into a single reference card', () => {
    const cards = getScenarioCards({
      best: scenarios.best,
      median: scenarios.best,
      worst: scenarios.best,
    })

    expect(cards.map((card) => card.label)).toEqual(['참고 경로'])
  })

  it('requires both a spike date and at least three comparisons before rendering the panel shell', () => {
    expect(shouldRenderPredictionPanel('2026-01-01', 3)).toBe(true)
    expect(shouldRenderPredictionPanel(null, 3)).toBe(false)
    expect(shouldRenderPredictionPanel('2026-01-01', 2)).toBe(false)
  })

})
