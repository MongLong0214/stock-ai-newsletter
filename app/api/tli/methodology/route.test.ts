import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MethodologyMetricsSummary } from '@/lib/tli/methodology-metrics'

const methodologyMocks = vi.hoisted(() => ({
  loadMethodologyMetricsSummary: vi.fn(),
}))

vi.mock('@/lib/tli/methodology-metrics', () => ({
  loadMethodologyMetricsSummary: methodologyMocks.loadMethodologyMetricsSummary,
}))

describe('GET /api/tli/methodology', () => {
  const importRoute = () => import('./route')

  beforeEach(() => {
    methodologyMocks.loadMethodologyMetricsSummary.mockResolvedValue(makeSummary())
  })

  it('returns full methodology when no section param', async () => {
    const { GET } = await importRoute()
    const request = new Request('http://localhost/api/tli/methodology')
    const response = await GET(request)
    const json = await response.json()

    expect(json.success).toBe(true)
    expect(json.data).toHaveProperty('scoring')
    expect(json.data).toHaveProperty('stages')
    expect(json.data).toHaveProperty('limitations')
    expect(json.data).toHaveProperty('disclaimer')
    expect(json.data).toHaveProperty('modelPerformance')
    expect(json.data.scoring.components).toBeInstanceOf(Array)
    expect(json.data.scoring.components.length).toBeGreaterThanOrEqual(4)
    expect(json.data.scoring).not.toHaveProperty('accuracy')
    expect(JSON.stringify(json.data)).not.toContain('GDDA')
  })

  it('returns only scoring section when section=scoring', async () => {
    const { GET } = await importRoute()
    const request = new Request('http://localhost/api/tli/methodology?section=scoring')
    const response = await GET(request)
    const json = await response.json()

    expect(json.success).toBe(true)
    expect(json.data).toHaveProperty('section', 'scoring')
    expect(json.data).toHaveProperty('range', '0-100')
    expect(json.data).toHaveProperty('components')
    expect(json.data).toHaveProperty('validation')
    expect(json.data).not.toHaveProperty('accuracy')
  })

  it('returns dynamic model performance from the 90-day DB fixture', async () => {
    const { GET } = await importRoute()
    const request = new Request('http://localhost/api/tli/methodology?section=model_performance')
    const response = await GET(request)
    const json = await response.json()

    expect(json.success).toBe(true)
    expect(json.data).toMatchObject({
      section: 'model_performance',
      status: 'ready',
      windowDays: 90,
      championModelVersion: 'b-abl-v1',
      pAt10: 0.75,
      nScored: 40,
    })
  })

  it('returns items array for limitations section', async () => {
    const { GET } = await importRoute()
    const request = new Request('http://localhost/api/tli/methodology?section=limitations')
    const response = await GET(request)
    const json = await response.json()

    expect(json.success).toBe(true)
    expect(json.data).toHaveProperty('section', 'limitations')
    expect(json.data).toHaveProperty('items')
    expect(json.data.items).toBeInstanceOf(Array)
    expect(json.data.items.length).toBeGreaterThan(0)
  })

  it('maps snake_case section names to camelCase keys', async () => {
    const { GET } = await importRoute()
    const request = new Request('http://localhost/api/tli/methodology?section=data_sources')
    const response = await GET(request)
    const json = await response.json()

    expect(json.success).toBe(true)
    expect(json.data).toHaveProperty('section', 'data_sources')
    // dataSources is an array, so it should have items
    expect(json.data).toHaveProperty('items')
  })

  it('uses no-store cache so DB metric changes can be reflected', async () => {
    const { GET } = await importRoute()
    const request = new Request('http://localhost/api/tli/methodology')
    const response = await GET(request)

    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('Vercel-CDN-Cache-Control')).toBe('no-store')
  })

  it('has updatedAt metadata', async () => {
    const { GET } = await importRoute()
    const request = new Request('http://localhost/api/tli/methodology')
    const response = await GET(request)
    const json = await response.json()

    expect(json.data).toHaveProperty('updatedAt')
    // Should be a YYYY-MM-DD string
    expect(json.data.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

function makeSummary(): MethodologyMetricsSummary {
  return {
    status: 'ready',
    windowDays: 90,
    sinceDate: '2026-04-08',
    throughDate: '2026-07-06',
    championModelVersion: 'b-abl-v1',
    latestMetricDate: '2026-07-05',
    metricDays: 2,
    nScored: 40,
    brier: 0.125,
    ece: 0.0625,
    pAt10: 0.75,
    coverage: 0.7,
    abstainRate: 0.3,
  }
}
