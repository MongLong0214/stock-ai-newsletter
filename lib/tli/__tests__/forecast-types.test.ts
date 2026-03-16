import { describe, expect, it } from 'vitest'
import {
  GATE_THRESHOLDS,
  FORECAST_HORIZONS,
  ABSTENTION_THRESHOLDS,
  type ForecastControlV1,
  type BridgeRunAuditV1,
  BRIDGE_ROW_NAMES,
  isBridgeRowName,
  isGatePassResult,
} from '../forecast/types'

describe('TCAR-001: forecast types', () => {
  describe('gate threshold constants', () => {
    it('defines retrieval gate thresholds from PRD', () => {
      expect(GATE_THRESHOLDS.retrieval.futurePathCorrLowerBound).toBe(0.02)
      expect(GATE_THRESHOLDS.retrieval.peakHitLowerBound).toBe(0.03)
      expect(GATE_THRESHOLDS.retrieval.peakGapImprovementPct).toBe(5)
      expect(GATE_THRESHOLDS.retrieval.sliceRegressionLimit).toBe(-0.01)
    })

    it('defines forecast ship gate thresholds from PRD', () => {
      expect(GATE_THRESHOLDS.forecastShip.minProspectiveShadowWeeks).toBe(6)
      expect(GATE_THRESHOLDS.forecastShip.minLiveQueries).toBe(400)
      expect(GATE_THRESHOLDS.forecastShip.minSliceLiveQueries).toBe(50)
      expect(GATE_THRESHOLDS.forecastShip.ibsRelativeImprovement).toBe(0.05)
      expect(GATE_THRESHOLDS.forecastShip.brierImprovementThreshold).toBe(0.03)
      expect(GATE_THRESHOLDS.forecastShip.brierMinImprovingHorizons).toBe(2)
      expect(GATE_THRESHOLDS.forecastShip.globalEceCeiling).toBe(0.05)
      expect(GATE_THRESHOLDS.forecastShip.worstSliceEceCeiling).toBe(0.08)
    })

    it('defines data gate thresholds from PRD', () => {
      expect(GATE_THRESHOLDS.data.coverageGapCeiling).toBe(0.05)
      expect(GATE_THRESHOLDS.data.leakageAuditFailuresCeiling).toBe(0)
      expect(GATE_THRESHOLDS.data.missingSnapshotCeiling).toBe(0.01)
    })

    it('defines Phase B readiness floor from PRD', () => {
      expect(GATE_THRESHOLDS.phaseBReadiness.minNativeEvalRows).toBe(5000)
      expect(GATE_THRESHOLDS.phaseBReadiness.minWeeklyCohorts).toBe(8)
      expect(GATE_THRESHOLDS.phaseBReadiness.minSliceEvalRows).toBe(300)
      expect(GATE_THRESHOLDS.phaseBReadiness.minSliceCompletedEpisodes).toBe(50)
    })

    it('defines bridge cutover thresholds from PRD', () => {
      expect(GATE_THRESHOLDS.bridge.consecutivePassesForCutover).toBe(4)
      expect(GATE_THRESHOLDS.bridge.consecutiveFailuresForRollback).toBe(2)
      expect(GATE_THRESHOLDS.bridge.rollbackDrillsBeforeCutover).toBe(2)
    })

    it('defines bridge parity thresholds from PRD §9.2 (TCAR-001)', () => {
      expect(GATE_THRESHOLDS.bridge.coverageDiffThreshold).toBe(0.02)
      expect(GATE_THRESHOLDS.bridge.coverageGapThreshold).toBe(0.05)
      expect(GATE_THRESHOLDS.bridge.reconstructionSuccessThreshold).toBe(0.99)
      expect(GATE_THRESHOLDS.bridge.missingSnapshotThreshold).toBe(0.01)
      expect(GATE_THRESHOLDS.bridge.dualWriteThreshold).toBe(0.99)
    })

    it('defines label audit hard requirements from PRD §10.7', () => {
      expect(GATE_THRESHOLDS.labelAudit.overlappingEpisodesCeiling).toBe(0)
      expect(GATE_THRESHOLDS.labelAudit.inferredBoundaryOverallCeiling).toBe(0.15)
      expect(GATE_THRESHOLDS.labelAudit.inferredBoundarySliceCeiling).toBe(0.10)
      expect(GATE_THRESHOLDS.labelAudit.rightCensoredAsNegativesCeiling).toBe(0)
      expect(GATE_THRESHOLDS.labelAudit.futureInformedBoundaryChangesCeiling).toBe(0)
    })
  })

  describe('forecast horizons', () => {
    it('defines the canonical forecast horizons', () => {
      expect(FORECAST_HORIZONS).toEqual([5, 10, 20])
    })
  })

  describe('abstention thresholds', () => {
    it('defines evidence-quality-based abstention from PRD', () => {
      expect(ABSTENTION_THRESHOLDS.minAnalogSupport).toBe(5)
      expect(ABSTENTION_THRESHOLDS.maxCandidateConcentrationGini).toBe(0.60)
      expect(ABSTENTION_THRESHOLDS.maxTop1AnalogWeight).toBe(0.35)
    })
  })

  describe('ForecastControlV1 type contract', () => {
    it('has required control plane fields', () => {
      const control: ForecastControlV1 = {
        id: 'fc-001',
        artifact_version: 'forecast_control_v1',
        production_version: '1.0.0',
        serving_status: 'shadow',
        cutover_ready: false,
        rollback_target_version: null,
        rollback_drill_count: 0,
        rollback_drill_last_success: null,
        fail_closed_verified: false,
        ship_verdict_artifact_id: null,
        policy_versions: {
          theme_definition_version: '1.0',
          episode_policy_version: '1.0',
          label_policy_version: '1.0',
          feature_family_version: '1.0',
          retrieval_spec_version: '1.0',
          calibration_version: '1.0',
          forecast_version: '1.0',
        },
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      }
      expect(control.cutover_ready).toBe(false)
      expect(control.serving_status).toBe('shadow')
      expect(control.fail_closed_verified).toBe(false)
    })

    it('cannot have cutover_ready=true without rollback drills', () => {
      const control: ForecastControlV1 = {
        id: 'fc-002',
        artifact_version: 'forecast_control_v1',
        production_version: '1.0.0',
        serving_status: 'production',
        cutover_ready: true,
        rollback_target_version: '0.9.0',
        rollback_drill_count: 2,
        rollback_drill_last_success: '2026-02-01T00:00:00Z',
        fail_closed_verified: true,
        ship_verdict_artifact_id: 'sv-001',
        policy_versions: {
          theme_definition_version: '1.0',
          episode_policy_version: '1.0',
          label_policy_version: '1.0',
          feature_family_version: '1.0',
          retrieval_spec_version: '1.0',
          calibration_version: '1.0',
          forecast_version: '1.0',
        },
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-02-01T00:00:00Z',
      }
      expect(control.cutover_ready).toBe(true)
      expect(control.rollback_drill_count).toBeGreaterThanOrEqual(
        GATE_THRESHOLDS.bridge.rollbackDrillsBeforeCutover
      )
    })
  })

  describe('BridgeRunAuditV1 type contract', () => {
    it('has bridge audit fields', () => {
      const audit: BridgeRunAuditV1 = {
        id: 'bra-001',
        artifact_version: 'bridge_run_audits_v1',
        run_date: '2026-01-15',
        bridge_row: 'episode_registry',
        parity: {
          metric_name: 'active_theme_coverage_diff',
          metric_value: 0.01,
          threshold: 0.02,
          passed: true,
        },
        verdict: 'pass',
        cutover_eligible: true,
        rollback_triggered: false,
        details: null,
        created_at: '2026-01-15T00:00:00Z',
      }
      expect(audit.verdict).toBe('pass')
      expect(audit.bridge_row).toBe('episode_registry')
    })
  })

  describe('bridge row names', () => {
    it('defines the four canonical bridge rows from PRD', () => {
      expect(BRIDGE_ROW_NAMES).toEqual([
        'episode_registry',
        'query_snapshot_label',
        'analog_candidates_evidence',
        'forecast_control',
      ])
    })

    it('validates bridge row names', () => {
      expect(isBridgeRowName('episode_registry')).toBe(true)
      expect(isBridgeRowName('query_snapshot_label')).toBe(true)
      expect(isBridgeRowName('analog_candidates_evidence')).toBe(true)
      expect(isBridgeRowName('forecast_control')).toBe(true)
      expect(isBridgeRowName('unknown_row')).toBe(false)
      expect(isBridgeRowName('')).toBe(false)
    })
  })

  describe('gate pass result validator', () => {
    it('validates pass results', () => {
      expect(isGatePassResult('pass')).toBe(true)
      expect(isGatePassResult('fail')).toBe(true)
      expect(isGatePassResult('pending')).toBe(true)
      expect(isGatePassResult('pending_not_materialized')).toBe(true)
      expect(isGatePassResult('invalid')).toBe(false)
    })
  })
})
