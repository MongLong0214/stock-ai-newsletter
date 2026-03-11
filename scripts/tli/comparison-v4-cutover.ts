export function buildComparisonV4CutoverSummary(input: {
  contractParityOk: boolean
  partialPublishExposureOk: boolean
  rollbackDrillOk: boolean
  retentionCleanupOk: boolean
}) {
  const failedChecks: string[] = []
  if (!input.contractParityOk) failedChecks.push('contract_parity')
  if (!input.partialPublishExposureOk) failedChecks.push('partial_publish_exposure')
  if (!input.rollbackDrillOk) failedChecks.push('rollback_drill')
  if (!input.retentionCleanupOk) failedChecks.push('retention_cleanup')

  const passed = failedChecks.length === 0
  const report = [
    '# Comparison v4 Cutover Summary',
    '',
    `Status: ${passed ? 'PASSED' : 'FAILED'}`,
    '',
    `Failed checks: ${failedChecks.length > 0 ? failedChecks.join(', ') : 'none'}`,
  ].join('\n')

  return { passed, failedChecks, report }
}
