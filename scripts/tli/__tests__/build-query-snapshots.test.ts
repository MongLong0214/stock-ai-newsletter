/**
 * TCAR-007: Build Query Snapshot and Label Tables
 *
 * TDD RED phase — failing tests for query snapshot and label table builders.
 */

import { describe, expect, it } from 'vitest'
import {
  buildQuerySnapshot,
  buildLabelRow,
  classifyReconstructionStatus,
  type SnapshotInput,
  type LabelInput,
} from '../build-query-snapshots'

// --- Test helpers ---

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
  postPeakDrawdown20d: 0.40,
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

describe('TCAR-007: buildQuerySnapshot', () => {
  it('builds a snapshot with all required fields', () => {
    const input = defaultSnapshotInput()
    const result = buildQuerySnapshot(input)

    expect(result.episode_id).toBe('ep-001')
    expect(result.theme_id).toBe('th-001')
    expect(result.snapshot_date).toBe('2026-01-15')
    expect(result.source_data_cutoff).toBe('2026-01-15')
    expect(result.lifecycle_score).toBe(72)
    expect(result.stage).toBe('Growth')
    expect(result.features).toEqual({ interest: 0.8, news_momentum: 0.6, volatility: 0.3 })
    expect(result.policy_versions).toBeDefined()
  })

  it('calculates days_since_episode_start correctly', () => {
    const result = buildQuerySnapshot(defaultSnapshotInput({
      episodeStart: '2026-01-01',
      snapshotDate: '2026-01-15',
    }))

    expect(result.days_since_episode_start).toBe(14)
  })

  it('handles same-day snapshot (day 0)', () => {
    const result = buildQuerySnapshot(defaultSnapshotInput({
      episodeStart: '2026-01-01',
      snapshotDate: '2026-01-01',
    }))

    expect(result.days_since_episode_start).toBe(0)
  })

  it('sets reconstruction_status to success by default', () => {
    const result = buildQuerySnapshot(defaultSnapshotInput())

    expect(result.reconstruction_status).toBe('success')
    expect(result.reconstruction_reason).toBeNull()
  })

  it('carries through custom reconstruction status', () => {
    const result = buildQuerySnapshot(defaultSnapshotInput({
      reconstructionStatus: 'partial',
      reconstructionReason: 'missing interest data for 2 days',
    }))

    expect(result.reconstruction_status).toBe('partial')
    expect(result.reconstruction_reason).toBe('missing interest data for 2 days')
  })

  it('source_data_cutoff must not exceed snapshot_date', () => {
    const result = buildQuerySnapshot(defaultSnapshotInput({
      snapshotDate: '2026-01-15',
      sourceDataCutoff: '2026-01-15',
    }))

    expect(result.source_data_cutoff <= result.snapshot_date).toBe(true)
  })

  it('returns failed reconstruction when sourceDataCutoff exceeds snapshotDate', () => {
    const result = buildQuerySnapshot(defaultSnapshotInput({
      snapshotDate: '2026-01-15',
      sourceDataCutoff: '2026-01-20',
    }))

    expect(result.reconstruction_status).toBe('failed')
    expect(result.reconstruction_reason).toBe('source_data_cutoff_after_snapshot_date')
  })

  it('preserves all other fields when sourceDataCutoff exceeds snapshotDate', () => {
    const result = buildQuerySnapshot(defaultSnapshotInput({
      snapshotDate: '2026-01-15',
      sourceDataCutoff: '2026-01-20',
    }))

    expect(result.episode_id).toBe('ep-001')
    expect(result.lifecycle_score).toBe(72)
    expect(result.stage).toBe('Growth')
  })
})

