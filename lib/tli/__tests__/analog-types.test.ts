import { describe, expect, it } from 'vitest'
import {
  BOUNDARY_SOURCES,
  isBoundarySource,
  ARTIFACT_VERSIONS,
  isValidArtifactVersion,
  POLICY_VERSION_FIELDS,
  POLICY_VERSION_PATTERN,
  isValidPolicyVersion,
  createDefaultPolicyVersions,
  isCompletePolicyVersionSet,
  type EpisodeRegistryV1,
  type QuerySnapshotV1,
  type LabelTableV1,
  type AnalogCandidatesV1,
  type AnalogEvidenceV1,
  type PolicyVersionSet,
} from '../analog/types'

describe('TCAR-001: analog types', () => {
  describe('BoundarySource enum', () => {
    it('defines exactly three boundary sources', () => {
      expect(BOUNDARY_SOURCES).toEqual(['observed', 'inferred-v1', 'imported'])
    })

    it('validates boundary source values', () => {
      expect(isBoundarySource('observed')).toBe(true)
      expect(isBoundarySource('inferred-v1')).toBe(true)
      expect(isBoundarySource('imported')).toBe(true)
      expect(isBoundarySource('unknown')).toBe(false)
      expect(isBoundarySource('')).toBe(false)
      expect(isBoundarySource(null)).toBe(false)
      expect(isBoundarySource(42)).toBe(false)
    })
  })

  describe('artifact versions', () => {
    it('defines canonical artifact version identifiers', () => {
      expect(ARTIFACT_VERSIONS).toEqual({
        episode_registry: 'episode_registry_v1',
        query_snapshot: 'query_snapshot_v1',
        label_table: 'label_table_v1',
        analog_candidates: 'analog_candidates_v1',
        analog_evidence: 'analog_evidence_v1',
        forecast_control: 'forecast_control_v1',
        bridge_run_audits: 'bridge_run_audits_v1',
      })
    })

    it('validates artifact version format', () => {
      expect(isValidArtifactVersion('episode_registry_v1')).toBe(true)
      expect(isValidArtifactVersion('query_snapshot_v1')).toBe(true)
      expect(isValidArtifactVersion('label_table_v1')).toBe(true)
      expect(isValidArtifactVersion('analog_candidates_v1')).toBe(true)
      expect(isValidArtifactVersion('analog_evidence_v1')).toBe(true)
      expect(isValidArtifactVersion('forecast_control_v1')).toBe(true)
      expect(isValidArtifactVersion('bridge_run_audits_v1')).toBe(true)
      expect(isValidArtifactVersion('nonexistent_v1')).toBe(false)
      expect(isValidArtifactVersion('')).toBe(false)
    })
  })

  describe('policy version fields', () => {
    it('defines all required policy version field names', () => {
      expect(POLICY_VERSION_FIELDS).toEqual([
        'theme_definition_version',
        'episode_policy_version',
        'label_policy_version',
        'feature_family_version',
        'retrieval_spec_version',
        'calibration_version',
        'forecast_version',
      ])
    })

    it('creates default policy version set', () => {
      const defaults = createDefaultPolicyVersions()
      for (const field of POLICY_VERSION_FIELDS) {
        expect(defaults).toHaveProperty(field)
        expect(typeof defaults[field]).toBe('string')
        expect(defaults[field].length).toBeGreaterThan(0)
      }
    })

    it('validates completeness of a policy version set', () => {
      const complete = createDefaultPolicyVersions()
      expect(isCompletePolicyVersionSet(complete)).toBe(true)

      const incomplete = { ...complete } as Record<string, string>
      delete incomplete.forecast_version
      expect(isCompletePolicyVersionSet(incomplete as unknown as PolicyVersionSet)).toBe(false)
    })

    it('rejects empty string as policy version', () => {
      const withEmpty = { ...createDefaultPolicyVersions(), forecast_version: '' }
      expect(isCompletePolicyVersionSet(withEmpty)).toBe(false)
    })

    it('validates policy version format pattern', () => {
      expect(POLICY_VERSION_PATTERN).toEqual(/^\d+\.\d+$/)
      expect(isValidPolicyVersion('1.0')).toBe(true)
      expect(isValidPolicyVersion('2.1')).toBe(true)
      expect(isValidPolicyVersion('10.99')).toBe(true)
      expect(isValidPolicyVersion('v1')).toBe(false)
      expect(isValidPolicyVersion('1')).toBe(false)
      expect(isValidPolicyVersion('1.0.0')).toBe(false)
      expect(isValidPolicyVersion('2026-03-12')).toBe(false)
      expect(isValidPolicyVersion('')).toBe(false)
    })
  })

  describe('EpisodeRegistryV1 type contract', () => {
    it('has required fields matching PRD spec', () => {
      const episode: EpisodeRegistryV1 = {
        id: 'ep-001',
        theme_id: 'th-001',
        episode_number: 1,
        boundary_source_start: 'observed',
        boundary_source_end: 'observed',
        episode_start: '2026-01-01',
        episode_end: '2026-02-01',
        is_active: false,
        multi_peak: false,
        primary_peak_date: '2026-01-15',
        peak_score: 85,
        policy_versions: createDefaultPolicyVersions(),
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      }
      expect(episode.boundary_source_start).toBe('observed')
      expect(episode.episode_number).toBe(1)
      expect(episode.multi_peak).toBe(false)
      expect(isCompletePolicyVersionSet(episode.policy_versions)).toBe(true)
    })

    it('supports null episode_end for active episodes', () => {
      const active: EpisodeRegistryV1 = {
        id: 'ep-002',
        theme_id: 'th-001',
        episode_number: 2,
        boundary_source_start: 'observed',
        boundary_source_end: null,
        episode_start: '2026-02-15',
        episode_end: null,
        is_active: true,
        multi_peak: false,
        primary_peak_date: null,
        peak_score: null,
        policy_versions: createDefaultPolicyVersions(),
        created_at: '2026-02-15T00:00:00Z',
        updated_at: '2026-02-15T00:00:00Z',
      }
      expect(active.episode_end).toBeNull()
      expect(active.boundary_source_end).toBeNull()
      expect(active.is_active).toBe(true)
    })
  })

  describe('QuerySnapshotV1 type contract', () => {
    it('has required point-in-time fields', () => {
      const snapshot: QuerySnapshotV1 = {
        id: 'qs-001',
        episode_id: 'ep-001',
        theme_id: 'th-001',
        snapshot_date: '2026-01-10',
        source_data_cutoff: '2026-01-10',
        features: { interestLevel: 0.8, newsIntensity: 0.6 },
        lifecycle_score: 75,
        stage: 'Growth',
        days_since_episode_start: 10,
        policy_versions: createDefaultPolicyVersions(),
        reconstruction_status: 'success',
        reconstruction_reason: null,
        created_at: '2026-01-10T00:00:00Z',
      }
      expect(snapshot.source_data_cutoff).toBe('2026-01-10')
      expect(snapshot.reconstruction_status).toBe('success')
    })
  })

  describe('LabelTableV1 type contract', () => {
    it('has required label fields', () => {
      const label: LabelTableV1 = {
        id: 'lt-001',
        episode_id: 'ep-001',
        theme_id: 'th-001',
        boundary_source: 'observed',
        source_data_cutoff: '2026-01-15',
        is_completed: true,
        peak_date: '2026-01-15',
        peak_score: 85,
        days_to_peak: 15,
        post_peak_drawdown_10d: 0.2,
        post_peak_drawdown_20d: 0.35,
        stage_at_peak: 'Peak',
        is_promotion_eligible: true,
        promotion_ineligible_reason: null,
        policy_versions: createDefaultPolicyVersions(),
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-02-01T00:00:00Z',
      }
      expect(label.boundary_source).toBe('observed')
      expect(label.is_promotion_eligible).toBe(true)
    })

    it('marks inferred rows as non-promotion-eligible by default', () => {
      const label: LabelTableV1 = {
        id: 'lt-002',
        episode_id: 'ep-002',
        theme_id: 'th-002',
        boundary_source: 'inferred-v1',
        source_data_cutoff: '2026-01-20',
        is_completed: true,
        peak_date: '2026-01-20',
        peak_score: 60,
        days_to_peak: 20,
        post_peak_drawdown_10d: null,
        post_peak_drawdown_20d: null,
        stage_at_peak: 'Growth',
        is_promotion_eligible: false,
        promotion_ineligible_reason: 'inferred_boundary_no_audit',
        policy_versions: createDefaultPolicyVersions(),
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-02-01T00:00:00Z',
      }
      expect(label.is_promotion_eligible).toBe(false)
      expect(label.promotion_ineligible_reason).toBe('inferred_boundary_no_audit')
    })
  })

  describe('AnalogCandidatesV1 type contract', () => {
    it('has retrieval metadata fields', () => {
      const candidate: AnalogCandidatesV1 = {
        id: 'ac-001',
        query_snapshot_id: 'qs-001',
        query_theme_id: 'th-001',
        candidate_episode_id: 'ep-100',
        candidate_theme_id: 'th-050',
        rank: 1,
        retrieval_surface: 'price_volume_knn',
        similarity_score: 0.87,
        feature_sim: 0.82,
        curve_sim: 0.90,
        keyword_sim: 0.75,
        dtw_distance: 0.12,
        regime_match: true,
        is_future_aligned: false,
        reranker_score: null,
        reranker_version: null,
        policy_versions: createDefaultPolicyVersions(),
        created_at: '2026-01-10T00:00:00Z',
      }
      expect(candidate.retrieval_surface).toBe('price_volume_knn')
      expect(candidate.rank).toBe(1)
      expect(candidate.is_future_aligned).toBe(false)
    })
  })

  describe('AnalogEvidenceV1 type contract', () => {
    it('has evidence package fields', () => {
      const evidence: AnalogEvidenceV1 = {
        id: 'ae-001',
        query_snapshot_id: 'qs-001',
        query_theme_id: 'th-001',
        candidate_id: 'ac-001',
        candidate_episode_id: 'ep-100',
        analog_future_path_summary: {
          peak_day: 20,
          total_days: 45,
          final_stage: 'Decline',
          post_peak_drawdown: 0.4,
        },
        retrieval_reason: 'Strong price-volume trajectory match with similar early growth pattern',
        mismatch_summary: 'Different sector (tech vs biotech)',
        evidence_quality: 'high',
        evidence_quality_score: 0.85,
        analog_support_count: 5,
        candidate_concentration_gini: 0.45,
        top1_analog_weight: 0.28,
        policy_versions: createDefaultPolicyVersions(),
        created_at: '2026-01-10T00:00:00Z',
      }
      expect(evidence.evidence_quality).toBe('high')
      expect(evidence.evidence_quality_score).toBe(0.85)
      expect(evidence.analog_support_count).toBe(5)
    })
  })
})
