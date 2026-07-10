import { describe, expect, it } from 'vitest'

import { buildScientificM1EvaluationPlan } from '../offline-eval-scientific-m1'
import {
  buildOfflineEvalInputFromScientificPlan,
  parseScientificM1Envelope,
} from '../scientific-m1-offline-input'
import { buildScientificM1Fixture, STUDY_CONTRACT_SHA256 } from './offline-eval-scientific-m1-fixture'

describe('scientific M1 offline-eval input mapping', () => {
  it('derives the legacy baseline report input from the same parsed study rows', () => {
    const study = parseScientificM1Envelope({ scientificM1: buildScientificM1Fixture() })
    const plan = buildScientificM1EvaluationPlan(study)

    const offline = buildOfflineEvalInputFromScientificPlan({ study, plan })

    expect(offline.featureRows).toHaveLength(312)
    expect(offline.featureRows.every((row) => row.values.length === 10)).toBe(true)
    expect(offline.labels).toHaveLength(312)
    expect(offline.labelStatusCounts).toEqual({ final: 312, censored: 0, excluded: 0, pending: 0 })
    expect(offline.scientificBaseline?.datasetManifest.study_contract_sha256).toBe(STUDY_CONTRACT_SHA256)
    expect(offline.scientificBaseline?.rows).toHaveLength(312)
    expect(offline.scientificBaseline?.rows.every((row) => row.bablPhase === 'sideways')).toBe(true)
    expect(offline.scientificBaseline?.rows[0]?.interestSlope7d).toBe(plan.rows[0]?.features[0])
    expect(offline.scientificBaseline?.rows[0]?.newsMomentum).toBe(plan.rows[0]?.features[6])
  })

  it('rejects extra top-level input fields before any training process starts', () => {
    expect(() => parseScientificM1Envelope({
      scientificM1: buildScientificM1Fixture(),
      m1Predictions: [],
    })).toThrow(/unrecognized_keys/i)
  })
})
