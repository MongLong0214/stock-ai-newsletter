import type { ComparisonBackfillManifestV2 } from '../../lib/tli/types/db'

export function computeDeterministicParitySampleSize(totalRows: number) {
  return Math.max(100, Math.ceil(totalRows * 0.05))
}

export function evaluateRowCountParity(sourceRowCount: number, targetRowCount: number) {
  return sourceRowCount === targetRowCount
}

function normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).sort(([a], [b]) => a.localeCompare(b)))
}

export function evaluateSampleContractParity(
  sourceSample: Array<Record<string, unknown>>,
  targetSample: Array<Record<string, unknown>>,
) {
  return JSON.stringify(sourceSample.map(normalizeRow)) === JSON.stringify(targetSample.map(normalizeRow))
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
