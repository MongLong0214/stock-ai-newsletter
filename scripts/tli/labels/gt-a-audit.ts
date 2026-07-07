export interface GtALabelAuditRow {
  readonly label_status: string
  readonly g_log_ratio: number | null
  readonly y_binary: boolean | null
  readonly rescale_suspect: boolean
  readonly low_signal: boolean
  readonly exclude_reason: string | null
}

export interface GtABackfillAudit {
  readonly totalLabels: number
  readonly finalCount: number
  readonly censoredRate: number
  readonly excludedByReason: Record<string, number>
  readonly rescaleSuspectRate: number
  readonly lowSignalRate: number
  readonly baseRate: number | null
  readonly deltaReviewRequired: boolean
  readonly gDistribution: {
    readonly p10: number | null
    readonly p25: number | null
    readonly p50: number | null
    readonly p75: number | null
    readonly p90: number | null
  }
}

const EMPTY_DISTRIBUTION = {
  p10: null,
  p25: null,
  p50: null,
  p75: null,
  p90: null,
} as const

const percentile = (sortedValues: readonly number[], p: number): number | null => {
  if (sortedValues.length === 0) return null
  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.ceil((p / 100) * sortedValues.length) - 1),
  )
  return sortedValues[index]
}

export function buildGtABackfillAudit(rows: readonly GtALabelAuditRow[]): GtABackfillAudit {
  const totalLabels = rows.length
  const finalRows = rows.filter((row) => row.label_status === 'final')
  const finalCount = finalRows.length
  const excludedByReason: Record<string, number> = {}

  for (const row of rows) {
    if (row.label_status !== 'excluded') continue
    const reason = row.exclude_reason ?? 'unknown'
    excludedByReason[reason] = (excludedByReason[reason] ?? 0) + 1
  }

  const denominator = totalLabels > 0 ? totalLabels : 1
  const positiveFinalCount = finalRows.filter((row) => row.y_binary === true).length
  const baseRate = finalCount > 0 ? positiveFinalCount / finalCount : null
  const sortedG = finalRows
    .flatMap((row) => row.g_log_ratio === null ? [] : [row.g_log_ratio])
    .sort((left, right) => left - right)

  return {
    totalLabels,
    finalCount,
    censoredRate: rows.filter((row) => row.label_status === 'censored').length / denominator,
    excludedByReason,
    rescaleSuspectRate: rows.filter((row) => row.rescale_suspect).length / denominator,
    lowSignalRate: rows.filter((row) => row.low_signal).length / denominator,
    baseRate,
    deltaReviewRequired: baseRate === null || baseRate < 0.20 || baseRate > 0.50,
    gDistribution: sortedG.length === 0
      ? EMPTY_DISTRIBUTION
      : {
        p10: percentile(sortedG, 10),
        p25: percentile(sortedG, 25),
        p50: percentile(sortedG, 50),
        p75: percentile(sortedG, 75),
        p90: percentile(sortedG, 90),
      },
  }
}
