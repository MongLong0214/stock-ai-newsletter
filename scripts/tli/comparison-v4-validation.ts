export function evaluateContractParity(
  legacyPayload: Array<Record<string, unknown>>,
  candidatePayload: Array<Record<string, unknown>>,
) {
  return {
    ok: JSON.stringify(legacyPayload) === JSON.stringify(candidatePayload),
  }
}

export function evaluatePartialPublishExposure(
  runs: Array<{ id: string; status: string; publish_ready: boolean }>,
) {
  const invalid = runs.filter((run) => run.status !== 'published' || !run.publish_ready)
  return {
    ok: invalid.length === 0,
    invalidRunIds: invalid.map((run) => run.id),
  }
}

export function evaluateRollbackDrill(input: {
  flagReverted: boolean
  readerPinned: boolean
  parityChecked: boolean
  incidentLogged: boolean
}) {
  return {
    ok: input.flagReverted && input.readerPinned && input.parityChecked && input.incidentLogged,
  }
}

export function evaluateRetentionCleanup(input: {
  expiredRowsBefore: number
  expiredRowsAfter: number
}) {
  return {
    ok: input.expiredRowsBefore >= input.expiredRowsAfter && input.expiredRowsAfter === 0,
  }
}