describe('TCAR-007: buildLabelRow', () => {
  it('builds a complete label row for a completed episode', () => {
    const input = defaultLabelInput()
    const result = buildLabelRow(input)

    expect(result.episode_id).toBe('ep-001')
    expect(result.theme_id).toBe('th-001')
    expect(result.boundary_source).toBe('observed')
    expect(result.source_data_cutoff).toBe('2026-01-20')
    expect(result.is_completed).toBe(true)
    expect(result.peak_date).toBe('2026-01-20')
    expect(result.peak_score).toBe(85)
    expect(result.days_to_peak).toBe(20)
    expect(result.post_peak_drawdown_10d).toBe(0.25)
    expect(result.post_peak_drawdown_20d).toBe(0.40)
    expect(result.stage_at_peak).toBe('Peak')
    expect(result.is_promotion_eligible).toBe(true)
    expect(result.promotion_ineligible_reason).toBeNull()
  })

  it('marks inferred-v1 episodes as NOT promotion eligible', () => {
    const result = buildLabelRow(defaultLabelInput({
      boundarySource: 'inferred-v1',
    }))

    expect(result.is_promotion_eligible).toBe(false)
    expect(result.promotion_ineligible_reason).toBe('inferred_boundary_no_audit')
  })

  it('marks imported episodes as NOT promotion eligible', () => {
    const result = buildLabelRow(defaultLabelInput({
      boundarySource: 'imported',
    }))

    expect(result.is_promotion_eligible).toBe(false)
    expect(result.promotion_ineligible_reason).toBe('imported_boundary_no_audit')
  })

  it('allows inferred-v1 rows into promotion only after a separate audit pass', () => {
    const result = buildLabelRow(defaultLabelInput({
      boundarySource: 'inferred-v1',
      hasAuditPass: true,
    }))

    expect(result.is_promotion_eligible).toBe(true)
    expect(result.promotion_ineligible_reason).toBeNull()
  })

  it('handles active (incomplete) episode with null peak fields', () => {
    const result = buildLabelRow(defaultLabelInput({
      isCompleted: false,
      peakDate: null,
      peakScore: null,
      daysToPeak: null,
      postPeakDrawdown10d: null,
      postPeakDrawdown20d: null,
      stageAtPeak: null,
    }))

    expect(result.is_completed).toBe(false)
    expect(result.peak_date).toBeNull()
    expect(result.peak_score).toBeNull()
    expect(result.post_peak_drawdown_10d).toBeNull()
  })

  it('marks incomplete observed episodes as NOT promotion eligible', () => {
    const result = buildLabelRow(defaultLabelInput({
      boundarySource: 'observed',
      isCompleted: false,
    }))

    expect(result.is_promotion_eligible).toBe(false)
    expect(result.promotion_ineligible_reason).toBe('episode_not_completed')
  })

  it('attaches policy versions', () => {
    const result = buildLabelRow(defaultLabelInput())

    expect(result.policy_versions.episode_policy_version).toBe('1.0')
    expect(result.policy_versions.label_policy_version).toBe('1.0')
  })
})

describe('TCAR-007: classifyReconstructionStatus', () => {
  it('returns success when all features present', () => {
    const result = classifyReconstructionStatus({
      hasInterest: true,
      hasNews: true,
      hasScore: true,
    })

    expect(result.status).toBe('success')
    expect(result.reason).toBeNull()
  })

  it('returns partial when some features missing', () => {
    const result = classifyReconstructionStatus({
      hasInterest: true,
      hasNews: false,
      hasScore: true,
    })

    expect(result.status).toBe('partial')
    expect(result.reason).toContain('news')
  })

  it('returns failed when no score available', () => {
    const result = classifyReconstructionStatus({
      hasInterest: false,
      hasNews: false,
      hasScore: false,
    })

    expect(result.status).toBe('failed')
    expect(result.reason).not.toBeNull()
  })

  it('returns failed when score is missing even if others present', () => {
    const result = classifyReconstructionStatus({
      hasInterest: true,
      hasNews: true,
      hasScore: false,
    })

    expect(result.status).toBe('failed')
  })
})
