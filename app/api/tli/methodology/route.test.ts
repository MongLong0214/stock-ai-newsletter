import { describe, it, expect } from 'vitest'

describe('GET /api/tli/methodology', () => {
  const importRoute = () => import('./route')

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
    expect(json.data.scoring.components).toBeInstanceOf(Array)
    expect(json.data.scoring.components.length).toBeGreaterThanOrEqual(4)
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

  it('uses long cache preset', async () => {
    const { GET } = await importRoute()
    const request = new Request('http://localhost/api/tli/methodology')
    const response = await GET(request)

    expect(response.headers.get('Cache-Control')).toContain('s-maxage=3600')
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
