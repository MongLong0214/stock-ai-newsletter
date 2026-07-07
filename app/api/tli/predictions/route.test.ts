import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const routeMocks = vi.hoisted(() => ({
  loadPredictionResponse: vi.fn(),
}))

vi.mock('./prediction-loader', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./prediction-loader')>()
  return {
    ...actual,
    loadPredictionResponse: routeMocks.loadPredictionResponse,
  }
})

describe('GET /api/tli/predictions', () => {
  const originalExposureFlag = process.env.TLI_PREDICTIONS_V3_EXPOSURE_ENABLED

  beforeEach(() => {
    if (originalExposureFlag === undefined) {
      delete process.env.TLI_PREDICTIONS_V3_EXPOSURE_ENABLED
    } else {
      process.env.TLI_PREDICTIONS_V3_EXPOSURE_ENABLED = originalExposureFlag
    }
    routeMocks.loadPredictionResponse.mockReset()
    routeMocks.loadPredictionResponse.mockResolvedValue({
      phase: 'rising',
      dataSource: 'theme_predictions_v3',
      themes: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          name: 'AI 반도체',
          themeId: '11111111-1111-4111-8111-111111111111',
          predictionDate: '2026-08-03',
          pRise: 0.68,
          ciLower: 0.59,
          ciUpper: 0.77,
          abstain: false,
          abstainReasons: [],
          modelVersion: 'm1-2026w31',
          trailing90d: { topSignalPrecision: 0.63, n: 214 },
          phase: 'rising',
          deprecation: { phase: 'removed_after=2026-09-15, use pRise' },
        },
      ],
    })
  })

  afterEach(() => {
    if (originalExposureFlag === undefined) {
      delete process.env.TLI_PREDICTIONS_V3_EXPOSURE_ENABLED
    } else {
      process.env.TLI_PREDICTIONS_V3_EXPOSURE_ENABLED = originalExposureFlag
    }
  })

  it('returns the v3 snapshot contract and forwards legacy phase as a deprecated filter', async () => {
    process.env.TLI_PREDICTIONS_V3_EXPOSURE_ENABLED = 'true'
    const { GET } = await import('./route')
    const response = await GET(new Request('http://localhost/api/tli/predictions?phase=rising&themeId=11111111-1111-4111-8111-111111111111'))
    const json = await response.json()

    expect(routeMocks.loadPredictionResponse).toHaveBeenCalledWith({
      phaseFilter: 'rising',
      themeId: '11111111-1111-4111-8111-111111111111',
    })
    expect(json.success).toBe(true)
    expect(json.data.themes[0]).toMatchObject({
      themeId: '11111111-1111-4111-8111-111111111111',
      pRise: 0.68,
      ciLower: 0.59,
      ciUpper: 0.77,
      trailing90d: { topSignalPrecision: 0.63, n: 214 },
      phase: 'rising',
      deprecation: { phase: 'removed_after=2026-09-15, use pRise' },
    })
  })

  it('rejects malformed themeId filters before querying Supabase', async () => {
    const { GET } = await import('./route')
    const response = await GET(new Request('http://localhost/api/tli/predictions?themeId=bad-id'))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.success).toBe(false)
    expect(routeMocks.loadPredictionResponse).not.toHaveBeenCalled()
  })

  it('returns a fail-closed empty response until the v3 exposure flag is explicitly enabled', async () => {
    delete process.env.TLI_PREDICTIONS_V3_EXPOSURE_ENABLED
    const { GET } = await import('./route')
    const response = await GET(new Request('http://localhost/api/tli/predictions?phase=rising'))
    const json = await response.json()

    expect(routeMocks.loadPredictionResponse).not.toHaveBeenCalled()
    expect(json.success).toBe(true)
    expect(json.data).toMatchObject({
      phase: 'rising',
      dataSource: 'none',
      themes: [],
      guidance: 'TLI v3 prediction exposure is disabled for rollback.',
    })
  })

  it('keeps rollback immediate when the v3 exposure flag is set to false', async () => {
    process.env.TLI_PREDICTIONS_V3_EXPOSURE_ENABLED = 'false'
    const { GET } = await import('./route')
    const response = await GET(new Request('http://localhost/api/tli/predictions'))
    const json = await response.json()

    expect(routeMocks.loadPredictionResponse).not.toHaveBeenCalled()
    expect(json.data.dataSource).toBe('none')
  })
})
