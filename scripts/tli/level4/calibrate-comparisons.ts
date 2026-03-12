export interface CertificationFinding {
  finding: string
  stats: Record<string, string>
}

export interface CertificationCalibrationReportInput {
  objective: string
  dataSummary: string
  findings: CertificationFinding[]
  limitations: string[]
}

export interface CalibrationReportConsistencyInput {
  artifact: {
    calibration_version: string
    brier_score_before: number
    brier_score_after: number
    ece_before: number
    ece_after: number
  }
  reportMetrics: {
    brierBefore: number
    brierAfter: number
    eceBefore: number
    eceAfter: number
  }
}

export function renderCertificationCalibrationReport(input: CertificationCalibrationReportInput): string {
  const findingLines = input.findings.flatMap((entry) => [
    '[FINDING]',
    entry.finding,
    ...Object.entries(entry.stats).map(([name, value]) => `[STAT:${name}] ${value}`),
  ])

  return [
    '[OBJECTIVE]',
    input.objective,
    '[DATA]',
    input.dataSummary,
    ...findingLines,
    ...input.limitations.flatMap((limitation) => ['[LIMITATION]', limitation]),
  ].join('\n')
}

export function verifyCalibrationReportConsistency(
  input: CalibrationReportConsistencyInput,
): { ok: boolean; mismatches: string[] } {
  const mismatches: string[] = []
  if (input.artifact.brier_score_before !== input.reportMetrics.brierBefore) mismatches.push('brierBefore')
  if (input.artifact.brier_score_after !== input.reportMetrics.brierAfter) mismatches.push('brierAfter')
  if (input.artifact.ece_before !== input.reportMetrics.eceBefore) mismatches.push('eceBefore')
  if (input.artifact.ece_after !== input.reportMetrics.eceAfter) mismatches.push('eceAfter')

  return {
    ok: mismatches.length === 0,
    mismatches,
  }
}

export function summarizeClusterBootstrapCi(samples: number[]): {
  method: 'cluster_bootstrap'
  lower: number
  upper: number
} {
  const sorted = [...samples].sort((a, b) => a - b)
  const lastIndex = sorted.length - 1
  const lowerIndex = Math.max(0, Math.floor(lastIndex * 0.025))
  const upperIndex = Math.min(lastIndex, Math.ceil(lastIndex * 0.975))
  return {
    method: 'cluster_bootstrap',
    lower: sorted[lowerIndex],
    upper: sorted[upperIndex],
  }
}
