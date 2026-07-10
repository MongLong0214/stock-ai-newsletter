import { canonicalJsonV1Sha256 } from '../../../lib/tli/canonical-json-v1'
import {
  FROZEN_HASH_KEYS,
  isFiniteUnit,
  PROSPECTIVE_GATE_LIMITS,
  SHA256_PATTERN,
  sortedUnique,
  THRESHOLD_EPSILON,
  type FrozenHashes,
} from './prospective-gate-contract'
import type { KospiRegime } from './prospective-gate-metrics'

export interface BootstrapResultCore {
  readonly contractVersion: string
  readonly method: string
  readonly replicates: number
  readonly movingBlockLength: number
  readonly eceBinCount: number
  readonly inputSha256: string
  readonly deltaBrier: { readonly seed: number; readonly point: number; readonly upper99: number; readonly replicateSha256: string }
  readonly ece: { readonly seed: number; readonly point: number; readonly upper95: number; readonly replicateSha256: string }
  readonly regimeLower95: Readonly<Record<KospiRegime, {
    readonly seed: number
    readonly lower95: number
    readonly replicateSha256: string
  } | null>>
}
export interface BootstrapResult extends BootstrapResultCore { readonly resultSha256: string }

const bootstrapCore = (result: BootstrapResultCore | BootstrapResult): BootstrapResultCore => ({
  contractVersion: result.contractVersion, method: result.method, replicates: result.replicates,
  movingBlockLength: result.movingBlockLength, eceBinCount: result.eceBinCount,
  inputSha256: result.inputSha256, deltaBrier: result.deltaBrier, ece: result.ece,
  regimeLower95: result.regimeLower95,
})
export const bootstrapResultSha256 = (result: BootstrapResultCore | BootstrapResult): string => (
  canonicalJsonV1Sha256(bootstrapCore(result))
)

export interface FinalPromotionGateInput {
  readonly cycleId: string
  readonly plannedOrigins: number
  readonly sequenceStart: number
  readonly sequenceEnd: number
  readonly completeness: {
    readonly pooledRatio: number
    readonly minimumOriginRatio: number
    readonly terminalAccountingRatio: number
    readonly maximumOriginSourceGapRatio: number
    readonly pooledCoverage: number
  }
  readonly metrics: {
    readonly candidateBrier: number
    readonly comparatorBrier: number
    readonly pAt10Candidate: number
    readonly pAt10Comparator: number
    readonly pAt10ValidOrigins: number
    readonly pAt10RequiredOrigins: number
    readonly pAt10TieBreak: string
    readonly regimes: readonly {
      readonly regime: KospiRegime
      readonly originCount: number
      readonly pairedRowCount: number
      readonly candidateBrier: number
      readonly comparatorBrier: number
      readonly deltaLower95: number | null
    }[]
  }
  readonly criticalIncidentCount: number
  readonly gateInputSha256: string
  readonly frozenHashes: FrozenHashes
  readonly expectedFrozenHashes: FrozenHashes
  readonly bootstrap: BootstrapResult
}

const bootstrapContractReasons = (input: FinalPromotionGateInput): string[] => {
  const { bootstrap } = input
  const reasons: string[] = []
  if (bootstrap.contractVersion !== 'bootstrap-v1'
    || bootstrap.method !== 'theme_x_two_week_moving_block'
    || bootstrap.replicates !== 10_000
    || bootstrap.movingBlockLength !== 2
    || bootstrap.eceBinCount !== 10) reasons.push('bootstrap_contract_mismatch')
  if (!SHA256_PATTERN.test(bootstrap.inputSha256) || bootstrap.inputSha256 !== input.gateInputSha256) {
    reasons.push('bootstrap_input_hash_mismatch')
  }
  const regimeKeys = Object.keys(bootstrap.regimeLower95).sort()
  if (regimeKeys.join('|') !== 'neutral|risk_off|risk_on') reasons.push('bootstrap_contract_mismatch')
  const regimeReplicates = Object.values(bootstrap.regimeLower95).filter((result) => result !== null)
  const replicates = [bootstrap.deltaBrier, bootstrap.ece, ...regimeReplicates]
  if (replicates.some((result) => !Number.isSafeInteger(result.seed) || result.seed < 0
    || !SHA256_PATTERN.test(result.replicateSha256))) reasons.push('bootstrap_replicate_contract_mismatch')
  if (![bootstrap.deltaBrier.point, bootstrap.deltaBrier.upper99, bootstrap.ece.point, bootstrap.ece.upper95,
    ...regimeReplicates.map((result) => result.lower95)].every(Number.isFinite)) {
    reasons.push('bootstrap_result_invalid')
  }
  try {
    if (!SHA256_PATTERN.test(bootstrap.resultSha256) || bootstrapResultSha256(bootstrap) !== bootstrap.resultSha256) {
      reasons.push('bootstrap_result_hash_mismatch')
    }
  } catch {
    reasons.push('bootstrap_result_hash_mismatch')
  }
  return reasons
}

