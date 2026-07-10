import { describe, expect, it } from 'vitest'

import goldenFixture from '../../__tests__/fixtures/m1-golden-vector.json'
import {
  INTERVAL_REPLICATE_COUNT,
  IntervalReplayError,
  assertReplayedEnvelope,
  hf7Quantile,
  replayCandidateEnvelope,
  type ReplicateBody,
} from '../interval-replay'
import { predictM1Probability } from '../m1'
import { parseM1ModelArtifact } from '../predict'

const fullFit = parseM1ModelArtifact(goldenFixture.artifact)
const row = { values: goldenFixture.inputRow.values, missingFlags: goldenFixture.inputRow.missingFlags }
const point = (() => {
  const probability = predictM1Probability(fullFit, row)
  if (probability === null) throw new Error('golden probe unexpectedly abstained')
  return probability
})()

// Deterministic ensemble whose replicate intercepts fan out symmetrically around the full fit,
// so the replayed calibrated probabilities span a non-degenerate quantile band around the point.
const buildBodies = (count = INTERVAL_REPLICATE_COUNT): ReplicateBody[] => (
  Array.from({ length: count }, (_unused, index) => ({
    replicate_index: index,
    scaler: { median: fullFit.scaler.median, mad: fullFit.scaler.mad },
    coefficients: {
      intercept: fullFit.coefficients.intercept + (index - 250) * 0.004,
      weights: fullFit.coefficients.weights,
    },
    calibrator: { a: fullFit.calibrator.a, b: fullFit.calibrator.b },
  }))
)

describe('interval replay (block_bootstrap_envelope_v1)', () => {
  it('reproduces Hyndman-Fan type 7 linear interpolation', () => {
    expect(hf7Quantile([1, 2, 3, 4], 0.5)).toBe(2.5)
    expect(hf7Quantile([4, 3, 2, 1], 0.25)).toBe(1.75)
    expect(hf7Quantile([10], 0.975)).toBe(10)
  })

  it('replays a deterministic envelope that brackets the full-fit point', () => {
    const bodies = buildBodies()
    const first = replayCandidateEnvelope({ fullFitArtifact: fullFit, replicateBodies: bodies, row, pointProbability: point })
    const second = replayCandidateEnvelope({ fullFitArtifact: fullFit, replicateBodies: bodies, row, pointProbability: point })
    expect(first).toEqual(second)
    expect(first.lower).toBeGreaterThanOrEqual(0)
    expect(first.upper).toBeLessThanOrEqual(1)
    expect(first.lower).toBeLessThanOrEqual(point)
    expect(point).toBeLessThanOrEqual(first.upper)
    expect(first.lower).toBeLessThan(first.upper)
  })

  it('accepts a stored envelope that byte-matches the replay', () => {
    const bodies = buildBodies()
    const envelope = replayCandidateEnvelope({ fullFitArtifact: fullFit, replicateBodies: bodies, row, pointProbability: point })
    expect(() => assertReplayedEnvelope({
      fullFitArtifact: fullFit, replicateBodies: bodies, row, pointProbability: point,
      storedLower: envelope.lower, storedUpper: envelope.upper,
    })).not.toThrow()
  })

  it('rejects a substitute [0, 1] envelope that no replay could produce', () => {
    const bodies = buildBodies()
    expect(() => assertReplayedEnvelope({
      fullFitArtifact: fullFit, replicateBodies: bodies, row, pointProbability: point,
      storedLower: 0, storedUpper: 1,
    })).toThrowError(new IntervalReplayError('interval_replay_substitute_rejected'))
  })

  it('rejects an ensemble that is missing model bodies', () => {
    expect(() => replayCandidateEnvelope({
      fullFitArtifact: fullFit, replicateBodies: buildBodies(499), row, pointProbability: point,
    })).toThrowError(new IntervalReplayError('interval_replay_incomplete_ensemble'))
  })
})
