/**
 * TCAR-010: Build Analog Evidence Artifact Writer
 *
 * TDD RED phase — tests for analog evidence package builder.
 */

import { describe, expect, it } from 'vitest'
import {
  buildAnalogEvidence,
  computeEvidenceQuality,
  type EvidenceInput,
} from '../analog-evidence'

// --- Test helpers ---

const defaultInput = (overrides: Partial<EvidenceInput> = {}): EvidenceInput => ({
  querySnapshotId: 'qs-001',
  queryThemeId: 'th-query',
  candidateId: 'cand-001',
  candidateEpisodeId: 'ep-001',
  analogFuturePathSummary: {
    peak_day: 15,
    total_days: 45,
    final_stage: 'Decline',
    post_peak_drawdown: 0.35,
  },
  retrievalReason: 'High feature similarity + DTW curve match',
  mismatchSummary: null,
  analogSupportCount: 8,
  candidateConcentrationGini: 0.45,
  top1AnalogWeight: 0.25,
  policyVersions: {
    theme_definition_version: '1.0',
    episode_policy_version: '1.0',
    label_policy_version: '1.0',
    feature_family_version: '1.0',
    retrieval_spec_version: '1.0',
    calibration_version: '1.0',
    forecast_version: '1.0',
  },
  ...overrides,
})

describe('TCAR-010: buildAnalogEvidence', () => {
  it('builds evidence with all required fields', () => {
    const result = buildAnalogEvidence(defaultInput())

    expect(result.query_snapshot_id).toBe('qs-001')
    expect(result.query_theme_id).toBe('th-query')
    expect(result.candidate_id).toBe('cand-001')
    expect(result.candidate_episode_id).toBe('ep-001')
    expect(result.analog_future_path_summary).toEqual({
      peak_day: 15,
      total_days: 45,
      final_stage: 'Decline',
      post_peak_drawdown: 0.35,
    })
    expect(result.retrieval_reason).toBe('High feature similarity + DTW curve match')
    expect(result.mismatch_summary).toBeNull()
    expect(result.analog_support_count).toBe(8)
    expect(result.candidate_concentration_gini).toBe(0.45)
    expect(result.top1_analog_weight).toBe(0.25)
  })

  it('attaches evidence quality based on thresholds', () => {
    const result = buildAnalogEvidence(defaultInput({
      analogSupportCount: 8,
      candidateConcentrationGini: 0.45,
      top1AnalogWeight: 0.25,
    }))

    expect(result.evidence_quality).toBe('high')
    expect(result.evidence_quality_score).toBeGreaterThan(0)
  })

  it('attaches policy versions', () => {
    const result = buildAnalogEvidence(defaultInput())

    expect(result.policy_versions.episode_policy_version).toBe('1.0')
  })
})

describe('TCAR-010: computeEvidenceQuality', () => {
  it('returns high when all thresholds met', () => {
    const result = computeEvidenceQuality({
      analogSupportCount: 5,
      candidateConcentrationGini: 0.60,
      top1AnalogWeight: 0.35,
    })

    expect(result.quality).toBe('high')
    expect(result.score).toBeGreaterThan(0)
  })

  it('returns medium when some thresholds met', () => {
    const result = computeEvidenceQuality({
      analogSupportCount: 5,
      candidateConcentrationGini: 0.70, // Over threshold
      top1AnalogWeight: 0.25,
    })

    expect(result.quality).toBe('medium')
  })

  it('returns low when most thresholds missed', () => {
    const result = computeEvidenceQuality({
      analogSupportCount: 2, // Under threshold
      candidateConcentrationGini: 0.80, // Over threshold
      top1AnalogWeight: 0.50, // Over threshold
    })

    expect(result.quality).toBe('low')
  })

  it('score is between 0 and 1', () => {
    const high = computeEvidenceQuality({ analogSupportCount: 10, candidateConcentrationGini: 0.3, top1AnalogWeight: 0.1 })
    const low = computeEvidenceQuality({ analogSupportCount: 1, candidateConcentrationGini: 0.9, top1AnalogWeight: 0.8 })

    expect(high.score).toBeGreaterThanOrEqual(0)
    expect(high.score).toBeLessThanOrEqual(1)
    expect(low.score).toBeGreaterThanOrEqual(0)
    expect(low.score).toBeLessThanOrEqual(1)
    expect(high.score).toBeGreaterThan(low.score)
  })

  it('exact threshold values pass (boundary condition)', () => {
    const result = computeEvidenceQuality({
      analogSupportCount: 5, // Exact threshold
      candidateConcentrationGini: 0.60, // Exact threshold
      top1AnalogWeight: 0.35, // Exact threshold
    })

    expect(result.quality).toBe('high')
  })

  it('one tick below support threshold changes quality', () => {
    const result = computeEvidenceQuality({
      analogSupportCount: 4, // Below 5
      candidateConcentrationGini: 0.45,
      top1AnalogWeight: 0.25,
    })

    expect(result.quality).not.toBe('high')
  })

  it('returns finite score=0 when NaN inputs would produce NaN', () => {
    const result = computeEvidenceQuality({
      analogSupportCount: NaN,
      candidateConcentrationGini: NaN,
      top1AnalogWeight: NaN,
    })
    expect(isFinite(result.score)).toBe(true)
    expect(result.score).toBe(0)
  })
})
