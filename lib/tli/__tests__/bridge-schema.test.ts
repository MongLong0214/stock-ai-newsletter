import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  BOUNDARY_SOURCES,
  RETRIEVAL_SURFACES,
} from '../analog/types'
import {
  GATE_PASS_RESULTS,
  BRIDGE_ROW_NAMES,
} from '../forecast/types'
import type {
  EpisodeRegistryRow,
  QuerySnapshotRow,
  LabelTableRow,
  AnalogCandidatesRow,
  AnalogEvidenceRow,
  ForecastControlRow,
  BridgeRunAuditRow,
} from '../types/bridge-schema'

const migrationPath = join(
  process.cwd(),
  'supabase/migrations/027_tcar002_phase0_bridge_schema.sql',
)

describe('TCAR-002: bridge schema migration', () => {
  const sql = readFileSync(migrationPath, 'utf8')

  describe('table creation', () => {
    it('creates all 7 required tables', () => {
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS episode_registry_v1')
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS query_snapshot_v1')
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS label_table_v1')
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS analog_candidates_v1')
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS analog_evidence_v1')
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS forecast_control_v1')
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS bridge_run_audits_v1')
    })
  })

  describe('episode_registry_v1', () => {
    it('has required columns', () => {
      expect(sql).toContain('theme_id TEXT NOT NULL')
      expect(sql).toContain('episode_number INTEGER NOT NULL')
      expect(sql).toContain('boundary_source_start TEXT NOT NULL')
      expect(sql).toContain('boundary_source_end TEXT')
      expect(sql).toContain('episode_start DATE NOT NULL')
      expect(sql).toContain('multi_peak BOOLEAN NOT NULL DEFAULT false')
      expect(sql).toContain('primary_peak_date DATE')
      expect(sql).toContain('peak_score DOUBLE PRECISION')
      expect(sql).toContain('policy_versions JSONB NOT NULL')
    })

    it('has boundary_source CHECK constraints', () => {
      for (const source of BOUNDARY_SOURCES) {
        expect(sql).toContain(source)
      }
    })

    it('has unique constraint on (theme_id, episode_number)', () => {
      expect(sql).toContain('UNIQUE(theme_id, episode_number)')
    })
  })

  describe('query_snapshot_v1', () => {
    it('has required columns', () => {
      expect(sql).toContain('episode_id UUID NOT NULL REFERENCES episode_registry_v1(id)')
      expect(sql).toContain('snapshot_date DATE NOT NULL')
      expect(sql).toContain('source_data_cutoff DATE NOT NULL')
      expect(sql).toContain('lifecycle_score DOUBLE PRECISION NOT NULL')
      expect(sql).toContain('days_since_episode_start INTEGER NOT NULL')
      expect(sql).toContain('reconstruction_status TEXT NOT NULL')
    })

    it('has reconstruction_status CHECK constraint', () => {
      expect(sql).toContain("'success'")
      expect(sql).toContain("'partial'")
      expect(sql).toContain("'failed'")
    })

    it('has unique constraint on (episode_id, snapshot_date)', () => {
      expect(sql).toContain('UNIQUE(episode_id, snapshot_date)')
    })
  })

  describe('label_table_v1', () => {
    it('has required columns', () => {
      expect(sql).toContain('source_data_cutoff DATE NOT NULL')
      expect(sql).toContain('is_completed BOOLEAN NOT NULL DEFAULT false')
      expect(sql).toContain('is_promotion_eligible BOOLEAN NOT NULL DEFAULT false')
      expect(sql).toContain('post_peak_drawdown_10d DOUBLE PRECISION')
      expect(sql).toContain('post_peak_drawdown_20d DOUBLE PRECISION')
      expect(sql).toContain('stage_at_peak TEXT')
    })

    it('has unique constraint on (episode_id)', () => {
      expect(sql).toMatch(/UNIQUE\(episode_id\)/)
    })
  })

  describe('analog_candidates_v1', () => {
    it('has retrieval surface CHECK constraint', () => {
      for (const surface of RETRIEVAL_SURFACES) {
        expect(sql).toContain(surface)
      }
    })

    it('has unique constraint on (query_snapshot_id, candidate_episode_id, retrieval_surface)', () => {
      expect(sql).toContain('UNIQUE(query_snapshot_id, candidate_episode_id, retrieval_surface)')
    })
  })

  describe('analog_evidence_v1', () => {
    it('has composite FK ensuring candidate belongs to same snapshot', () => {
      expect(sql).toContain('FOREIGN KEY (candidate_id, query_snapshot_id)')
      expect(sql).toContain('REFERENCES analog_candidates_v1(id, query_snapshot_id)')
    })

    it('has required columns', () => {
      expect(sql).toContain('analog_future_path_summary JSONB NOT NULL')
      expect(sql).toContain('retrieval_reason TEXT NOT NULL')
      expect(sql).toContain('evidence_quality TEXT NOT NULL')
      expect(sql).toContain('evidence_quality_score DOUBLE PRECISION NOT NULL')
      expect(sql).toContain('analog_support_count INTEGER NOT NULL')
      expect(sql).toContain('candidate_concentration_gini DOUBLE PRECISION NOT NULL')
      expect(sql).toContain('top1_analog_weight DOUBLE PRECISION NOT NULL')
    })

    it('has evidence_quality CHECK constraint', () => {
      expect(sql).toContain("'high'")
      expect(sql).toContain("'medium'")
      expect(sql).toContain("'low'")
    })
  })

  describe('forecast_control_v1', () => {
    it('has required columns', () => {
      expect(sql).toContain("artifact_version TEXT NOT NULL DEFAULT 'forecast_control_v1'")
      expect(sql).toContain('production_version TEXT NOT NULL')
      expect(sql).toContain("serving_status TEXT NOT NULL DEFAULT 'shadow'")
      expect(sql).toContain('cutover_ready BOOLEAN NOT NULL DEFAULT false')
      expect(sql).toContain('rollback_drill_count INTEGER NOT NULL DEFAULT 0')
      expect(sql).toContain('fail_closed_verified BOOLEAN NOT NULL DEFAULT false')
    })

    it('has serving_status CHECK constraint', () => {
      expect(sql).toContain("'shadow'")
      expect(sql).toContain("'production'")
      expect(sql).toContain("'rolled_back'")
    })
  })

  describe('bridge_run_audits_v1', () => {
    it('has required columns', () => {
      expect(sql).toContain("artifact_version TEXT NOT NULL DEFAULT 'bridge_run_audits_v1'")
      expect(sql).toContain('run_date DATE NOT NULL')
      expect(sql).toContain('bridge_row TEXT NOT NULL')
      expect(sql).toContain('parity JSONB NOT NULL')
      expect(sql).toContain('verdict TEXT NOT NULL')
    })

    it('has bridge_row CHECK constraint matching BRIDGE_ROW_NAMES', () => {
      for (const name of BRIDGE_ROW_NAMES) {
        expect(sql).toContain(name)
      }
    })

    it('has verdict CHECK constraint matching GATE_PASS_RESULTS', () => {
      for (const result of GATE_PASS_RESULTS) {
        expect(sql).toContain(result)
      }
    })
  })

  describe('migration idempotency', () => {
    it('uses DROP POLICY IF EXISTS before CREATE POLICY for all tables', () => {
      const policyNames = [
        'service_role_episode_registry_v1',
        'service_role_query_snapshot_v1',
        'service_role_label_table_v1',
        'service_role_analog_candidates_v1',
        'service_role_analog_evidence_v1',
        'service_role_forecast_control_v1',
        'service_role_bridge_run_audits_v1',
      ]
      for (const name of policyNames) {
        expect(sql).toContain(`DROP POLICY IF EXISTS "${name}"`)
      }
    })
  })

  describe('RLS enforcement', () => {
    it('enables RLS on all tables', () => {
      expect(sql).toContain('ALTER TABLE episode_registry_v1 ENABLE ROW LEVEL SECURITY')
      expect(sql).toContain('ALTER TABLE query_snapshot_v1 ENABLE ROW LEVEL SECURITY')
      expect(sql).toContain('ALTER TABLE label_table_v1 ENABLE ROW LEVEL SECURITY')
      expect(sql).toContain('ALTER TABLE analog_candidates_v1 ENABLE ROW LEVEL SECURITY')
      expect(sql).toContain('ALTER TABLE analog_evidence_v1 ENABLE ROW LEVEL SECURITY')
      expect(sql).toContain('ALTER TABLE forecast_control_v1 ENABLE ROW LEVEL SECURITY')
      expect(sql).toContain('ALTER TABLE bridge_run_audits_v1 ENABLE ROW LEVEL SECURITY')
    })

    it('grants access to service_role only', () => {
      expect(sql).toContain('TO service_role')
      expect(sql).not.toContain('TO anon')
      expect(sql).not.toContain('TO authenticated')
    })
  })
})

