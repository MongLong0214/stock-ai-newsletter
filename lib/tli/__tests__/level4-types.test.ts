import { describe, expect, it } from 'vitest'

describe('TLI4-001 level4 artifact contracts', () => {
  it('defines certification-grade source surfaces and rejects legacy diagnostic artifacts', async () => {
    const mod = await import('../comparison/level4-types')

    expect(mod.isCertificationSourceSurface('v2_certification')).toBe(true)
    expect(mod.isCertificationSourceSurface('replay_equivalent')).toBe(true)
    expect(mod.isCertificationSourceSurface('legacy_diagnostic')).toBe(false)
  })

  it('accepts only certification-grade calibration artifacts at the serving guard', async () => {
    const mod = await import('../comparison/level4-types')

    expect(
      mod.isCertificationCalibrationArtifact({
        source_surface: 'v2_certification',
        calibration_version: 'cal-2026-03-12',
        ci_method: 'cluster_bootstrap',
        bootstrap_iterations: 2000,
      }),
    ).toBe(true)

    expect(
      mod.isCertificationCalibrationArtifact({
        source_surface: 'legacy_diagnostic',
        calibration_version: 'cal-legacy',
        ci_method: 'cluster_bootstrap',
        bootstrap_iterations: 2000,
      }),
    ).toBe(false)
  })

  it('requires versioned artifact metadata on calibration, weight, and drift artifacts', async () => {
    const mod = await import('../comparison/level4-types')

    expect(mod.requiredCalibrationArtifactFields).toEqual(
      expect.arrayContaining(['source_surface', 'calibration_version', 'ci_method', 'bootstrap_iterations', 'created_at']),
    )
    expect(mod.requiredWeightArtifactFields).toEqual(
      expect.arrayContaining(['source_surface', 'weight_version', 'created_at']),
    )
    expect(mod.requiredDriftArtifactFields).toEqual(
      expect.arrayContaining(['source_surface', 'drift_version', 'created_at']),
    )
  })
})
