import { describe, expect, it } from 'vitest'
import {
  validateEpisodeRegistryParity,
  validateQuerySnapshotParity,
  validateAnalogCandidatesParity,
  validateForecastControlParity,
  runBridgeValidation,
  createPendingNotMaterializedResult,
  type BridgeRowResult,
} from '../ops/phase0-bridge'

describe('TCAR-003: phase0 bridge validators', () => {
  // ============================================================
  // Episode Registry Parity
  // ============================================================
  describe('validateEpisodeRegistryParity', () => {
    it('passes when all conditions are met', () => {
      const result = validateEpisodeRegistryParity({
        activeThemeCount: 100,
        episodeThemeCount: 100,
        overlappingEpisodeCount: 0,
        coverageGapRatio: 0.01,
      })
      expect(result.verdict).toBe('pass')
      expect(result.rowName).toBe('episode_registry')
      expect(result.rollback_triggered).toBe(false)
    })

    it('passes at exact 2% coverage diff threshold', () => {
      const result = validateEpisodeRegistryParity({
        activeThemeCount: 100,
        episodeThemeCount: 98,
        overlappingEpisodeCount: 0,
        coverageGapRatio: 0.0,
      })
      expect(result.verdict).toBe('pass')
    })

    it('fails when coverage diff > 2%', () => {
      const result = validateEpisodeRegistryParity({
        activeThemeCount: 100,
        episodeThemeCount: 95,
        overlappingEpisodeCount: 0,
        coverageGapRatio: 0.0,
      })
      expect(result.verdict).toBe('fail')
      expect(result.rollback_triggered).toBe(true)
    })

    it('fails when overlapping episodes > 0', () => {
      const result = validateEpisodeRegistryParity({
        activeThemeCount: 100,
        episodeThemeCount: 100,
        overlappingEpisodeCount: 1,
        coverageGapRatio: 0.0,
      })
      expect(result.verdict).toBe('fail')
    })

    it('fails when coverageGapRatio > 5%', () => {
      const result = validateEpisodeRegistryParity({
        activeThemeCount: 100,
        episodeThemeCount: 100,
        overlappingEpisodeCount: 0,
        coverageGapRatio: 0.06,
      })
      expect(result.verdict).toBe('fail')
    })

    it('passes at exact 5% coverageGapRatio threshold', () => {
      const result = validateEpisodeRegistryParity({
        activeThemeCount: 100,
        episodeThemeCount: 100,
        overlappingEpisodeCount: 0,
        coverageGapRatio: 0.05,
      })
      expect(result.verdict).toBe('pass')
    })

    it('handles zero activeThemeCount gracefully', () => {
      const result = validateEpisodeRegistryParity({
        activeThemeCount: 0,
        episodeThemeCount: 0,
        overlappingEpisodeCount: 0,
        coverageGapRatio: 0.0,
      })
      expect(result.verdict).toBe('pass')
    })

    it('returns correct parity structure', () => {
      const result = validateEpisodeRegistryParity({
        activeThemeCount: 100,
        episodeThemeCount: 100,
        overlappingEpisodeCount: 0,
        coverageGapRatio: 0.0,
      })
      expect(result.parity).toHaveProperty('metric_name')
      expect(result.parity).toHaveProperty('metric_value')
      expect(result.parity).toHaveProperty('threshold')
      expect(result.parity).toHaveProperty('passed')
    })
  })

  // ============================================================
  // Query Snapshot Parity
  // ============================================================
  describe('validateQuerySnapshotParity', () => {
    it('passes when reconstruction success >= 99% and missing <= 1%', () => {
      const result = validateQuerySnapshotParity({
        totalSnapshots: 1000,
        reconstructionSuccessCount: 995,
        missingSnapshotCount: 5,
      })
      expect(result.verdict).toBe('pass')
      expect(result.rollback_triggered).toBe(false)
    })

    it('fails when reconstruction success < 99%', () => {
      const result = validateQuerySnapshotParity({
        totalSnapshots: 100,
        reconstructionSuccessCount: 98,
        missingSnapshotCount: 0,
      })
      expect(result.verdict).toBe('fail')
      expect(result.rollback_triggered).toBe(true)
    })

    it('fails when missing > 1%', () => {
      const result = validateQuerySnapshotParity({
        totalSnapshots: 100,
        reconstructionSuccessCount: 99,
        missingSnapshotCount: 2,
      })
      expect(result.verdict).toBe('fail')
    })

    it('passes at exact 99% reconstruction threshold', () => {
      const result = validateQuerySnapshotParity({
        totalSnapshots: 100,
        reconstructionSuccessCount: 99,
        missingSnapshotCount: 1,
      })
      expect(result.verdict).toBe('pass')
    })

    it('returns pending_not_materialized for zero total snapshots', () => {
      const result = validateQuerySnapshotParity({
        totalSnapshots: 0,
        reconstructionSuccessCount: 0,
        missingSnapshotCount: 0,
      })
      expect(result.verdict).toBe('pending_not_materialized')
      expect(result.cutover_eligible).toBe(false)
    })

    it('clamps successCount exceeding totalSnapshots', () => {
      const result = validateQuerySnapshotParity({
        totalSnapshots: 100,
        reconstructionSuccessCount: 200,
        missingSnapshotCount: 0,
      })
      expect(result.verdict).toBe('pass')
      expect(result.parity.metric_value).toBeLessThanOrEqual(1)
    })
  })

  // ============================================================
  // Analog Candidates Parity
  // ============================================================
  describe('validateAnalogCandidatesParity', () => {
    it('passes when all conditions are met', () => {
      const result = validateAnalogCandidatesParity({
        expectedArtifacts: 100,
        materializedArtifacts: 100,
        dualWriteSuccessCount: 100,
        dualWriteAttemptCount: 100,
        auditTrailComplete: true,
      })
      expect(result.verdict).toBe('pass')
      expect(result.rollback_triggered).toBe(false)
    })

    it('fails when artifacts are incomplete', () => {
      const result = validateAnalogCandidatesParity({
        expectedArtifacts: 100,
        materializedArtifacts: 99,
        dualWriteSuccessCount: 100,
        dualWriteAttemptCount: 100,
        auditTrailComplete: true,
      })
      expect(result.verdict).toBe('fail')
    })

    it('fails and triggers rollback when dual-write < 99%', () => {
      const result = validateAnalogCandidatesParity({
        expectedArtifacts: 100,
        materializedArtifacts: 100,
        dualWriteSuccessCount: 98,
        dualWriteAttemptCount: 100,
        auditTrailComplete: true,
      })
      expect(result.verdict).toBe('fail')
      expect(result.rollback_triggered).toBe(true)
    })

    it('fails and triggers rollback when audit trail incomplete', () => {
      const result = validateAnalogCandidatesParity({
        expectedArtifacts: 100,
        materializedArtifacts: 100,
        dualWriteSuccessCount: 100,
        dualWriteAttemptCount: 100,
        auditTrailComplete: false,
      })
      expect(result.verdict).toBe('fail')
      expect(result.rollback_triggered).toBe(true)
    })

    it('passes at exact 99% dual-write threshold', () => {
      const result = validateAnalogCandidatesParity({
        expectedArtifacts: 100,
        materializedArtifacts: 100,
        dualWriteSuccessCount: 99,
        dualWriteAttemptCount: 100,
        auditTrailComplete: true,
      })
      expect(result.verdict).toBe('pass')
    })

    it('returns pending_not_materialized for zero expected artifacts', () => {
      const result = validateAnalogCandidatesParity({
        expectedArtifacts: 0,
        materializedArtifacts: 0,
        dualWriteSuccessCount: 0,
        dualWriteAttemptCount: 0,
        auditTrailComplete: true,
      })
      expect(result.verdict).toBe('pending_not_materialized')
      expect(result.cutover_eligible).toBe(false)
    })

    it('returns pending_not_materialized when expectedArtifacts=0 but attempts>0', () => {
      const result = validateAnalogCandidatesParity({
        expectedArtifacts: 0,
        materializedArtifacts: 0,
        dualWriteSuccessCount: 5,
        dualWriteAttemptCount: 10,
        auditTrailComplete: true,
      })
      expect(result.verdict).toBe('pending_not_materialized')
    })

    it('returns pending_not_materialized when attempts=0 but expectedArtifacts>0', () => {
      const result = validateAnalogCandidatesParity({
        expectedArtifacts: 50,
        materializedArtifacts: 50,
        dualWriteSuccessCount: 0,
        dualWriteAttemptCount: 0,
        auditTrailComplete: true,
      })
      expect(result.verdict).toBe('pending_not_materialized')
    })

    it('clamps successCount exceeding attemptCount', () => {
      const result = validateAnalogCandidatesParity({
        expectedArtifacts: 100,
        materializedArtifacts: 100,
        dualWriteSuccessCount: 200,
        dualWriteAttemptCount: 100,
        auditTrailComplete: true,
      })
      expect(result.verdict).toBe('pass')
      expect(result.parity.metric_value).toBeLessThanOrEqual(1)
    })
  })

  // ============================================================
  // Forecast Control Parity
  // ============================================================
  describe('validateForecastControlParity', () => {
    it('passes when 100% drill success and fail-closed verified', () => {
      const result = validateForecastControlParity({
        rollbackDrillCount: 3,
        rollbackDrillSuccessCount: 3,
        failClosedVerified: true,
      })
      expect(result.verdict).toBe('pass')
      expect(result.rollback_triggered).toBe(false)
    })

    it('fails and triggers rollback when drill success < 100%', () => {
      const result = validateForecastControlParity({
        rollbackDrillCount: 3,
        rollbackDrillSuccessCount: 2,
        failClosedVerified: true,
      })
      expect(result.verdict).toBe('fail')
      expect(result.rollback_triggered).toBe(true)
    })

    it('fails and triggers rollback when fail-closed not verified', () => {
      const result = validateForecastControlParity({
        rollbackDrillCount: 2,
        rollbackDrillSuccessCount: 2,
        failClosedVerified: false,
      })
      expect(result.verdict).toBe('fail')
      expect(result.rollback_triggered).toBe(true)
    })

    it('handles zero drills gracefully', () => {
      const result = validateForecastControlParity({
        rollbackDrillCount: 0,
        rollbackDrillSuccessCount: 0,
        failClosedVerified: true,
      })
      expect(result.verdict).toBe('fail')
    })

    it('fails when drill count is 1 even with 100% success rate', () => {
      // PRD requires minimum 2 drills before cutover
      const result = validateForecastControlParity({
        rollbackDrillCount: 1,
        rollbackDrillSuccessCount: 1,
        failClosedVerified: true,
      })
      expect(result.verdict).toBe('fail')
      expect(result.details).toHaveProperty('drill_count', 1)
      expect(result.details).toHaveProperty('minimum_required', 2)
    })
  })

  // ============================================================
  // Aggregation
  // ============================================================
  describe('runBridgeValidation', () => {
    const passingResult = (rowName: BridgeRowResult['rowName']): BridgeRowResult => ({
      rowName,
      verdict: 'pass',
      parity: { metric_name: 'test', metric_value: 1, threshold: 1, passed: true },
      cutover_eligible: true,
      rollback_triggered: false,
      details: null,
    })

    it('returns cutoverEligible=true when all pass', () => {
      const results = [
        passingResult('episode_registry'),
        passingResult('query_snapshot_label'),
        passingResult('analog_candidates_evidence'),
        passingResult('forecast_control'),
      ]
      const agg = runBridgeValidation(results)
      expect(agg.allPassed).toBe(true)
      expect(agg.cutoverEligible).toBe(true)
      expect(agg.rollbackTriggered).toBe(false)
    })

    it('returns cutoverEligible=false when any fails', () => {
      const results = [
        passingResult('episode_registry'),
        { ...passingResult('query_snapshot_label'), verdict: 'fail' as const },
        passingResult('analog_candidates_evidence'),
        passingResult('forecast_control'),
      ]
      const agg = runBridgeValidation(results)
      expect(agg.allPassed).toBe(false)
      expect(agg.cutoverEligible).toBe(false)
    })

    it('returns cutoverEligible=false when any pending_not_materialized', () => {
      const results = [
        passingResult('episode_registry'),
        { ...passingResult('query_snapshot_label'), verdict: 'pending_not_materialized' as const },
        passingResult('analog_candidates_evidence'),
        passingResult('forecast_control'),
      ]
      const agg = runBridgeValidation(results)
      expect(agg.cutoverEligible).toBe(false)
    })

    it('returns cutoverEligible=false when allPassed but rollbackTriggered', () => {
      const results = [
        { ...passingResult('episode_registry'), rollback_triggered: true },
        passingResult('query_snapshot_label'),
        passingResult('analog_candidates_evidence'),
        passingResult('forecast_control'),
      ]
      const agg = runBridgeValidation(results)
      expect(agg.allPassed).toBe(true)
      expect(agg.rollbackTriggered).toBe(true)
      expect(agg.cutoverEligible).toBe(false)
    })

    it('returns rollbackTriggered=true when any validator triggers rollback', () => {
      const results = [
        passingResult('episode_registry'),
        { ...passingResult('query_snapshot_label'), rollback_triggered: true },
        passingResult('analog_candidates_evidence'),
        passingResult('forecast_control'),
      ]
      const agg = runBridgeValidation(results)
      expect(agg.rollbackTriggered).toBe(true)
    })

    it('fails when results is empty (fail-closed: no evidence = fail)', () => {
      const agg = runBridgeValidation([])
      expect(agg.allPassed).toBe(false)
      expect(agg.cutoverEligible).toBe(false)
    })

    it('preserves all individual results', () => {
      const results = [
        passingResult('episode_registry'),
        passingResult('query_snapshot_label'),
      ]
      const agg = runBridgeValidation(results)
      expect(agg.results).toHaveLength(2)
      expect(agg.results[0].rowName).toBe('episode_registry')
    })
  })

  // ============================================================
  // Pending Not Materialized Helper
  // ============================================================
  describe('createPendingNotMaterializedResult', () => {
    it('returns correct structure with pending_not_materialized verdict', () => {
      const result = createPendingNotMaterializedResult('episode_registry')
      expect(result.rowName).toBe('episode_registry')
      expect(result.verdict).toBe('pending_not_materialized')
      expect(result.cutover_eligible).toBe(false)
      expect(result.rollback_triggered).toBe(false)
      expect(result.parity.metric_value).toBe(0)
      expect(result.parity.threshold).toBe(0)
      expect(result.parity.passed).toBe(false)
    })

    it('works for all bridge row names', () => {
      const names = [
        'episode_registry',
        'query_snapshot_label',
        'analog_candidates_evidence',
        'forecast_control',
      ] as const
      for (const name of names) {
        const result = createPendingNotMaterializedResult(name)
        expect(result.rowName).toBe(name)
        expect(result.verdict).toBe('pending_not_materialized')
      }
    })
  })
})
