import { describe, expect, it } from 'vitest'
import {
  buildAnalogEvidence,
  computeEvidenceQuality,
  type EvidenceInput,
} from '../comparison/analog-evidence'

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

describe('buildAnalogEvidence', () => {
  it('builds evidence with required fields', () => {
    const result = buildAnalogEvidence(defaultInput())

    expect(result.query_snapshot_id).toBe('qs-001')
    expect(result.candidate_id).toBe('cand-001')
    expect(result.candidate_episode_id).toBe('ep-001')
    expect(result.analog_support_count).toBe(8)
    expect(result.retrieval_reason).toContain('High feature similarity')
  })
})

describe('computeEvidenceQuality', () => {
  it('returns high when all thresholds pass', () => {
    const result = computeEvidenceQuality({
      analogSupportCount: 5,
      candidateConcentrationGini: 0.6,
      top1AnalogWeight: 0.35,
    })

    expect(result.quality).toBe('high')
    expect(result.score).toBeGreaterThan(0)
  })

  it('returns medium when only part of the evidence quality checks pass', () => {
    const result = computeEvidenceQuality({
      analogSupportCount: 5,
      candidateConcentrationGini: 0.7,
      top1AnalogWeight: 0.25,
    })

    expect(result.quality).toBe('medium')
  })

  it('returns a finite zero score for invalid numeric inputs', () => {
    const result = computeEvidenceQuality({
      analogSupportCount: Number.NaN,
      candidateConcentrationGini: Number.NaN,
      top1AnalogWeight: Number.NaN,
    })

    expect(result.score).toBe(0)
  })
})
