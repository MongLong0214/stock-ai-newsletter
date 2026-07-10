import { predictM1Probability, type M1ModelArtifactV2 } from './m1'

// plan Todo 13/15 (block_bootstrap_envelope_v1): row-level prediction intervals are replayed from the
// frozen 500-model ensemble persisted at cycle freeze — never a post-hoc substitute. Each replicate
// body carries the estimator/calibrator coefficients; prediction reuses the byte-parity M1 predictor.

export const INTERVAL_REPLICATE_COUNT = 500
const LOWER_QUANTILE = 0.025
const UPPER_QUANTILE = 0.975

export type ReplicateBody = {
  readonly replicate_index: number
  readonly scaler: { readonly median: readonly number[]; readonly mad: readonly number[] }
  readonly coefficients: { readonly intercept: number; readonly weights: readonly number[] }
  readonly calibrator: { readonly a: number; readonly b: number }
}

export type IntervalReplayRow = {
  readonly values: readonly number[]
  readonly missingFlags: readonly boolean[]
}

export interface ReplayedEnvelope {
  readonly lower: number
  readonly upper: number
}

export class IntervalReplayError extends Error {
  readonly name = 'IntervalReplayError'

  constructor(readonly code: string) {
    super(code)
  }
}

// Hyndman-Fan type 7 linear interpolation — identical to stats_bootstrap.hf7_quantile.
export function hf7Quantile(values: readonly number[], quantile: number): number {
  if (values.length === 0) throw new IntervalReplayError('interval_replay_empty_quantile')
  if (!(quantile >= 0 && quantile <= 1)) throw new IntervalReplayError('interval_replay_quantile_out_of_range')
  const ordered = [...values].sort((left, right) => left - right)
  const first = ordered[0] as number
  if (ordered.length === 1) return first
  const position = (ordered.length - 1) * quantile
  const lower = Math.floor(position)
  const upper = Math.min(lower + 1, ordered.length - 1)
  const fraction = position - lower
  const lo = ordered[lower] as number
  const hi = ordered[upper] as number
  return lo + fraction * (hi - lo)
}

const replicateArtifact = (fullFit: M1ModelArtifactV2, body: ReplicateBody): M1ModelArtifactV2 => ({
  ...fullFit,
  scaler: { median: body.scaler.median, mad: body.scaler.mad },
  coefficients: { intercept: body.coefficients.intercept, weights: body.coefficients.weights },
  calibrator: { type: 'platt', a: body.calibrator.a, b: body.calibrator.b },
})

export function replayReplicateProbabilities(input: {
  readonly fullFitArtifact: M1ModelArtifactV2
  readonly replicateBodies: readonly ReplicateBody[]
  readonly row: IntervalReplayRow
}): number[] {
  if (input.replicateBodies.length !== INTERVAL_REPLICATE_COUNT) {
    throw new IntervalReplayError('interval_replay_incomplete_ensemble')
  }
  return input.replicateBodies.map((body, index) => {
    if (body.replicate_index !== index) throw new IntervalReplayError('interval_replay_unordered_bodies')
    const probability = predictM1Probability(replicateArtifact(input.fullFitArtifact, body), {
      values: input.row.values,
      missingFlags: input.row.missingFlags,
    })
    if (probability === null || !Number.isFinite(probability)) {
      throw new IntervalReplayError('interval_replay_nonfinite_probability')
    }
    return probability
  })
}

// block_bootstrap_envelope_v1: lower = max(0, min(p, q02.5)), upper = min(1, max(p, q97.5)).
export function replayCandidateEnvelope(input: {
  readonly fullFitArtifact: M1ModelArtifactV2
  readonly replicateBodies: readonly ReplicateBody[]
  readonly row: IntervalReplayRow
  readonly pointProbability: number
}): ReplayedEnvelope {
  const probabilities = replayReplicateProbabilities(input)
  const q025 = hf7Quantile(probabilities, LOWER_QUANTILE)
  const q975 = hf7Quantile(probabilities, UPPER_QUANTILE)
  return {
    lower: Math.max(0, Math.min(input.pointProbability, q025)),
    upper: Math.min(1, Math.max(input.pointProbability, q975)),
  }
}

// Fail-closed replay verification: a stored envelope must byte-equal the value produced by replaying
// the persisted 500-model ensemble. A substitute (e.g. [0, 1]) never survives this check.
export function assertReplayedEnvelope(input: {
  readonly fullFitArtifact: M1ModelArtifactV2
  readonly replicateBodies: readonly ReplicateBody[]
  readonly row: IntervalReplayRow
  readonly pointProbability: number
  readonly storedLower: number
  readonly storedUpper: number
}): void {
  const replayed = replayCandidateEnvelope(input)
  if (input.storedLower !== replayed.lower || input.storedUpper !== replayed.upper) {
    throw new IntervalReplayError('interval_replay_substitute_rejected')
  }
}
