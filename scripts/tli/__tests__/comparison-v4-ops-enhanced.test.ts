import { describe, expect, it } from 'vitest'
import {
  COMPARISON_V4_ALERT_THRESHOLDS,
  COMPARISON_V4_NOTIFICATION_CHANNEL,
  COMPARISON_V4_RETENTION_POLICY,
  evaluateAlertThreshold,
  isObservabilityReady,
  buildDrillEvidence,
  type DrillEvidence,
} from '../comparison-v4-ops'

describe('CMPV4-013: evaluatable alert thresholds', () => {
  it('defines numeric thresholds for all required alerts', () => {
    expect(COMPARISON_V4_ALERT_THRESHOLDS).toEqual({
      failedRunRatePct: 5,
      failedRunWindowMinutes: 60,
      unpublishedBacklogBatchWindows: 1,
      top3CensoringRatePct: 10,
      predictionAvailabilityDeltaPct: 5,
      storageGrowthOverBudgetPct: 20,
    })
  })

  it('evaluates failed run rate breach', () => {
    const result = evaluateAlertThreshold('failedRunRatePct', 6)
    expect(result.breached).toBe(true)
    expect(result.alertId).toBe('failed-run-rate')
  })

  it('does not breach when value is within threshold', () => {
    const result = evaluateAlertThreshold('failedRunRatePct', 3)
    expect(result.breached).toBe(false)
  })

  it('evaluates top-3 censoring rate breach', () => {
    const result = evaluateAlertThreshold('top3CensoringRatePct', 10)
    expect(result.breached).toBe(true)
  })

  it('evaluates top-3 censoring rate within threshold', () => {
    const result = evaluateAlertThreshold('top3CensoringRatePct', 9.9)
    expect(result.breached).toBe(false)
  })

  it('evaluates storage growth breach', () => {
    const result = evaluateAlertThreshold('storageGrowthOverBudgetPct', 25)
    expect(result.breached).toBe(true)
  })
})

describe('CMPV4-013: notification channel', () => {
  it('defines a notification channel type and owner', () => {
    expect(COMPARISON_V4_NOTIFICATION_CHANNEL).toEqual({
      type: 'github-issue',
      primaryOwner: expect.any(String),
      secondaryOwner: expect.any(String),
    })
  })

  it('has non-empty owner values', () => {
    expect(COMPARISON_V4_NOTIFICATION_CHANNEL.primaryOwner.length).toBeGreaterThan(0)
    expect(COMPARISON_V4_NOTIFICATION_CHANNEL.secondaryOwner.length).toBeGreaterThan(0)
  })
})

describe('CMPV4-013: retention policy', () => {
  it('matches PRD §12 retention days', () => {
    expect(COMPARISON_V4_RETENTION_POLICY).toEqual({
      theme_comparison_runs_v2: 365,
      theme_comparison_candidates_v2: 120,
      theme_comparison_eval_v2: 365,
      prediction_snapshots_v2: 365,
      comparison_backfill_manifest_v2: -1, // -1 = permanent
    })
  })
})

describe('CMPV4-013: observability readiness', () => {
  it('returns ready when all prerequisites are met', () => {
    const result = isObservabilityReady({
      dashboardsConfigured: true,
      alertsConfigured: true,
      notificationChannelConfigured: true,
      runbookExists: true,
      drillEvidenceExists: true,
    })
    expect(result.ready).toBe(true)
    expect(result.missingPrerequisites).toEqual([])
  })

  it('returns not ready with specific missing prerequisites', () => {
    const result = isObservabilityReady({
      dashboardsConfigured: true,
      alertsConfigured: false,
      notificationChannelConfigured: true,
      runbookExists: true,
      drillEvidenceExists: false,
    })
    expect(result.ready).toBe(false)
    expect(result.missingPrerequisites).toContain('alertsConfigured')
    expect(result.missingPrerequisites).toContain('drillEvidenceExists')
    expect(result.missingPrerequisites).not.toContain('dashboardsConfigured')
  })

  it('returns all prerequisites when none are met', () => {
    const result = isObservabilityReady({
      dashboardsConfigured: false,
      alertsConfigured: false,
      notificationChannelConfigured: false,
      runbookExists: false,
      drillEvidenceExists: false,
    })
    expect(result.ready).toBe(false)
    expect(result.missingPrerequisites).toHaveLength(5)
  })
})

describe('CMPV4-013: drill evidence', () => {
  it('builds a drill evidence record', () => {
    const evidence: DrillEvidence = buildDrillEvidence({
      drillDate: '2026-03-11',
      flagReverted: true,
      readerPinned: true,
      shadowWriterFrozen: false,
      affectedRunRange: { from: '2026-03-01', to: '2026-03-10' },
      parityResult: { ok: true },
      incidentNote: 'drill test completed',
    })

    expect(evidence.drillDate).toBe('2026-03-11')
    expect(evidence.passed).toBe(true)
    expect(evidence.steps.flagReverted).toBe(true)
    expect(evidence.steps.readerPinned).toBe(true)
    expect(evidence.steps.shadowWriterFrozen).toBe(false)
    expect(evidence.steps.affectedRunRange).toEqual({ from: '2026-03-01', to: '2026-03-10' })
    expect(evidence.steps.parityResult).toEqual({ ok: true })
    expect(evidence.steps.incidentNote).toBe('drill test completed')
  })

  it('marks drill as failed when parity check fails', () => {
    const evidence = buildDrillEvidence({
      drillDate: '2026-03-11',
      flagReverted: true,
      readerPinned: true,
      shadowWriterFrozen: false,
      affectedRunRange: { from: '2026-03-01', to: '2026-03-10' },
      parityResult: { ok: false },
      incidentNote: 'parity mismatch detected',
    })
    expect(evidence.passed).toBe(false)
  })

  it('marks drill as failed when flag not reverted', () => {
    const evidence = buildDrillEvidence({
      drillDate: '2026-03-11',
      flagReverted: false,
      readerPinned: true,
      shadowWriterFrozen: false,
      affectedRunRange: { from: '2026-03-01', to: '2026-03-10' },
      parityResult: { ok: true },
      incidentNote: 'flag revert failed',
    })
    expect(evidence.passed).toBe(false)
  })
})
