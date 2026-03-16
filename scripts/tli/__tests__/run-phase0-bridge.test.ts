import { describe, expect, it } from 'vitest'
import {
  buildBridgeAuditRows,
  buildBridgeCertificationInputFromStats,
} from '../run-phase0-bridge'

describe('run-phase0-bridge helpers', () => {
  it('maps materialized stats into the 4 bridge certification inputs', () => {
    const input = buildBridgeCertificationInputFromStats({
      episodeRegistry: {
        activeThemeCount: 120,
        episodeThemeCount: 118,
        overlappingEpisodeCount: 0,
        coverageGapRatio: 0.01,
      },
      querySnapshotLabel: {
        totalSnapshots: 1000,
        reconstructionSuccessCount: 995,
        missingSnapshotCount: 4,
      },
      analogCandidatesEvidence: {
        expectedArtifacts: 400,
        materializedArtifacts: 400,
        dualWriteSuccessCount: 399,
        dualWriteAttemptCount: 400,
        auditTrailComplete: true,
      },
      forecastControl: {
        rollbackDrillCount: 2,
        rollbackDrillSuccessCount: 2,
        failClosedVerified: true,
      },
    })

    expect(input.episodeRegistry.episodeThemeCount).toBe(118)
    expect(input.querySnapshotLabel.reconstructionSuccessCount).toBe(995)
    expect(input.analogCandidatesEvidence.dualWriteSuccessCount).toBe(399)
    expect(input.forecastControl.rollbackDrillSuccessCount).toBe(2)
  })

  it('builds bridge audit rows from certification output', () => {
    const rows = buildBridgeAuditRows('2026-03-14', {
      allPassed: false,
      cutoverEligible: false,
      rollbackTriggered: true,
      results: [
        {
          rowName: 'episode_registry',
          verdict: 'pass',
          parity: {
            metric_name: 'coverage_diff',
            metric_value: 0.01,
            threshold: 0.02,
            passed: true,
          },
          cutover_eligible: true,
          rollback_triggered: false,
          details: null,
        },
        {
          rowName: 'forecast_control',
          verdict: 'fail',
          parity: {
            metric_name: 'drill_success_rate',
            metric_value: 0.5,
            threshold: 1,
            passed: false,
          },
          cutover_eligible: false,
          rollback_triggered: true,
          details: { drill_count: 1 },
        },
      ],
    })

    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      run_date: '2026-03-14',
      bridge_row: 'episode_registry',
      verdict: 'pass',
      cutover_eligible: true,
      rollback_triggered: false,
    })
    expect(rows[1]).toMatchObject({
      bridge_row: 'forecast_control',
      verdict: 'fail',
      rollback_triggered: true,
    })
  })
})
