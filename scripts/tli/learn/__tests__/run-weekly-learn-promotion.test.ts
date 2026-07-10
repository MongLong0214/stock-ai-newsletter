import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  executeProspectiveCheckpoint,
  recordProspectiveDecision,
} from '../run-weekly-learn'

const CYCLE_ID = '10000000-0000-4000-8000-000000000014'

const enrolledOrigins = (count: number) => Array.from({ length: count }, (_, index) => ({
  sequenceNo: index + 1,
  originDate: `2026-${String(index + 1).padStart(2, '0')}-05`,
  enrollmentRole: 'confirmatory' as const,
  eligible: true,
}))

const lifecycle = (count: number, safetyPassed: boolean) => ({
  cycleId: CYCLE_ID,
  cycleStatus: 'running' as const,
  plannedOrigins: 16 as const,
  safetyOrigins: 8 as const,
  enrolledOrigins: enrolledOrigins(count),
  safetyCheckedAt: safetyPassed ? '2026-09-01T00:00:00.000Z' : null,
  safetyArtifact: safetyPassed
    ? { decision: 'pass' as const, attested: true }
    : null,
  decisionAt: null,
})

describe('weekly prospective lifecycle wiring', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('invokes safety exactly once at 8, final exactly once at 16, and neither at 7 or 15', async () => {
    const evaluateSafety = vi.fn().mockReturnValue({ decision: 'pass', action: 'safety_only' })
    const evaluateFinal = vi.fn().mockReturnValue({ decision: 'pass', action: 'would_promote' })
    const dependencies = { evaluateSafety, evaluateFinal }

    const at7 = await executeProspectiveCheckpoint({
      lifecycle: lifecycle(7, false), safetyInput: { checkpoint: 'safety' }, finalInput: { checkpoint: 'final' },
    }, dependencies)
    const at8 = await executeProspectiveCheckpoint({
      lifecycle: lifecycle(8, false), safetyInput: { checkpoint: 'safety' }, finalInput: { checkpoint: 'final' },
    }, dependencies)
    const at15 = await executeProspectiveCheckpoint({
      lifecycle: lifecycle(15, true), safetyInput: { checkpoint: 'safety' }, finalInput: { checkpoint: 'final' },
    }, dependencies)
    const at16 = await executeProspectiveCheckpoint({
      lifecycle: lifecycle(16, true), safetyInput: { checkpoint: 'safety' }, finalInput: { checkpoint: 'final' },
    }, dependencies)

    expect(at7).toMatchObject({ checkpoint: { kind: 'insufficient_origins' } })
    expect(at8).toMatchObject({ checkpoint: { kind: 'safety_due' }, evaluation: { action: 'safety_only' } })
    expect(at15).toMatchObject({ checkpoint: { kind: 'insufficient_origins' } })
    expect(at16).toMatchObject({ checkpoint: { kind: 'final_due' }, evaluation: { action: 'would_promote' } })
    expect(evaluateSafety).toHaveBeenCalledTimes(1)
    expect(evaluateSafety).toHaveBeenCalledWith({ checkpoint: 'safety' })
    expect(evaluateFinal).toHaveBeenCalledTimes(1)
    expect(evaluateFinal).toHaveBeenCalledWith({ checkpoint: 'final' })
  })

  it.each([
    ['unset', undefined],
    ['false', 'false'],
    ['numeric truthy', '1'],
  ])('keeps the existing flag as a write gate when it is %s', async (_label, flag) => {
    const record = vi.fn().mockResolvedValue({ status: 'ready_for_decision' })
    vi.stubEnv('TLI_M1_PROMOTION_ENABLED', flag)

    const result = await recordProspectiveDecision({
      dryRun: false,
      decision: {
        kind: 'final',
        cycleId: CYCLE_ID,
        decision: 'pass',
        action: 'would_promote',
      },
    }, record)

    expect(result).toMatchObject({ action: 'recording_disabled' })
    expect(record).not.toHaveBeenCalled()
  })

  it('keeps dry runs write-free even when the flag is enabled', async () => {
    const record = vi.fn().mockResolvedValue({ status: 'ready_for_decision' })
    vi.stubEnv('TLI_M1_PROMOTION_ENABLED', 'true')

    const result = await recordProspectiveDecision({
      dryRun: true,
      decision: {
        kind: 'final', cycleId: CYCLE_ID, decision: 'pass', action: 'would_promote',
      },
    }, record)

    expect(result).toMatchObject({ action: 'would_record_final' })
    expect(record).not.toHaveBeenCalled()
  })

  it('records a final decision exactly once without invoking any promotion action', async () => {
    const record = vi.fn().mockResolvedValue({ status: 'ready_for_decision' })
    vi.stubEnv('TLI_M1_PROMOTION_ENABLED', 'true')
    const decision = {
      kind: 'final' as const,
      cycleId: CYCLE_ID,
      decision: 'pass' as const,
      action: 'would_promote' as const,
    }

    const result = await recordProspectiveDecision({ dryRun: false, decision }, record)

    expect(record).toHaveBeenCalledTimes(1)
    expect(record).toHaveBeenCalledWith(decision)
    expect(result).toEqual({ action: 'recorded_final', result: { status: 'ready_for_decision' } })
    expect(JSON.stringify(result)).not.toContain('promoted')
  })

  it('records a safety-only decision exactly once without exposing efficacy or promotion', async () => {
    const record = vi.fn().mockResolvedValue({ status: 'running', safetyCheckedAt: '2026-09-01T00:00:00.000Z' })
    vi.stubEnv('TLI_M1_PROMOTION_ENABLED', 'true')
    const decision = {
      kind: 'safety' as const,
      cycleId: CYCLE_ID,
      decision: 'pass' as const,
      action: 'safety_only' as const,
    }

    const result = await recordProspectiveDecision({ dryRun: false, decision }, record)

    expect(record).toHaveBeenCalledTimes(1)
    expect(record).toHaveBeenCalledWith(decision)
    expect(result).toEqual({
      action: 'recorded_safety',
      result: { status: 'running', safetyCheckedAt: '2026-09-01T00:00:00.000Z' },
    })
    expect(JSON.stringify({ decision, result })).not.toMatch(/efficacy|brier_delta|p_at_10|would_promote/i)
  })
})
