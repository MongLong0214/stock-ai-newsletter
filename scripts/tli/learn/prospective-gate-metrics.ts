import {
  FROZEN_HASH_KEYS,
  isFiniteUnit,
  PROSPECTIVE_GATE_LIMITS,
  SHA256_PATTERN,
  sortedUnique,
  type FrozenHashes,
} from './prospective-gate-contract'

export interface SafetyCheckpointInput {
  readonly cycleId: string
  readonly sequenceStart: 1
  readonly sequenceEnd: 8
  readonly rows: readonly {
    readonly originDate: string
    readonly themeId: string
    readonly candidateProbability: number
    readonly outcome: boolean
  }[]
  readonly criticalIncidentCount: number
  readonly gateInputSha256: string
  readonly frozenHashes: FrozenHashes
}

const fixedBinEce = (rows: SafetyCheckpointInput['rows']): number => {
  const bins = Array.from({ length: 10 }, () => ({
    count: 0, probability: 0, probabilityCompensation: 0, outcome: 0,
  }))
  for (const row of rows) {
    const bin = bins[Math.min(9, Math.floor(row.candidateProbability * 10))]
    bin.count += 1
    const compensatedProbability = row.candidateProbability - bin.probabilityCompensation
    const nextProbability = bin.probability + compensatedProbability
    bin.probabilityCompensation = (nextProbability - bin.probability) - compensatedProbability
    bin.probability = nextProbability
    bin.outcome += row.outcome ? 1 : 0
  }
  if (rows.length === 0) return 0
  return bins.reduce((ece, bin) => bin.count === 0
    ? ece
    : ece + (bin.count / rows.length) * Math.abs(bin.probability / bin.count - bin.outcome / bin.count), 0)
}

export function evaluateSafetyCheckpoint(input: SafetyCheckpointInput) {
  if (input.sequenceStart !== 1 || input.sequenceEnd !== PROSPECTIVE_GATE_LIMITS.safetyOrigins) {
    throw new TypeError('safety checkpoint requires immutable sequences 1 through 8')
  }
  if (!Number.isInteger(input.criticalIncidentCount) || input.criticalIncidentCount < 0) {
    throw new TypeError('critical incident count must be a nonnegative integer')
  }
  if (!SHA256_PATTERN.test(input.gateInputSha256)
    || FROZEN_HASH_KEYS.some((key) => !SHA256_PATTERN.test(input.frozenHashes[key]))) {
    throw new TypeError('safety checkpoint hashes must be lowercase SHA-256 values')
  }
  const probabilitiesValid = input.rows.every((row) => isFiniteUnit(row.candidateProbability))
  const pooledBrier = input.rows.length === 0
    ? 0
    : probabilitiesValid
      ? input.rows.reduce((sum, row) => sum + (row.candidateProbability - (row.outcome ? 1 : 0)) ** 2, 0) / input.rows.length
      : 1
  const ece = input.rows.length === 0 ? 0 : probabilitiesValid ? fixedBinEce(input.rows) : 1
  const reasons: string[] = []
  if (!probabilitiesValid) reasons.push('invalid_probability')
  if (pooledBrier > PROSPECTIVE_GATE_LIMITS.maximumSafetyBrier) {
    reasons.push('pooled_brier_catastrophe')
  }
  if (ece > PROSPECTIVE_GATE_LIMITS.maximumSafetyEce) reasons.push('fixed_bin_ece_catastrophe')
  if (input.criticalIncidentCount > 0) reasons.push('critical_incident')
  const failureReasons = sortedUnique(reasons)
  const pass = failureReasons.length === 0
  return {
    cycleId: input.cycleId,
    sequenceStart: input.sequenceStart,
    sequenceEnd: input.sequenceEnd,
    decision: pass ? 'pass' as const : 'safety_hold' as const,
    action: pass ? 'safety_only' as const : 'safety_hold' as const,
    reasons: pass ? ['all_safety_checks_passed'] : failureReasons,
    sampleStatus: input.rows.length === 0 ? 'empty' as const : 'evaluated' as const,
    exactPairedCount: input.rows.length,
    probabilitiesValid,
    pooledBrier,
    fixedBinEce: ece,
    criticalIncidentCount: input.criticalIncidentCount,
    gateInputSha256: input.gateInputSha256,
    frozenHashes: input.frozenHashes,
  }
}

export interface PAt10Row {
  readonly originDate: string
  readonly themeId: string
  readonly candidateProbability: number
  readonly comparatorProbability: number
  readonly outcome: boolean
}

const lexicalCompare = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0
const precision = (rows: readonly PAt10Row[], probability: 'candidateProbability' | 'comparatorProbability'): number => (
  [...rows]
    .sort((left, right) => right[probability] - left[probability] || lexicalCompare(left.themeId, right.themeId))
    .slice(0, 10)
    .reduce((sum, row) => sum + (row.outcome ? 1 : 0), 0) / 10
)

export function calculatePAt10(rows: readonly PAt10Row[], plannedOrigins: number) {
  if (!Number.isInteger(plannedOrigins) || plannedOrigins < PROSPECTIVE_GATE_LIMITS.minimumPlannedOrigins
    || plannedOrigins > PROSPECTIVE_GATE_LIMITS.maximumPlannedOrigins) {
    throw new TypeError('P@10 requires a valid frozen planned-origin count')
  }
  if (rows.some((row) => !isFiniteUnit(row.candidateProbability) || !isFiniteUnit(row.comparatorProbability))) {
    throw new TypeError('P@10 probabilities must be finite and in range')
  }
  const byOrigin = new Map<string, PAt10Row[]>()
  for (const row of rows) byOrigin.set(row.originDate, [...(byOrigin.get(row.originDate) ?? []), row])
  const eligible = [...byOrigin.entries()]
    .sort(([left], [right]) => lexicalCompare(left, right))
    .map(([, originRows]) => originRows)
    .filter((originRows) => originRows.length >= 10)
  const mean = (probability: 'candidateProbability' | 'comparatorProbability') => eligible.length === 0
    ? 0
    : eligible.reduce((sum, originRows) => sum + precision(originRows, probability), 0) / eligible.length
  return {
    candidate: mean('candidateProbability'), comparator: mean('comparatorProbability'),
    validOrigins: eligible.length,
    requiredOrigins: Math.max(
      PROSPECTIVE_GATE_LIMITS.minimumPAt10Origins,
      Math.ceil(PROSPECTIVE_GATE_LIMITS.minimumPAt10OriginShare * plannedOrigins),
    ),
    tieBreak: 'probability_desc_theme_id_asc' as const,
  }
}

export type KospiRegime = 'risk_off' | 'neutral' | 'risk_on'
export const classifyKospiRegime = (return20TradingDays: number): KospiRegime => {
  if (!Number.isFinite(return20TradingDays)) throw new TypeError('KOSPI 20-trading-day return must be finite')
  if (return20TradingDays <= -0.03) return 'risk_off'
  if (return20TradingDays >= 0.03) return 'risk_on'
  return 'neutral'
}
