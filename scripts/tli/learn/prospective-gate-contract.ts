export const PROSPECTIVE_GATE_LIMITS = {
  safetyOrigins: 8,
  maximumSafetyBrier: 0.35,
  maximumSafetyEce: 0.20,
  minimumPlannedOrigins: 16,
  maximumPlannedOrigins: 52,
  minimumCompleteness: 0.99,
  minimumTerminalAccounting: 1,
  maximumSourceGapRatio: 0.01,
  minimumCoverage: 0.70,
  minimumRelativeBrierImprovement: 0.02,
  maximumFinalEce: 0.10,
  maximumFinalEceUpper95: 0.12,
  maximumPAt10Drop: 0.05,
  minimumPAt10Origins: 12,
  minimumPAt10OriginShare: 0.80,
  minimumRegimeOrigins: 4,
  minimumRegimeRows: 100,
  catastrophicRegimeWorsening: 0.20,
} as const

export interface FrozenHashes {
  readonly studyContractSha256: string
  readonly candidateModelSha256: string
  readonly comparatorArtifactSha256: string
  readonly datasetManifestSha256: string
  readonly featureContractSha256: string
  readonly labelContractSha256: string
  readonly calibrationArtifactSha256: string
}

export const FROZEN_HASH_KEYS = [
  'studyContractSha256', 'candidateModelSha256', 'comparatorArtifactSha256',
  'datasetManifestSha256', 'featureContractSha256', 'labelContractSha256',
  'calibrationArtifactSha256',
] as const satisfies readonly (keyof FrozenHashes)[]
export const SHA256_PATTERN = /^[0-9a-f]{64}$/
export const THRESHOLD_EPSILON = 1e-12
export const isFiniteUnit = (value: number): boolean => Number.isFinite(value) && value >= 0 && value <= 1
export const sortedUnique = (values: readonly string[]): string[] => [...new Set(values)].sort()

export interface ProspectiveOrigin {
  readonly sequenceNo: number
  readonly originDate: string
  readonly enrollmentRole: 'confirmatory' | string
  readonly eligible: boolean
}

export interface ProspectiveLifecycleInput {
  readonly cycleId: string
  readonly cycleStatus: string
  readonly plannedOrigins: number
  readonly safetyOrigins: number
  readonly enrolledOrigins: readonly ProspectiveOrigin[]
  readonly safetyCheckedAt: string | null
  readonly safetyArtifact: { readonly decision: 'pass' | 'safety_hold'; readonly attested: boolean } | null
  readonly decisionAt: string | null
}

export type ProspectiveCheckpoint =
  | { readonly kind: 'safety_due'; readonly cycleId: string; readonly sequenceStart: 1; readonly sequenceEnd: 8 }
  | { readonly kind: 'final_due'; readonly cycleId: string; readonly sequenceStart: 1; readonly sequenceEnd: number; readonly plannedOrigins: number }
  | { readonly kind: 'insufficient_origins'; readonly checkpoint: 'safety' | 'final'; readonly eligibleThroughSequence: number; readonly missingSequences: readonly number[]; readonly duplicateSequences: readonly number[] }
  | { readonly kind: 'safety_evidence_missing'; readonly eligibleThroughSequence: number }
  | { readonly kind: 'already_recorded'; readonly checkpoint: 'safety' | 'final' }
  | { readonly kind: 'inactive_cycle'; readonly cycleStatus: string }
  | { readonly kind: 'invalid_lifecycle'; readonly reason: 'invalid_planned_origins' | 'invalid_safety_origin_contract' }

const sequenceState = (origins: readonly ProspectiveOrigin[], end: number) => {
  const counts = new Map<number, number>()
  for (const origin of origins) {
    if (origin.enrollmentRole !== 'confirmatory' || !origin.eligible) continue
    counts.set(origin.sequenceNo, (counts.get(origin.sequenceNo) ?? 0) + 1)
  }
  const missing: number[] = []
  const duplicates: number[] = []
  let eligibleThrough = 0
  for (let sequence = 1; sequence <= end; sequence += 1) {
    const count = counts.get(sequence) ?? 0
    if (count !== 1) missing.push(sequence)
    if (count > 1) duplicates.push(sequence)
    if (sequence === eligibleThrough + 1 && count === 1) eligibleThrough = sequence
  }
  return { complete: missing.length === 0, missing, duplicates, eligibleThrough }
}

export function resolveProspectiveCheckpoint(input: ProspectiveLifecycleInput): ProspectiveCheckpoint {
  if (!Number.isInteger(input.plannedOrigins) || input.plannedOrigins < PROSPECTIVE_GATE_LIMITS.minimumPlannedOrigins
    || input.plannedOrigins > PROSPECTIVE_GATE_LIMITS.maximumPlannedOrigins) {
    return { kind: 'invalid_lifecycle', reason: 'invalid_planned_origins' }
  }
  if (input.safetyOrigins !== PROSPECTIVE_GATE_LIMITS.safetyOrigins) {
    return { kind: 'invalid_lifecycle', reason: 'invalid_safety_origin_contract' }
  }
  if (input.decisionAt !== null || input.cycleStatus === 'ready_for_decision' || input.cycleStatus === 'rejected') {
    return { kind: 'already_recorded', checkpoint: 'final' }
  }
  if (input.cycleStatus === 'safety_hold') return { kind: 'already_recorded', checkpoint: 'safety' }
  if (input.cycleStatus !== 'running') return { kind: 'inactive_cycle', cycleStatus: input.cycleStatus }

  const safety = sequenceState(input.enrolledOrigins, PROSPECTIVE_GATE_LIMITS.safetyOrigins)
  const passingSafety = input.safetyCheckedAt !== null
    && input.safetyArtifact?.decision === 'pass'
    && input.safetyArtifact.attested
  if (!passingSafety) {
    if (input.safetyCheckedAt !== null || input.safetyArtifact !== null) {
      return { kind: 'safety_evidence_missing', eligibleThroughSequence: safety.eligibleThrough }
    }
    if (!safety.complete) {
      return {
        kind: 'insufficient_origins', checkpoint: 'safety',
        eligibleThroughSequence: safety.eligibleThrough,
        missingSequences: safety.missing, duplicateSequences: safety.duplicates,
      }
    }
    return { kind: 'safety_due', cycleId: input.cycleId, sequenceStart: 1, sequenceEnd: 8 }
  }

  const final = sequenceState(input.enrolledOrigins, input.plannedOrigins)
  if (!final.complete) {
    return {
      kind: 'insufficient_origins', checkpoint: 'final',
      eligibleThroughSequence: final.eligibleThrough,
      missingSequences: final.missing, duplicateSequences: final.duplicates,
    }
  }
  return {
    kind: 'final_due', cycleId: input.cycleId, sequenceStart: 1,
    sequenceEnd: input.plannedOrigins, plannedOrigins: input.plannedOrigins,
  }
}
