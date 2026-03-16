/**
 * TCAR-019: API Payloads and Analyst-Facing Logic
 *
 * TDD tests for forecast API payload builders with probability, uncertainty,
 * analog evidence, and abstention/low-evidence badging.
 */

import { describe, expect, it } from 'vitest'
import {
  buildForecastPayload,
  buildAnalogEvidencePayload,
  classifyConfidenceLabel,
  buildAbstentionBadge,
  type ForecastPayloadInput,
  type AnalogEvidencePayloadInput,
} from '../forecast/api-payloads'

// --- Test helpers ---

const makeForecastInput = (overrides: Partial<ForecastPayloadInput> = {}): ForecastPayloadInput => ({
  probabilities: { 5: 0.3, 10: 0.6, 20: 0.85 },
  expectedPeakDay: 12,
  confidence: 0.75,
  survivalProbabilities: { 5: 0.7, 10: 0.4, 20: 0.15 },
  medianTimeToPeak: 8,
  postPeakExpectedDrawdown: 0.25,
  severeDrawdownProb: 0.15,
  evidenceQualityScore: 0.8,
  abstain: false,
  abstentionReasons: [],
  ...overrides,
})

const makeEvidenceInput = (overrides: Partial<AnalogEvidencePayloadInput> = {}): AnalogEvidencePayloadInput => ({
  analogCount: 5,
  topAnalogs: [
    { episodeId: 'ep-1', themeId: 'th-1', similarity: 0.85, peakDay: 15, totalDays: 40 },
    { episodeId: 'ep-2', themeId: 'th-2', similarity: 0.72, peakDay: 18, totalDays: 45 },
  ],
  concentrationGini: 0.35,
  top1Weight: 0.25,
  evidenceQuality: 'high',
  ...overrides,
})

describe('TCAR-019: buildForecastPayload', () => {
  it('includes probability and uncertainty fields', () => {
    const payload = buildForecastPayload(makeForecastInput())

    expect(payload.probabilities).toBeDefined()
    expect(payload.probabilities[5]).toBe(0.3)
    expect(payload.probabilities[10]).toBe(0.6)
    expect(payload.probabilities[20]).toBe(0.85)
    expect(payload.expectedPeakDay).toBe(12)
    expect(payload.confidence).toBe(0.75)
  })

  it('includes survival data', () => {
    const payload = buildForecastPayload(makeForecastInput())

    expect(payload.survival.probabilities[5]).toBe(0.7)
    expect(payload.survival.medianTimeToPeak).toBe(8)
  })

  it('includes post-peak risk', () => {
    const payload = buildForecastPayload(makeForecastInput())

    expect(payload.postPeakRisk.expectedDrawdown).toBe(0.25)
    expect(payload.postPeakRisk.severeDrawdownProb).toBe(0.15)
  })

  it('marks as abstained when abstain=true', () => {
    const payload = buildForecastPayload(makeForecastInput({
      abstain: true,
      abstentionReasons: ['insufficient_analog_support'],
    }))

    expect(payload.abstained).toBe(true)
    expect(payload.abstentionReasons).toContain('insufficient_analog_support')
  })

  it('includes confidence label', () => {
    const payload = buildForecastPayload(makeForecastInput({ confidence: 0.8 }))

    expect(typeof payload.confidenceLabel).toBe('string')
    expect(['high', 'medium', 'low']).toContain(payload.confidenceLabel)
  })

  it('low-evidence case cannot use confident wording', () => {
    const payload = buildForecastPayload(makeForecastInput({
      confidence: 0.2,
      evidenceQualityScore: 0.2,
    }))

    expect(payload.confidenceLabel).toBe('low')
  })

  it('high confidence + low evidence → medium label (TCAR-019)', () => {
    const payload = buildForecastPayload(makeForecastInput({
      confidence: 0.85,
      evidenceQualityScore: 0.1,
      abstain: false,
    }))

    expect(payload.confidenceLabel).toBe('medium')
  })

  it('high confidence + abstain → low label (TCAR-019)', () => {
    const payload = buildForecastPayload(makeForecastInput({
      confidence: 0.85,
      evidenceQualityScore: 0.8,
      abstain: true,
      abstentionReasons: ['insufficient_analog_support'],
    }))

    expect(payload.confidenceLabel).toBe('low')
  })
})

describe('TCAR-019: buildAnalogEvidencePayload', () => {
  it('includes analog count and top analogs', () => {
    const payload = buildAnalogEvidencePayload(makeEvidenceInput())

    expect(payload.analogCount).toBe(5)
    expect(payload.topAnalogs).toHaveLength(2)
    expect(payload.topAnalogs[0].similarity).toBe(0.85)
  })

  it('includes evidence quality metadata', () => {
    const payload = buildAnalogEvidencePayload(makeEvidenceInput())

    expect(payload.evidenceQuality).toBe('high')
    expect(payload.concentrationGini).toBe(0.35)
    expect(payload.top1Weight).toBe(0.25)
  })

  it('returns low-evidence badge when quality is low', () => {
    const payload = buildAnalogEvidencePayload(makeEvidenceInput({
      evidenceQuality: 'low',
      analogCount: 2,
    }))

    expect(payload.lowEvidenceBadge).toBe(true)
  })

  it('no low-evidence badge when quality is high', () => {
    const payload = buildAnalogEvidencePayload(makeEvidenceInput({
      evidenceQuality: 'high',
    }))

    expect(payload.lowEvidenceBadge).toBe(false)
  })
})

describe('TCAR-019: classifyConfidenceLabel', () => {
  it('returns high for confidence >= 0.7', () => {
    expect(classifyConfidenceLabel(0.7)).toBe('high')
    expect(classifyConfidenceLabel(0.9)).toBe('high')
  })

  it('returns medium for confidence >= 0.4', () => {
    expect(classifyConfidenceLabel(0.4)).toBe('medium')
    expect(classifyConfidenceLabel(0.69)).toBe('medium')
  })

  it('returns low for confidence < 0.4', () => {
    expect(classifyConfidenceLabel(0.39)).toBe('low')
    expect(classifyConfidenceLabel(0)).toBe('low')
  })

  it('caps high → medium when evidenceQualityScore < 0.3 (TCAR-019)', () => {
    expect(classifyConfidenceLabel(0.8, { evidenceQualityScore: 0.2 })).toBe('medium')
  })

  it('caps high → medium when abstain=true (TCAR-019)', () => {
    expect(classifyConfidenceLabel(0.9, { abstain: true })).toBe('low')
  })

  it('does not cap when evidenceQualityScore >= 0.3', () => {
    expect(classifyConfidenceLabel(0.8, { evidenceQualityScore: 0.5 })).toBe('high')
  })

  it('backward compatible without options', () => {
    expect(classifyConfidenceLabel(0.8)).toBe('high')
  })
})

describe('TCAR-019: buildAbstentionBadge', () => {
  it('returns abstention badge with reasons', () => {
    const badge = buildAbstentionBadge({
      abstain: true,
      reasons: ['insufficient_analog_support', 'high_candidate_concentration'],
    })

    expect(badge.show).toBe(true)
    expect(badge.reasons).toHaveLength(2)
  })

  it('returns hidden badge when not abstaining', () => {
    const badge = buildAbstentionBadge({ abstain: false, reasons: [] })

    expect(badge.show).toBe(false)
  })
})
