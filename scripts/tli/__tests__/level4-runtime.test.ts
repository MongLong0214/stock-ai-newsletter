import { describe, expect, it } from 'vitest'
import {
  buildWeightTuningOutputPaths,
  buildWeightTuningRows,
  buildCertificationOutput,
} from '../level4/runtime'

describe('level4 runtime helpers', () => {
  it('joins eval rows and candidate rows into weight tuning rows', () => {
    const rows = buildWeightTuningRows({
      evalRows: [
        {
          run_id: 'run-1',
          candidate_theme_id: 'past-1',
          binary_relevant: true,
          censored_reason: null,
        },
        {
          run_id: 'run-1',
          candidate_theme_id: 'past-2',
          binary_relevant: false,
          censored_reason: 'run_horizon_immature',
        },
      ],
      candidateRows: [
        {
          run_id: 'run-1',
          run_date: '2026-03-10',
          candidate_theme_id: 'past-1',
          feature_sim: 0.7,
          curve_sim: 0.2,
          keyword_sim: 0.1,
        },
        {
          run_id: 'run-1',
          run_date: '2026-03-10',
          candidate_theme_id: 'past-2',
          feature_sim: 0.4,
          curve_sim: 0.5,
          keyword_sim: 0.1,
        },
      ],
    })

    expect(rows).toEqual([
      {
        run_id: 'run-1',
        run_date: '2026-03-10',
        candidate_theme_id: 'past-1',
        feature_sim: 0.7,
        curve_sim: 0.2,
        keyword_sim: 0.1,
        curve_bucket: 'lt7',
        sector_match: true,
        binary_relevant: true,
        censored_reason: null,
      },
      {
        run_id: 'run-1',
        run_date: '2026-03-10',
        candidate_theme_id: 'past-2',
        feature_sim: 0.4,
        curve_sim: 0.5,
        keyword_sim: 0.1,
        curve_bucket: 'lt7',
        sector_match: true,
        binary_relevant: false,
        censored_reason: 'run_horizon_immature',
      },
    ])
  })

  it('builds deterministic output paths for weight tuning reports', () => {
    const paths = buildWeightTuningOutputPaths('20260312_150000')
    expect(paths.reportPath).toContain('.omx/scientist/reports/20260312_150000_weight_tuning_report.md')
    expect(paths.figurePath).toContain('.omx/scientist/figures/20260312_150000_weight_tuning_metrics.svg')
  })

  it('renders a certification output payload with pass/fail summary', () => {
    const output = buildCertificationOutput({
      releaseCandidate: 'comparison-v4-rc1',
      checklist: {
        passed: true,
        items: [
          { id: 'calibration-artifact', label: 'Calibration Artifact', passed: true },
          { id: 'rollback-drill', label: 'Rollback Drill', passed: true },
        ],
      },
      calibrationVersion: 'cal-2026-03-12',
      weightVersion: 'w-2026-03-12',
      driftVersion: 'drift-2026-03',
      rollbackEvidence: 'rollback drill completed',
    })

    expect(output.filename).toContain('comparison-v4-rc1')
    expect(output.markdown).toContain('Overall Verdict: PASS')
    expect(output.markdown).toContain('rollback drill completed')
    expect(output.markdown).toContain('Calibration Artifact: cal-2026-03-12')
    expect(output.markdown).toContain('Weight Artifact: w-2026-03-12')
    expect(output.markdown).toContain('Drift Artifact: drift-2026-03')
    expect(output.markdown).toContain('- [x] Calibration Artifact')
  })
})