const evaluateRegimes = (input: FinalPromotionGateInput, reasons: string[]) => {
  const order: readonly KospiRegime[] = ['risk_off', 'neutral', 'risk_on']
  if (new Set(input.metrics.regimes.map((metric) => metric.regime)).size !== order.length
    || input.metrics.regimes.length !== order.length) reasons.push('regime_contract_mismatch')
  return order.map((regime) => {
    const metric = input.metrics.regimes.find((candidate) => candidate.regime === regime)
    if (!metric) return { regime, gateEligible: false, status: 'insufficient_regime_sample' as const, relativeBrierWorsening: null }
    const gateEligible = metric.originCount >= PROSPECTIVE_GATE_LIMITS.minimumRegimeOrigins
      && metric.pairedRowCount >= PROSPECTIVE_GATE_LIMITS.minimumRegimeRows
    if (!Number.isInteger(metric.originCount) || metric.originCount < 0
      || !Number.isInteger(metric.pairedRowCount) || metric.pairedRowCount < 0) reasons.push('regime_metric_invalid')
    if (!gateEligible) {
      if (input.bootstrap.regimeLower95[regime] !== null) reasons.push('bootstrap_ineligible_regime_result_present')
      return { ...metric, gateEligible: false, status: 'insufficient_regime_sample' as const, relativeBrierWorsening: null }
    }
    const regimeBootstrap = input.bootstrap.regimeLower95[regime]
    const bootstrapLower = regimeBootstrap?.lower95
    if (!isFiniteUnit(metric.candidateBrier) || !Number.isFinite(metric.comparatorBrier) || metric.comparatorBrier <= 0
      || metric.comparatorBrier > 1 || metric.deltaLower95 === null || !Number.isFinite(metric.deltaLower95)) {
      reasons.push('regime_metric_invalid')
      return { ...metric, gateEligible: true, status: 'invalid_regime_metric' as const, relativeBrierWorsening: null }
    }
    if (regimeBootstrap === null || !Number.isFinite(bootstrapLower)
      || bootstrapLower !== metric.deltaLower95) reasons.push('bootstrap_regime_mismatch')
    const relativeBrierWorsening = metric.candidateBrier / metric.comparatorBrier - 1
    const catastrophic = metric.candidateBrier >= metric.comparatorBrier
      * (1 + PROSPECTIVE_GATE_LIMITS.catastrophicRegimeWorsening)
      && metric.deltaLower95 > 0
    if (catastrophic) reasons.push('regime_catastrophic_reversal')
    return {
      ...metric, gateEligible: true,
      status: catastrophic ? 'catastrophic_reversal' as const : 'pass' as const,
      relativeBrierWorsening,
    }
  })
}

