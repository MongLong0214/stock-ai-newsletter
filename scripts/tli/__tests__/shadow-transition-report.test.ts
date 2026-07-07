import { describe, expect, it } from 'vitest'
import { buildShadowTransitionReport } from '../ops/shadow-transition-report'

const metricDates = Array.from({ length: 7 }, (_, index) => `2026-07-${String(index + 8).padStart(2, '0')}`)
const shadowDates = Array.from({ length: 14 }, (_, index) => `2026-07-${String(index + 1).padStart(2, '0')}`)

describe('buildShadowTransitionReport', () => {
  it('marks transition not ready when the shadow observation window is incomplete', () => {
    const report = buildShadowTransitionReport({
      asOfDate: '2026-07-14',
      shadowPredictions: shadowDates.slice(0, 13).map((predictionDate) => ({
        predictionDate,
        modelVersion: 'b-abl-v1',
        servingRole: 'shadow',
      })),
      metrics: metricDates.map((metricDate) => ({
        metricDate,
        modelVersion: 'b-abl-v1',
        brier: 0.12,
        coverage: 0.8,
        abstainRate: 0.2,
        nScored: 10,
      })),
      registry: [
        { modelVersion: 'b-abl-v1', status: 'champion' },
        { modelVersion: 'm0-previous', status: 'archived' },
      ],
    })

    expect(report.transitionReadiness).toBe('not_ready')
    expect(report.gates.shadowObservation.status).toBe('fail')
    expect(report.gates.metricsStreak.status).toBe('pass')
    expect(report.gates.rollbackTarget.status).toBe('pass')
  })

  it('marks transition ready when shadow, metrics, and rollback gates pass', () => {
    const report = buildShadowTransitionReport({
      asOfDate: '2026-07-14',
      shadowPredictions: shadowDates.map((predictionDate) => ({
        predictionDate,
        modelVersion: 'b-abl-v1',
        servingRole: 'shadow',
      })),
      metrics: metricDates.map((metricDate) => ({
        metricDate,
        modelVersion: 'b-abl-v1',
        brier: 0.1,
        coverage: 0.75,
        abstainRate: 0.25,
        nScored: 8,
      })),
      registry: [
        { modelVersion: 'b-abl-v1', status: 'champion' },
        { modelVersion: 'm0-previous', status: 'rolled_back' },
      ],
    })

    expect(report.transitionReadiness).toBe('ready_for_operator_cutover')
    expect(report.gates.shadowObservation.observedDays).toBe(14)
    expect(report.gates.metricsStreak.consecutiveDays).toBe(7)
    expect(report.rollbackTarget?.modelVersion).toBe('m0-previous')
  })

  it('fails closed when there is no rollback target even if observation data exists', () => {
    const report = buildShadowTransitionReport({
      asOfDate: '2026-07-14',
      shadowPredictions: shadowDates.map((predictionDate) => ({
        predictionDate,
        modelVersion: 'b-abl-v1',
        servingRole: 'shadow',
      })),
      metrics: metricDates.map((metricDate) => ({
        metricDate,
        modelVersion: 'b-abl-v1',
        brier: 0.11,
        coverage: 0.7,
        abstainRate: 0.3,
        nScored: 5,
      })),
      registry: [{ modelVersion: 'b-abl-v1', status: 'champion' }],
    })

    expect(report.transitionReadiness).toBe('not_ready')
    expect(report.gates.rollbackTarget.status).toBe('fail')
    expect(report.rollbackTarget).toBeNull()
  })
})