describe('TCAR-002: bridge DB row types', () => {
  it('EpisodeRegistryRow is assignable from artifact contract fields', () => {
    const row: EpisodeRegistryRow = {
      id: 'uuid-1',
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
      policy_versions: {},
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }
    expect(row.boundary_source_start).toBe('observed')
    expect(row.episode_number).toBe(1)
  })

  it('QuerySnapshotRow is assignable from artifact contract fields', () => {
    const row: QuerySnapshotRow = {
      id: 'uuid-2',
      episode_id: 'uuid-1',
      theme_id: 'th-001',
      snapshot_date: '2026-01-10',
      source_data_cutoff: '2026-01-10',
      features: {},
      lifecycle_score: 75,
      stage: 'Growth',
      days_since_episode_start: 10,
      policy_versions: {},
      reconstruction_status: 'success',
      reconstruction_reason: null,
      created_at: '2026-01-10T00:00:00Z',
    }
    expect(row.reconstruction_status).toBe('success')
  })

  it('LabelTableRow is assignable from artifact contract fields', () => {
    const row: LabelTableRow = {
      id: 'uuid-3',
      episode_id: 'uuid-1',
      theme_id: 'th-001',
      boundary_source: 'observed',
      source_data_cutoff: '2026-01-20',
      is_completed: true,
      peak_date: '2026-01-15',
      peak_score: 85,
      days_to_peak: 15,
      post_peak_drawdown_10d: 0.2,
      post_peak_drawdown_20d: 0.35,
      stage_at_peak: 'Peak',
      is_promotion_eligible: true,
      promotion_ineligible_reason: null,
      policy_versions: {},
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-02-01T00:00:00Z',
    }
    expect(row.source_data_cutoff).toBe('2026-01-20')
    expect(row.is_promotion_eligible).toBe(true)
  })

  it('AnalogCandidatesRow is assignable from artifact contract fields', () => {
    const row: AnalogCandidatesRow = {
      id: 'uuid-4',
      query_snapshot_id: 'uuid-2',
      query_theme_id: 'th-001',
      candidate_episode_id: 'uuid-1',
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
      policy_versions: {},
      created_at: '2026-01-10T00:00:00Z',
    }
    expect(row.retrieval_surface).toBe('price_volume_knn')
  })

  it('AnalogEvidenceRow is assignable from artifact contract fields', () => {
    const row: AnalogEvidenceRow = {
      id: 'uuid-5',
      query_snapshot_id: 'uuid-2',
      query_theme_id: 'th-001',
      candidate_id: 'uuid-4',
      candidate_episode_id: 'uuid-1',
      analog_future_path_summary: { peak_day: 20, total_days: 45 },
      retrieval_reason: 'Strong match',
      mismatch_summary: null,
      evidence_quality: 'high',
      evidence_quality_score: 0.85,
      analog_support_count: 5,
      candidate_concentration_gini: 0.45,
      top1_analog_weight: 0.28,
      policy_versions: {},
      created_at: '2026-01-10T00:00:00Z',
    }
    expect(row.evidence_quality).toBe('high')
  })

  it('ForecastControlRow is assignable from artifact contract fields', () => {
    const row: ForecastControlRow = {
      id: 'uuid-6',
      artifact_version: 'forecast_control_v1',
      production_version: '1.0',
      serving_status: 'shadow',
      cutover_ready: false,
      rollback_target_version: null,
      rollback_drill_count: 0,
      rollback_drill_last_success: null,
      fail_closed_verified: false,
      ship_verdict_artifact_id: null,
      policy_versions: {},
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }
    expect(row.serving_status).toBe('shadow')
  })

  it('BridgeRunAuditRow is assignable from artifact contract fields', () => {
    const row: BridgeRunAuditRow = {
      id: 'uuid-7',
      artifact_version: 'bridge_run_audits_v1',
      run_date: '2026-03-12',
      bridge_row: 'episode_registry',
      parity: { metric_name: 'count', metric_value: 100, threshold: 100, passed: true },
      verdict: 'pass',
      cutover_eligible: false,
      rollback_triggered: false,
      details: null,
      created_at: '2026-03-12T00:00:00Z',
    }
    expect(row.bridge_row).toBe('episode_registry')
  })
})
