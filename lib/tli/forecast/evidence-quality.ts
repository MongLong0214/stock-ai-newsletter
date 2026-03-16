/**
 * TCAR-016: Evidence-Quality Scoring and Abstention Logic
 *
 * Computes evidence quality scores and determines if forecast should abstain.
 * All functions are PURE (no DB calls).
 */
import { ABSTENTION_THRESHOLDS } from './types'

// --- Types ---

export interface EvidenceInput {
  analogSupportCount: number
  candidateConcentrationGini: number
  top1AnalogWeight: number
  analogFuturePathCoverage: number
  mismatchCount: number
}

export interface AbstentionInput {
  analogSupportCount: number
  candidateConcentrationGini: number
  top1AnalogWeight: number
}

export type AbstentionReason =
  | 'insufficient_analog_support'
  | 'high_candidate_concentration'
  | 'dominant_single_analog'

export interface AbstentionResult {
  abstain: boolean
  reasons: AbstentionReason[]
}

// --- Constants ---

const SUPPORT_SATURATION = 20
const MISMATCH_PENALTY_FACTOR = 0.05

// --- Evidence-Quality Scoring ---

export const computeEvidenceQualityScore = (input: EvidenceInput): number => {
  // Component 1: analog support (0-1, saturates at SUPPORT_SATURATION)
  const supportScore = Math.min(input.analogSupportCount / SUPPORT_SATURATION, 1)

  // Component 2: concentration diversity (lower gini = better, invert)
  const diversityScore = 1 - Math.min(input.candidateConcentrationGini, 1)

  // Component 3: weight spread (lower top1 weight = better, invert)
  const spreadScore = 1 - Math.min(input.top1AnalogWeight, 1)

  // Component 4: coverage (direct, 0-1)
  const coverageScore = Math.max(0, Math.min(input.analogFuturePathCoverage, 1))

  // Component 5: mismatch penalty (reduces score)
  const mismatchPenalty = Math.min(input.mismatchCount * MISMATCH_PENALTY_FACTOR, 1)

  // Weighted combination
  const raw =
    0.25 * supportScore +
    0.20 * diversityScore +
    0.20 * spreadScore +
    0.25 * coverageScore -
    0.10 * mismatchPenalty

  const clamped = Math.max(0, Math.min(1, raw))
  return isFinite(clamped) ? clamped : 0
}

// --- Abstention Logic ---

export const shouldAbstain = (input: AbstentionInput): AbstentionResult => {
  const reasons: AbstentionReason[] = []

  // Fail-closed: NaN comparisons are always false in JS, so use negated >= / <= to catch NaN
  if (!(input.analogSupportCount >= ABSTENTION_THRESHOLDS.minAnalogSupport)) {
    reasons.push('insufficient_analog_support')
  }

  if (!(input.candidateConcentrationGini <= ABSTENTION_THRESHOLDS.maxCandidateConcentrationGini)) {
    reasons.push('high_candidate_concentration')
  }

  if (!(input.top1AnalogWeight <= ABSTENTION_THRESHOLDS.maxTop1AnalogWeight)) {
    reasons.push('dominant_single_analog')
  }

  return { abstain: reasons.length > 0, reasons }
}
