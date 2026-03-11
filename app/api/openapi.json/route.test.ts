import { describe, expect, it } from 'vitest'
import { GET } from './route'

describe('openapi route contract', () => {
  it('preserves the comparison schema fields required by the detail API', async () => {
    const response = GET()
    const spec = await response.json()
    const comparison = spec.components.schemas.Comparison

    expect(comparison.properties.currentDay).toBeDefined()
    expect(comparison.properties.pastPeakDay).toBeDefined()
    expect(comparison.properties.pastTotalDays).toBeDefined()
    expect(comparison.properties.message).toBeDefined()
    expect(comparison.properties.featureSim).toBeDefined()
    expect(comparison.properties.curveSim).toBeDefined()
    expect(comparison.properties.keywordSim).toBeDefined()
    expect(comparison.properties.pastPeakScore).toBeDefined()
    expect(comparison.properties.pastFinalStage).toBeDefined()
    expect(comparison.properties.pastDeclineDays).toBeDefined()
    expect(comparison.properties.lifecycleCurve).toBeDefined()
  })

  it('keeps ThemeDetail comparisons in the required payload surface', async () => {
    const response = GET()
    const spec = await response.json()
    const themeDetail = spec.components.schemas.ThemeDetail

    expect(themeDetail.required).toContain('comparisons')
    expect(themeDetail.required).toContain('lifecycleCurve')
  })
})
