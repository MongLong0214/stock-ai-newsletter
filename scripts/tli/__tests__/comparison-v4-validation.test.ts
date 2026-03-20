import { describe, expect, it } from 'vitest'
import {
  evaluateContractParity,
  evaluatePartialPublishExposure,
  evaluateRetentionCleanup,
  evaluateRollbackDrill,
} from '@/scripts/tli/comparison/v4/validation'

describe('comparison v4 operational validation helpers', () => {
  it('passes contract parity when payloads are identical', () => {
    const result = evaluateContractParity(
      [{ id: 1, value: 'a' }],
      [{ id: 1, value: 'a' }],
    )
    expect(result.ok).toBe(true)
  })

  it('fails partial publish exposure when unpublished runs are visible', () => {
    const result = evaluatePartialPublishExposure([
      { id: 'r1', status: 'published', publish_ready: true },
      { id: 'r2', status: 'complete', publish_ready: false },
    ])
    expect(result.ok).toBe(false)
  })

  it('passes rollback drill when all required checkpoints succeed', () => {
    const result = evaluateRollbackDrill({
      flagReverted: true,
      readerPinned: true,
      parityChecked: true,
      incidentLogged: true,
    })
    expect(result.ok).toBe(true)
  })

  it('passes retention cleanup when expired rows are removed', () => {
    const result = evaluateRetentionCleanup({
      expiredRowsBefore: 10,
      expiredRowsAfter: 0,
    })
    expect(result.ok).toBe(true)
  })
})
