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

// ── CMPV4-014: replay idempotency ──

interface ReplayCandidate {
  candidate_theme_id: string
  similarity_score: number
  rank: number
}

const FLOAT_EPSILON = 1e-6

export function evaluateReplayIdempotency(
  run1: ReplayCandidate[],
  run2: ReplayCandidate[],
): { ok: boolean; mismatchCount: number } {
  if (run1.length !== run2.length) {
    return { ok: false, mismatchCount: Math.max(run1.length, run2.length) }
  }

  let mismatchCount = 0
  for (let i = 0; i < run1.length; i++) {
    const a = run1[i]
    const b = run2[i]
    if (
      a.candidate_theme_id !== b.candidate_theme_id ||
      a.rank !== b.rank ||
      Math.abs(a.similarity_score - b.similarity_score) > FLOAT_EPSILON
    ) {
      mismatchCount++
    }
  }

  return { ok: mismatchCount === 0, mismatchCount }
}

// ── CMPV4-014: field-level contract parity ──

interface FieldMismatch {
  index: number
  field: string
  legacy: unknown
  candidate: unknown
}

export function evaluateContractParityV2(
  legacyPayload: Array<Record<string, unknown>>,
  candidatePayload: Array<Record<string, unknown>>,
  requiredFields: string[],
): { ok: boolean; fieldMismatches: FieldMismatch[]; rowCountMismatch: boolean } {
  if (legacyPayload.length !== candidatePayload.length) {
    return { ok: false, fieldMismatches: [], rowCountMismatch: true }
  }

  const mismatches: FieldMismatch[] = []
  for (let i = 0; i < legacyPayload.length; i++) {
    for (const field of requiredFields) {
      const legacyVal = legacyPayload[i][field]
      const candidateVal = candidatePayload[i][field]
      if (legacyVal !== candidateVal) {
        mismatches.push({ index: i, field, legacy: legacyVal, candidate: candidateVal })
      }
    }
  }

  return { ok: mismatches.length === 0, fieldMismatches: mismatches, rowCountMismatch: false }
}
