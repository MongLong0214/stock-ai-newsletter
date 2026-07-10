import goldenFixture from '../../../lib/tli/__tests__/fixtures/m1-golden-vector.json'
import { canonicalJsonV1Sha256 } from '../../../lib/tli/canonical-json'
import { CONFIRMATORY_FEATURE_NAMES } from '../../../lib/tli/features/confirmatory-feature-types'
import {
  INTERVAL_REPLICATE_COUNT,
  replayCandidateEnvelope,
  type ReplicateBody,
} from '../../../lib/tli/model/interval-replay'
import { predictM1Probability } from '../../../lib/tli/model/m1'
import { parseM1ModelArtifact } from '../../../lib/tli/model/predict'

export const FEATURE_CONTRACT_SHA = 'c'.repeat(64)

export function buildScientificIntervalFixture(input: {
  readonly forecastId: string
  readonly themeId: string
}) {
  const snapshot = {
    featureNames: CONFIRMATORY_FEATURE_NAMES,
    values: goldenFixture.inputRow.values,
    missingFlags: goldenFixture.inputRow.missingFlags,
    abstain: false,
    abstainReasons: [],
    provenance: {
      featureContractSha256: FEATURE_CONTRACT_SHA,
      forecastOriginManifestId: input.forecastId,
      themeId: input.themeId,
      cutoffAt: '2026-07-06T09:00:00.000Z',
    },
  } as const
  const artifact = parseM1ModelArtifact(goldenFixture.artifact)
  const pointProbability = predictM1Probability(artifact, snapshot)
  if (pointProbability === null) throw new Error('scientific scoring fixture unexpectedly abstained')
  const replicateBodies: readonly ReplicateBody[] = Array.from(
    { length: INTERVAL_REPLICATE_COUNT },
    (_unused, index) => ({
      replicate_index: index,
      scaler: artifact.scaler,
      coefficients: artifact.coefficients,
      calibrator: { a: artifact.calibrator.a, b: artifact.calibrator.b },
    }),
  )
  const intervalEnsembleArtifact = { replicate_bodies: replicateBodies }
  const envelope = replayCandidateEnvelope({
    fullFitArtifact: artifact,
    replicateBodies,
    row: snapshot,
    pointProbability,
  })
  return {
    snapshot,
    snapshotSha256: canonicalJsonV1Sha256(snapshot),
    artifact,
    artifactSha256: canonicalJsonV1Sha256(artifact),
    pointProbability,
    envelope,
    intervalEnsembleArtifact,
    intervalEnsembleSha256: canonicalJsonV1Sha256(intervalEnsembleArtifact),
  }
}
