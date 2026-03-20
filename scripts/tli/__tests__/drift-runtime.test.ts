import { describe, expect, it } from 'vitest'
import { buildOperationalDriftArtifact } from '../ops/run-level4-drift'

const rows = [
  {
    runId: 'run-1',
    evaluatedAt: '2026-01-10',
    binaryRelevant: true,
    censoredReason: null,
    relevanceProbability: 0.7,
    supportCount: 240,
    probabilityCiLower: 0.65,
    probabilityCiUpper: 0.75,
    firstSpikeInferred: false,
  },
  {
    runId: 'run-2',
    evaluatedAt: '2026-02-10',
    binaryRelevant: false,
    censoredReason: null,
    relevanceProbability: 0.15,
    supportCount: 80,
    probabilityCiLower: 0.08,
    probabilityCiUpper: 0.22,
    firstSpikeInferred: false,
  },
  {
    runId: 'run-3',
    evaluatedAt: '2026-03-10',
    binaryRelevant: false,
    censoredReason: 'run_horizon_immature',
    relevanceProbability: 0.05,
    supportCount: 20,
    probabilityCiLower: 0.01,
    probabilityCiUpper: 0.18,
    firstSpikeInferred: false,
  },
]

describe('run-level4-drift operational artifact', () => {
  it('stays observation-only before baseline maturity', () => {
    const artifact = buildOperationalDriftArtifact({
      driftVersion: 'drift-1',
      reportDate: '2026-03-12',
      sourceSurface: 'v2_certification',
      rows,
      calibrationArtifactPresent: true,
      priorBaseline: null,
    })

    expect(artifact.auto_hold_enabled).toBe(false)
    expect(artifact.drift_status).toBe('observation_only')
    expect(artifact.hold_report_date).toBeNull()
  })

  it('activates hold when mature baseline and trigger thresholds are breached', () => {
    const artifact = buildOperationalDriftArtifact({
      driftVersion: 'drift-2',
      reportDate: '2026-03-12',
      sourceSurface: 'v2_certification',
      rows: Array.from({ length: 3000 }, (_, index) => ({
        ...rows[index % rows.length],
        runId: `run-${index}`,
        evaluatedAt: [
          '2026-01-01', '2026-01-04', '2026-01-07', '2026-01-10', '2026-01-13',
          '2026-01-16', '2026-01-19', '2026-01-22', '2026-01-25', '2026-01-28',
          '2026-02-01', '2026-02-04', '2026-02-07', '2026-02-10', '2026-02-13',
          '2026-02-16', '2026-02-19', '2026-02-22', '2026-02-25', '2026-02-28',
          '2026-03-01', '2026-03-04', '2026-03-07', '2026-03-10', '2026-03-13',
          '2026-03-16', '2026-03-19', '2026-03-22', '2026-03-25', '2026-03-28',
        ][index % 30],
      })),
      calibrationArtifactPresent: true,
      priorBaseline: {
        relevanceBaseRate: 0.50,
        ece: 0.01,
        censoringRatio: 0.05,
        candidateConcentrationGini: 0.10,
        supportBucketPrecision: { high: 0.9, medium: 0.7, low: 0.4 },
      },
    })

    expect(artifact.auto_hold_enabled).toBe(true)
    expect(artifact.drift_status).toBe('hold')
    expect(artifact.hold_report_date).toBe('2026-03-12')
  })

  it('uses a real prior baseline instead of self-comparing the current artifact', () => {
    const artifact = buildOperationalDriftArtifact({
      driftVersion: 'drift-3',
      reportDate: '2026-03-12',
      sourceSurface: 'v2_certification',
      rows: Array.from({ length: 3000 }, (_, index) => ({
        ...rows[index % rows.length],
        runId: `run-${index}`,
        evaluatedAt: [
          '2026-01-01', '2026-01-04', '2026-01-07', '2026-01-10', '2026-01-13',
          '2026-01-16', '2026-01-19', '2026-01-22', '2026-01-25', '2026-01-28',
          '2026-02-01', '2026-02-04', '2026-02-07', '2026-02-10', '2026-02-13',
          '2026-02-16', '2026-02-19', '2026-02-22', '2026-02-25', '2026-02-28',
          '2026-03-01', '2026-03-04', '2026-03-07', '2026-03-10', '2026-03-13',
          '2026-03-16', '2026-03-19', '2026-03-22', '2026-03-25', '2026-03-28',
        ][index % 30],
      })),
      calibrationArtifactPresent: true,
      priorBaseline: {
        relevanceBaseRate: 0.07,
        ece: 0.01,
        censoringRatio: 0.01,
        candidateConcentrationGini: 0.05,
        supportBucketPrecision: { high: 0.9, medium: 0.8, low: 0.7 },
      },
    })

    expect(artifact.triggered_rules.length).toBeGreaterThan(0)
    expect(artifact.drift_status).toBe('hold')
  })
})
