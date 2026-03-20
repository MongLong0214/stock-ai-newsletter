import { describe, expect, it } from 'vitest'
import {
  DEFAULT_COMPARISON_V4_SERVING_VERSION,
  buildComparisonV4HoldPatch,
  buildComparisonV4ControlRow,
  buildRollbackControlRow,
  resolveComparisonV4ServingVersion,
} from '@/scripts/tli/comparison/v4/control'

describe('comparison v4 control helpers', () => {
  it('prefers persisted production pointer over env default', () => {
    const version = resolveComparisonV4ServingVersion({
      envVersion: 'env-v1',
      controlRow: {
        production_version: 'db-v2',
        serving_enabled: true,
      },
    })

    expect(version).toBe('db-v2')
  })

  it('falls back to env version and then latest', () => {
    expect(resolveComparisonV4ServingVersion({ envVersion: 'env-v1', controlRow: null })).toBe('env-v1')
    expect(resolveComparisonV4ServingVersion({ envVersion: undefined, controlRow: null })).toBe(DEFAULT_COMPARISON_V4_SERVING_VERSION)
  })

  it('builds a control row patch for published promotion', () => {
    const row = buildComparisonV4ControlRow({
      productionVersion: 'algo-v4-prod',
      servingEnabled: true,
      actor: 'codex',
      promotedAt: '2026-03-11T00:00:00.000Z',
      sourceSurface: 'v2_certification',
      calibrationVersion: 'cal-2026-03',
      weightVersion: null,
      driftVersion: 'drift-2026-03',
      gateVerdict: {
        status: 'passed',
        summary: 'all release gates passed',
        failureReasons: [],
      },
      previousStableVersion: 'algo-v4-prev',
      autoHoldEnabled: false,
      holdState: 'inactive',
    })

    expect(row.production_version).toBe('algo-v4-prod')
    expect(row.serving_enabled).toBe(true)
    expect(row.promoted_by).toBe('codex')
    expect(row.source_surface).toBe('v2_certification')
    expect(row.calibration_version).toBe('cal-2026-03')
    expect(row.weight_version).toBeNull()
    expect(row.drift_version).toBe('drift-2026-03')
    expect(row.promotion_gate_status).toBe('passed')
    expect(row.previous_stable_version).toBe('algo-v4-prev')
    expect(row.auto_hold_enabled).toBe(false)
    expect(row.hold_state).toBe('inactive')
  })

  it('builds a rollback control row that points back to the previous stable version', () => {
    const row = buildRollbackControlRow({
      productionVersion: 'algo-v4-prev',
      actor: 'codex',
      sourceSurface: 'v2_certification',
      calibrationVersion: 'cal-2026-03',
      weightVersion: null,
      driftVersion: 'drift-2026-03',
      previousStableVersion: 'algo-v4-prod',
      rollbackReason: 'auto-hold triggered',
    })

    expect(row.production_version).toBe('algo-v4-prev')
    expect(row.serving_enabled).toBe(true)
    expect(row.previous_stable_version).toBe('algo-v4-prod')
    expect(row.rollback_reason).toBe('auto-hold triggered')
    expect(row.promotion_gate_status).toBe('rolled_back')
  })

  it('builds a hold patch that is traceable to the drift report', () => {
    const patch = buildComparisonV4HoldPatch({
      autoHoldEnabled: true,
      holdState: 'active',
      holdReason: 'low_support_bucket_precision',
      holdReportDate: '2026-03-31',
      driftVersion: 'drift-2026-03',
    })

    expect(patch.auto_hold_enabled).toBe(true)
    expect(patch.hold_state).toBe('active')
    expect(patch.hold_reason).toBe('low_support_bucket_precision')
    expect(patch.hold_report_date).toBe('2026-03-31')
    expect(patch.drift_version).toBe('drift-2026-03')
  })
})
