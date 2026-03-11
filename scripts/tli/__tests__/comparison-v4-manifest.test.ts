import { describe, expect, it } from 'vitest'
import {
  buildComparisonBackfillManifestRow,
  computeDeterministicParitySampleSize,
  evaluateRowCountParity,
  evaluateSampleContractParity,
} from '../comparison-v4-manifest'

describe('comparison v4 manifest helpers', () => {
  it('uses max(100, 5% of total) for parity sample size', () => {
    expect(computeDeterministicParitySampleSize(10)).toBe(100)
    expect(computeDeterministicParitySampleSize(1000)).toBe(100)
    expect(computeDeterministicParitySampleSize(5000)).toBe(250)
  })

  it('evaluates row-count parity strictly', () => {
    expect(evaluateRowCountParity(10, 10)).toBe(true)
    expect(evaluateRowCountParity(10, 9)).toBe(false)
  })

  it('evaluates sample contract parity by deep equality', () => {
    expect(evaluateSampleContractParity([{ a: 1 }], [{ a: 1 }])).toBe(true)
    expect(evaluateSampleContractParity([{ a: 1 }], [{ a: 2 }])).toBe(false)
  })

  it('builds a manifest row with parity flags and notes', () => {
    const row = buildComparisonBackfillManifestRow({
      sourceTable: 'theme_comparisons',
      sourceRowCount: 100,
      targetRowCount: 100,
      rowCountParityOk: true,
      sampleContractParityOk: false,
      notes: 'contract mismatch',
    })

    expect(row.source_table).toBe('theme_comparisons')
    expect(row.row_count_parity_ok).toBe(true)
    expect(row.sample_contract_parity_ok).toBe(false)
    expect(row.notes).toBe('contract mismatch')
  })
})
