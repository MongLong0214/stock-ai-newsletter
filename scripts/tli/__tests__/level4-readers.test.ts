import { describe, expect, it } from 'vitest'

describe('TLI4-002 certification reader boundary', () => {
  it('fails closed when only legacy diagnostic calibration artifacts are available', async () => {
    const mod = await import('../level4/readers')

    expect(() =>
      mod.selectCertificationCalibrationArtifact([
        {
          source_surface: 'legacy_diagnostic',
          calibration_version: 'legacy-cal',
          created_at: '2026-03-12T00:00:00Z',
        },
      ]),
    ).toThrow(/certification/i)
  })

  it('chooses the newest certification-grade artifact for serving inputs', async () => {
    const mod = await import('../level4/readers')

    expect(
      mod.selectCertificationCalibrationArtifact([
        {
          source_surface: 'v2_certification',
          calibration_version: 'cal-older',
          created_at: '2026-03-11T00:00:00Z',
        },
        {
          source_surface: 'replay_equivalent',
          calibration_version: 'cal-newer',
          created_at: '2026-03-12T00:00:00Z',
        },
      ]),
    ).toMatchObject({
      source_surface: 'replay_equivalent',
      calibration_version: 'cal-newer',
    })
  })

  it('rejects an invalid source surface before promotion and serving consume the artifact', async () => {
    const mod = await import('../level4/readers')

    expect(() =>
      mod.assertServingArtifactSurface({
        source_surface: 'unknown_surface',
        calibration_version: 'bad-artifact',
      }),
    ).toThrow(/source_surface/i)
  })
})
