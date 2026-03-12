import { describe, expect, it } from 'vitest'

describe('TLI4-004 certification calibration report', () => {
  it('formats the report with required scientific sections and stat lines', async () => {
    const mod = await import('../level4/calibrate-comparisons')

    const report = mod.renderCertificationCalibrationReport({
      objective: 'Certify comparison probabilities for serving',
      dataSummary: 'v2 certification surface',
      findings: [
        {
          finding: 'Calibration improves probabilistic accuracy.',
          stats: {
            effect_size: 'Brier before=0.2666 after=0.0453',
            ci: '95% cluster bootstrap CI [0.0375, 0.0717]',
            n: 'n = 240 rows',
          },
        },
      ],
      limitations: ['Single-month sample only'],
    })

    expect(report).toContain('[OBJECTIVE]')
    expect(report).toContain('[DATA]')
    expect(report).toContain('[FINDING]')
    expect(report).toContain('[STAT:effect_size]')
    expect(report).toContain('[STAT:ci]')
    expect(report).toContain('[LIMITATION]')
  })

  it('keeps artifact metrics and report metrics in sync', async () => {
    const mod = await import('../level4/calibrate-comparisons')

    const artifact = {
      calibration_version: 'cal-2026-03-12',
      brier_score_before: 0.2666,
      brier_score_after: 0.0453,
      ece_before: 0.4344,
      ece_after: 0,
    }
    const reportMetrics = {
      brierBefore: 0.2666,
      brierAfter: 0.0453,
      eceBefore: 0.4344,
      eceAfter: 0,
    }

    expect(mod.verifyCalibrationReportConsistency({ artifact, reportMetrics })).toEqual({
      ok: true,
      mismatches: [],
    })
  })

  it('summarizes cluster bootstrap ci from run-clustered replicates', async () => {
    const mod = await import('../level4/calibrate-comparisons')

    const samples = Array.from({ length: 100 }, (_, index) => index + 1)

    expect(mod.summarizeClusterBootstrapCi(samples)).toMatchObject({
      method: 'cluster_bootstrap',
      lower: 3,
      upper: 98,
    })
  })
})
