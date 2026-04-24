import { describe, expect, it } from 'vitest'
import { GET } from './route'

describe('TLI4-001 OpenAPI level4 metadata contract', () => {
  it('documents the serving metadata fields required for certified comparison payloads', async () => {
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
    expect(comparison.properties.sourceSurface).toBeDefined()
  })

  it('restricts sourceSurface to the level4 artifact surface enum', async () => {
    const response = await GET(new Request('http://localhost/api/openapi.json'), {} as never)
    const spec = await response.json()
    const comparison = spec.components.schemas.Comparison

    expect(comparison.properties.sourceSurface.enum).toEqual([
      'legacy_diagnostic',
      'v2_certification',
      'replay_equivalent',
    ])
  })
})
