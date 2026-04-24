import { describe, expect, it } from 'vitest'
import { GET } from './route'

describe('openapi route contract', () => {
  it('preserves the comparison schema fields required by the detail API', async () => {
    const response = await GET(new Request('http://localhost/api/openapi.json'), {} as never)
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
    const response = await GET(new Request('http://localhost/api/openapi.json'), {} as never)
    const spec = await response.json()
    const themeDetail = spec.components.schemas.ThemeDetail

    expect(themeDetail.required).toContain('comparisons')
    expect(themeDetail.required).toContain('lifecycleCurve')
  })

  it('does not document removed forecast fields', async () => {
    const response = await GET(new Request('http://localhost/api/openapi.json'), {} as never)
    const spec = await response.json()
    const themeDetail = spec.components.schemas.ThemeDetail

    expect(themeDetail.properties.forecast).toBeUndefined()
    expect(themeDetail.properties.analogEvidence).toBeUndefined()
    expect(themeDetail.properties.forecastControl).toBeUndefined()
    expect(themeDetail.properties.comparisonSource).toBeUndefined()
  })

  it('documents ranking signals as an optional additive field', async () => {
    const response = await GET(new Request('http://localhost/api/openapi.json'), {} as never)
    const spec = await response.json()
    const themeRanking = spec.components.schemas.ThemeRanking

    expect(themeRanking.properties.signals).toBeDefined()
    expect(themeRanking.properties.signals.type).toBe('array')
    expect(themeRanking.required).not.toContain('signals')
  })

  it('documents tracked and visible counts for ranking and AI summary payloads', async () => {
    const response = await GET(new Request('http://localhost/api/openapi.json'), {} as never)
    const spec = await response.json()
    const rankingSummary = spec.components.schemas.RankingSummary
    const aiSummary = spec.components.schemas.AiSummary

    expect(rankingSummary.properties.trackedThemes).toBeDefined()
    expect(rankingSummary.properties.visibleThemes).toBeDefined()
    expect(rankingSummary.required).toContain('trackedThemes')
    expect(rankingSummary.required).toContain('visibleThemes')
    expect(aiSummary.properties.marketOverview.properties.trackedThemes).toBeDefined()
    expect(aiSummary.properties.marketOverview.properties.visibleThemes).toBeDefined()
  })

  it('documents level-4 probability metadata on comparison payloads', async () => {
    const response = await GET(new Request('http://localhost/api/openapi.json'), {} as never)
    const spec = await response.json()
    const comparison = spec.components.schemas.Comparison

    expect(comparison.properties.relevanceProbability).toBeDefined()
    expect(comparison.properties.probabilityCiLower).toBeDefined()
    expect(comparison.properties.probabilityCiUpper).toBeDefined()
    expect(comparison.properties.supportCount).toBeDefined()
    expect(comparison.properties.confidenceTier).toBeDefined()
    expect(comparison.properties.calibrationVersion).toBeDefined()
    expect(comparison.properties.weightVersion).toBeDefined()
  })

  it('documents serving metadata source-surface enums for certification artifacts', async () => {
    const response = await GET(new Request('http://localhost/api/openapi.json'), {} as never)
    const spec = await response.json()
    const comparison = spec.components.schemas.Comparison

    expect(comparison.properties.sourceSurface).toBeDefined()
    expect(comparison.properties.sourceSurface.enum).toEqual([
      'legacy_diagnostic',
      'v2_certification',
      'replay_equivalent',
    ])
  })

})
