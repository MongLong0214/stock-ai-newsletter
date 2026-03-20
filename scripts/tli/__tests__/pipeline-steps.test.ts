import { describe, expect, it } from 'vitest'
import { shouldAbortAnalysisPipeline } from '@/scripts/tli/batch/pipeline-steps'

describe('pipeline fail-closed policy', () => {
  it('aborts downstream analysis when any critical collection failure occurred', () => {
    expect(shouldAbortAnalysisPipeline({
      mode: 'full',
      datalabFailed: false,
      criticalFailures: 1,
    })).toBe(true)
  })

  it('aborts downstream analysis when datalab fails', () => {
    expect(shouldAbortAnalysisPipeline({
      mode: 'full',
      datalabFailed: true,
      criticalFailures: 0,
    })).toBe(true)
  })

  it('allows downstream analysis only when full mode collection is clean', () => {
    expect(shouldAbortAnalysisPipeline({
      mode: 'full',
      datalabFailed: false,
      criticalFailures: 0,
    })).toBe(false)
  })
})
