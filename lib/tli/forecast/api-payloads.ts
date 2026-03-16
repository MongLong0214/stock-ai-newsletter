/**
 * TCAR-019: API Payloads and Analyst-Facing Logic
 *
 * Builds forecast API payloads with probability, uncertainty, analog evidence,
 * and abstention/low-evidence badges. Pure functions — no DB calls.
 */

import type { ForecastHorizon } from './types'
import type { EvidenceQuality } from '../analog/types'
import type { AbstentionReason } from './evidence-quality'

// --- Types ---

export interface ForecastPayloadInput {
  probabilities: Record<ForecastHorizon, number>
  expectedPeakDay: number
  confidence: number
  survivalProbabilities: Record<ForecastHorizon, number>
  medianTimeToPeak: number
  postPeakExpectedDrawdown: number
  severeDrawdownProb: number
  evidenceQualityScore: number
  abstain: boolean
  abstentionReasons: AbstentionReason[]
}

export interface ForecastPayload {
  probabilities: Record<ForecastHorizon, number>
  expectedPeakDay: number
  confidence: number
  confidenceLabel: 'high' | 'medium' | 'low'
  survival: {
    probabilities: Record<ForecastHorizon, number>
    medianTimeToPeak: number
  }
  postPeakRisk: {
    expectedDrawdown: number
    severeDrawdownProb: number
  }
  evidenceQualityScore: number
  abstained: boolean
  abstentionReasons: AbstentionReason[]
}

export interface AnalogEvidencePayloadInput {
  analogCount: number
  topAnalogs: {
    episodeId: string
    themeId: string
    similarity: number
    peakDay: number
    totalDays: number
  }[]
  concentrationGini: number
  top1Weight: number
  evidenceQuality: EvidenceQuality
}

export interface AnalogEvidencePayload {
  analogCount: number
  topAnalogs: {
    episodeId: string
    themeId: string
    similarity: number
    peakDay: number
    totalDays: number
  }[]
  concentrationGini: number
  top1Weight: number
  evidenceQuality: EvidenceQuality
  lowEvidenceBadge: boolean
}

export interface AbstentionBadge {
  show: boolean
  reasons: AbstentionReason[]
}

// --- Confidence Label ---

export const classifyConfidenceLabel = (
  confidence: number,
  options?: { abstain?: boolean; evidenceQualityScore?: number },
): 'high' | 'medium' | 'low' => {
  if (options?.abstain) return 'low'
  const base = confidence >= 0.7 ? 'high' : confidence >= 0.4 ? 'medium' : 'low'
  if (base === 'high' && options?.evidenceQualityScore !== undefined && options.evidenceQualityScore < 0.3) return 'medium'
  return base
}

// --- Forecast Payload Builder ---

export const buildForecastPayload = (input: ForecastPayloadInput): ForecastPayload => ({
  probabilities: input.probabilities,
  expectedPeakDay: input.expectedPeakDay,
  confidence: input.confidence,
  confidenceLabel: classifyConfidenceLabel(input.confidence, {
    abstain: input.abstain,
    evidenceQualityScore: input.evidenceQualityScore,
  }),
  survival: {
    probabilities: input.survivalProbabilities,
    medianTimeToPeak: input.medianTimeToPeak,
  },
  postPeakRisk: {
    expectedDrawdown: input.postPeakExpectedDrawdown,
    severeDrawdownProb: input.severeDrawdownProb,
  },
  evidenceQualityScore: input.evidenceQualityScore,
  abstained: input.abstain,
  abstentionReasons: input.abstentionReasons,
})

// --- Analog Evidence Payload Builder ---

export const buildAnalogEvidencePayload = (
  input: AnalogEvidencePayloadInput,
): AnalogEvidencePayload => ({
  analogCount: input.analogCount,
  topAnalogs: input.topAnalogs,
  concentrationGini: input.concentrationGini,
  top1Weight: input.top1Weight,
  evidenceQuality: input.evidenceQuality,
  lowEvidenceBadge: input.evidenceQuality === 'low',
})

// --- Abstention Badge ---

export const buildAbstentionBadge = (input: {
  abstain: boolean
  reasons: AbstentionReason[]
}): AbstentionBadge => ({
  show: input.abstain,
  reasons: input.reasons,
})
