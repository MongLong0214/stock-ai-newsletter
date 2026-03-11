import type { ComparisonBackfillManifestV2 } from '../../lib/tli/types/db'

export function computeDeterministicParitySampleSize(totalRows: number) {
  return Math.max(100, Math.ceil(totalRows * 0.05))
}

export function evaluateRowCountParity(sourceRowCount: number, targetRowCount: number) {
  return sourceRowCount === targetRowCount
}

export function evaluateSampleContractParity(
  sourceSample: Array<Record<string, unknown>>,
  targetSample: Array<Record<string, unknown>>,
) {
  return JSON.stringify(sourceSample) === JSON.stringify(targetSample)
}

export function buildComparisonBackfillManifestRow(input: {
  sourceTable: string
  sourceRowCount: number
  targetRowCount: number
  rowCountParityOk: boolean
  sampleContractParityOk: boolean
  notes: string | null
}): ComparisonBackfillManifestV2 {
  return {
    manifest_id: crypto.randomUUID(),
    source_table: input.sourceTable,
    source_row_count: input.sourceRowCount,
    target_row_count: input.targetRowCount,
    row_count_parity_ok: input.rowCountParityOk,
    sample_contract_parity_ok: input.sampleContractParityOk,
    executed_at: new Date().toISOString(),
    notes: input.notes,
  }
}
