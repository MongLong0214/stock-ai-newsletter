import { describe, expect, it } from 'vitest'
import { buildCalibrationArtifactFromV2Rows } from '../level4/calibration-runtime'

describe('level4 calibration runtime', () => {
  it('builds a certification calibration artifact from v2 eval and candidate rows', () => {
    const artifact = buildCalibrationArtifactFromV2Rows({
      calibrationVersion: 'cal-2026-03-12',
      sourceSurface: 'v2_certification',
      rows: [
        {
          run_id: 'run-1',
          evaluated_at: '2026-03-10',
          similarity_score: 0.82,
          binary_relevant: true,
          censored_reason: null,
        },
        {
          run_id: 'run-1',
          evaluated_at: '2026-03-10',
          similarity_score: 0.71,
          binary_relevant: false,
          censored_reason: null,
        },
        {
          run_id: 'run-2',
          evaluated_at: '2026-03-11',
          similarity_score: 0.64,
          binary_relevant: true,
          censored_reason: null,
        },
      ],
      bootstrapIterations: 1000,
    })

    expect(artifact.calibration_version).toBe('cal-2026-03-12')
    expect(artifact.source_surface).toBe('v2_certification')
    expect(artifact.source_row_count).toBe(3)
    expect(artifact.positive_count).toBe(2)
    expect(artifact.bin_summary.length).toBeGreaterThan(0)
  })
})
