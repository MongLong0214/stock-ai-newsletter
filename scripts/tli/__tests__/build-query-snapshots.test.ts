import { describe, expect, it } from 'vitest'
import {
  buildQuerySnapshot,
  buildLabelRow,
  classifyReconstructionStatus,
  type SnapshotInput,
  type LabelInput,
} from '../comparison/build-query-snapshots'

const defaultSnapshotInput = (overrides: Partial<SnapshotInput> = {}): SnapshotInput => ({
  episodeId: 'ep-001',
  themeId: 'th-001',
  snapshotDate: '2026-01-15',
  sourceDataCutoff: '2026-01-15',
  episodeStart: '2026-01-01',
  lifecycleScore: 72,
  stage: 'Growth',
  features: { interest: 0.8, news_momentum: 0.6, volatility: 0.3 },
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

const defaultLabelInput = (overrides: Partial<LabelInput> = {}): LabelInput => ({
  episodeId: 'ep-001',
  themeId: 'th-001',
  boundarySource: 'observed',
  sourceDataCutoff: '2026-01-20',
  isCompleted: true,
  peakDate: '2026-01-20',
  peakScore: 85,
  daysToPeak: 20,
  postPeakDrawdown10d: 0.25,
  postPeakDrawdown20d: 0.4,
  stageAtPeak: 'Peak',
  hasAuditPass: false,
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

describe('buildQuerySnapshot', () => {
  it('builds a snapshot with required fields', () => {
    const result = buildQuerySnapshot(defaultSnapshotInput())

    expect(result.episode_id).toBe('ep-001')
    expect(result.theme_id).toBe('th-001')
    expect(result.days_since_episode_start).toBe(14)
    expect(result.reconstruction_status).toBe('success')
  })

  it('fails reconstruction when cutoff exceeds snapshot date', () => {
    const result = buildQuerySnapshot(defaultSnapshotInput({
      snapshotDate: '2026-01-15',
      sourceDataCutoff: '2026-01-20',
    }))

    expect(result.reconstruction_status).toBe('failed')
    expect(result.reconstruction_reason).toBe('source_data_cutoff_after_snapshot_date')
  })
})

describe('buildLabelRow', () => {
  it('marks observed completed episodes as promotion-eligible', () => {
    const result = buildLabelRow(defaultLabelInput())

    expect(result.is_promotion_eligible).toBe(true)
    expect(result.promotion_ineligible_reason).toBeNull()
  })

  it('keeps inferred rows out of promotion by default', () => {
    const result = buildLabelRow(defaultLabelInput({
      boundarySource: 'inferred-v1',
    }))

    expect(result.is_promotion_eligible).toBe(false)
    expect(result.promotion_ineligible_reason).toBe('inferred_boundary_no_audit')
  })

  it('keeps incomplete episodes out of promotion', () => {
    const result = buildLabelRow(defaultLabelInput({
      isCompleted: false,
      peakDate: null,
      peakScore: null,
      daysToPeak: null,
      postPeakDrawdown10d: null,
      postPeakDrawdown20d: null,
      stageAtPeak: null,
    }))

    expect(result.is_promotion_eligible).toBe(false)
    expect(result.promotion_ineligible_reason).toBe('episode_not_completed')
  })
})

describe('classifyReconstructionStatus', () => {
  it('returns success when score, interest, and news exist', () => {
    expect(classifyReconstructionStatus({
      hasInterest: true,
      hasNews: true,
      hasScore: true,
    })).toEqual({ status: 'success', reason: null })
  })

  it('returns partial when some feature families are missing', () => {
    const result = classifyReconstructionStatus({
      hasInterest: true,
      hasNews: false,
      hasScore: true,
    })

    expect(result.status).toBe('partial')
    expect(result.reason).toContain('news')
  })
})