export function evaluateFinalPromotionGate(input: FinalPromotionGateInput) {
  const reasons = bootstrapContractReasons(input)
  if (!Number.isInteger(input.plannedOrigins) || input.plannedOrigins < PROSPECTIVE_GATE_LIMITS.minimumPlannedOrigins
    || input.plannedOrigins > PROSPECTIVE_GATE_LIMITS.maximumPlannedOrigins
    || input.sequenceStart !== 1 || input.sequenceEnd !== input.plannedOrigins) reasons.push('planned_origin_contract_mismatch')
  if (![input.completeness.pooledRatio, input.completeness.minimumOriginRatio,
    input.completeness.terminalAccountingRatio, input.completeness.maximumOriginSourceGapRatio,
    input.completeness.pooledCoverage].every(isFiniteUnit)) reasons.push('completeness_metric_invalid')
  if (input.completeness.pooledRatio < PROSPECTIVE_GATE_LIMITS.minimumCompleteness
    || input.completeness.minimumOriginRatio < PROSPECTIVE_GATE_LIMITS.minimumCompleteness) {
    reasons.push('completeness_below_99pct')
  }
  if (input.completeness.terminalAccountingRatio < PROSPECTIVE_GATE_LIMITS.minimumTerminalAccounting) reasons.push('terminal_accounting_incomplete')
  if (input.completeness.maximumOriginSourceGapRatio
    > PROSPECTIVE_GATE_LIMITS.maximumSourceGapRatio) reasons.push('source_gap_above_1pct')
  if (input.completeness.pooledCoverage
    < PROSPECTIVE_GATE_LIMITS.minimumCoverage) reasons.push('coverage_below_70pct')
  if (!SHA256_PATTERN.test(input.gateInputSha256)) reasons.push('gate_input_hash_invalid')
  if (FROZEN_HASH_KEYS.some((key) => !SHA256_PATTERN.test(input.frozenHashes[key])
    || !SHA256_PATTERN.test(input.expectedFrozenHashes[key])
    || input.frozenHashes[key] !== input.expectedFrozenHashes[key])) reasons.push('frozen_hash_mismatch')

  const briersValid = isFiniteUnit(input.metrics.candidateBrier)
    && Number.isFinite(input.metrics.comparatorBrier)
    && input.metrics.comparatorBrier > 0 && input.metrics.comparatorBrier <= 1
  const relativeBrierImprovement = briersValid
    ? 1 - input.metrics.candidateBrier / input.metrics.comparatorBrier
    : null
  if (relativeBrierImprovement === null) reasons.push('brier_metric_invalid')
  else if (input.metrics.candidateBrier > input.metrics.comparatorBrier
    * (1 - PROSPECTIVE_GATE_LIMITS.minimumRelativeBrierImprovement)) {
    reasons.push('relative_brier_improvement_below_2pct')
  }
  if (briersValid && Math.abs(
    input.bootstrap.deltaBrier.point - (input.metrics.candidateBrier - input.metrics.comparatorBrier),
  ) > THRESHOLD_EPSILON) reasons.push('bootstrap_delta_point_mismatch')
  if (!(input.bootstrap.deltaBrier.upper99 < 0)) reasons.push('delta_brier_upper99_not_below_zero')
  if (!isFiniteUnit(input.bootstrap.ece.point)
    || input.bootstrap.ece.point > PROSPECTIVE_GATE_LIMITS.maximumFinalEce) {
    reasons.push('ece_point_above_10pct')
  }
  if (!isFiniteUnit(input.bootstrap.ece.upper95)
    || input.bootstrap.ece.upper95
      > PROSPECTIVE_GATE_LIMITS.maximumFinalEceUpper95) reasons.push('ece_upper95_above_12pct')

  const requiredPAt10 = Math.max(
    PROSPECTIVE_GATE_LIMITS.minimumPAt10Origins,
    Math.ceil(PROSPECTIVE_GATE_LIMITS.minimumPAt10OriginShare * input.plannedOrigins),
  )
  if (!Number.isInteger(input.metrics.pAt10ValidOrigins) || input.metrics.pAt10ValidOrigins < 0
    || input.metrics.pAt10ValidOrigins > input.plannedOrigins
    || !Number.isInteger(input.metrics.pAt10RequiredOrigins)
    || input.metrics.pAt10RequiredOrigins !== requiredPAt10
    || input.metrics.pAt10TieBreak !== 'probability_desc_theme_id_asc') reasons.push('p_at_10_contract_mismatch')
  if (input.metrics.pAt10ValidOrigins < requiredPAt10) reasons.push('p_at_10_insufficient_origins')
  if (!isFiniteUnit(input.metrics.pAt10Candidate) || !isFiniteUnit(input.metrics.pAt10Comparator)) reasons.push('p_at_10_metric_invalid')
  else if (input.metrics.pAt10Candidate + PROSPECTIVE_GATE_LIMITS.maximumPAt10Drop
    < input.metrics.pAt10Comparator) {
    reasons.push('p_at_10_guardrail')
  }
  if (!Number.isInteger(input.criticalIncidentCount) || input.criticalIncidentCount !== 0) reasons.push('critical_incident')

  const regimes = evaluateRegimes(input, reasons)
  const failureReasons = sortedUnique(reasons)
  const pass = failureReasons.length === 0
  return {
    cycleId: input.cycleId,
    plannedOrigins: input.plannedOrigins,
    sequenceStart: input.sequenceStart,
    sequenceEnd: input.sequenceEnd,
    decision: pass ? 'pass' as const : 'reject' as const,
    action: pass ? 'would_promote' as const : 'keep_champion' as const,
    reasons: pass ? ['all_gates_passed'] : failureReasons,
    relativeBrierImprovement,
    regimes,
    completeness: input.completeness,
    metrics: input.metrics,
    criticalIncidentCount: input.criticalIncidentCount,
    gateInputSha256: input.gateInputSha256,
    frozenHashes: input.frozenHashes,
    expectedFrozenHashes: input.expectedFrozenHashes,
    bootstrap: input.bootstrap,
  }
}
