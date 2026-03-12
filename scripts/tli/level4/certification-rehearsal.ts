export interface CertificationChecklistItem {
  id: string
  label: string
  passed: boolean
}

export function buildLevel4CertificationChecklist(input: {
  calibrationArtifact: boolean
  probabilityServing: boolean
  promotionGate: boolean
  driftReport: boolean
  rollbackDrill: boolean
  payloadMetadataVerified: boolean
  uiLowConfidencePathVerified: boolean
}) {
  const items: CertificationChecklistItem[] = [
    { id: 'calibration-artifact', label: 'Calibration artifact exists and is certification-grade', passed: input.calibrationArtifact },
    { id: 'probability-serving', label: 'Probability/CI/confidence serving path verified', passed: input.probabilityServing },
    { id: 'promotion-gate', label: 'Promotion gate and fail-closed behavior verified', passed: input.promotionGate },
    { id: 'drift-report', label: 'Drift report and auto-hold path verified', passed: input.driftReport },
    { id: 'rollback-drill', label: 'Rollback drill evidence captured', passed: input.rollbackDrill },
    { id: 'payload-metadata', label: 'User-facing payload metadata verified', passed: input.payloadMetadataVerified },
    { id: 'ui-low-confidence', label: 'UI low-confidence badge/copy path verified', passed: input.uiLowConfidencePathVerified },
  ]

  return {
    items,
    passed: items.every((item) => item.passed),
  }
}

export function renderLevel4CertificationReport(input: {
  releaseCandidate: string
  checklist: ReturnType<typeof buildLevel4CertificationChecklist>
  rollbackEvidence: string
  summary: string
}) {
  return [
    '# TLI Comparison Level-4 Certification Report',
    '',
    `Release Candidate: ${input.releaseCandidate}`,
    `Overall Verdict: ${input.checklist.passed ? 'PASS' : 'FAIL'}`,
    '',
    'Checklist:',
    ...input.checklist.items.map((item) => `- [${item.passed ? 'x' : ' '}] ${item.label}`),
    '',
    `Rollback Evidence: ${input.rollbackEvidence}`,
    '',
    'Notes:',
    input.summary,
    '',
    'UI low-confidence badge/copy path is explicitly included in this certification checklist.',
  ].join('\n')
}
