import { describe, expect, it } from 'vitest'
import { buildComparisonV4CutoverSummary } from '../comparison-v4-cutover'

describe('comparison v4 cutover summary', () => {
  it('fails when any mandatory check fails', () => {
    const summary = buildComparisonV4CutoverSummary({
      contractParityOk: false,
      partialPublishExposureOk: true,
      rollbackDrillOk: true,
      retentionCleanupOk: true,
    })

    expect(summary.passed).toBe(false)
    expect(summary.failedChecks).toContain('contract_parity')
  })

  it('passes when all mandatory checks succeed', () => {
    const summary = buildComparisonV4CutoverSummary({
      contractParityOk: true,
      partialPublishExposureOk: true,
      rollbackDrillOk: true,
      retentionCleanupOk: true,
    })

    expect(summary.passed).toBe(true)
    expect(summary.failedChecks).toHaveLength(0)
    expect(summary.report).toContain('PASSED')
  })
})
