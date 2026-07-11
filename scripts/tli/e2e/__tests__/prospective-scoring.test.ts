import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import goldenFixture from '../../../../lib/tli/__tests__/fixtures/m1-golden-vector.json'
import { canonicalJsonV1Sha256 } from '../../../../lib/tli/canonical-json'
import { CONFIRMATORY_FEATURE_NAMES } from '../../../../lib/tli/features/build-confirmatory-features'
import { INTERVAL_REPLICATE_COUNT, type ReplicateBody } from '../../../../lib/tli/model/interval-replay'
import { predictM1Probability } from '../../../../lib/tli/model/m1'
import { parseM1ModelArtifact } from '../../../../lib/tli/model/predict'
import { THEME_IDS, deterministicUuid } from '../fixture-identities'
import { scoreProspectiveOrigin } from '../prospective-scoring'

const artifact = parseM1ModelArtifact(goldenFixture.artifact)
const artifactJson = `${JSON.stringify(artifact, null, 2)}\n`
const pointProbability = predictM1Probability(artifact, goldenFixture.inputRow)
if (pointProbability === null) throw new Error('golden candidate unexpectedly abstained')

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

const origin = {
  originDate: '2027-03-01',
  forecastCutoff: '2027-03-01T09:00:00.000Z',
  forecastManifestId: deterministicUuid('mismatch-forecast', 1),
  forecastManifestSha256: 'a'.repeat(64),
  studyOriginManifestId: deterministicUuid('mismatch-study-origin', 1),
  studyOriginManifestSha256: 'b'.repeat(64),
}

const snapshot = {
  featureNames: CONFIRMATORY_FEATURE_NAMES,
  values: goldenFixture.inputRow.values,
  missingFlags: goldenFixture.inputRow.missingFlags,
  abstain: false,
  abstainReasons: [],
  provenance: {
    studyOriginManifestId: origin.studyOriginManifestId,
    studyOriginManifestSha256: origin.studyOriginManifestSha256,
    studyContractId: deterministicUuid('mismatch-study', 1),
    studyContractSha256: 'c'.repeat(64),
    featureContractVersion: 'tli-attention-v2-f1' as const,
    featureContractSha256: 'd'.repeat(64),
    forecastOriginManifestId: origin.forecastManifestId,
    forecastOriginManifestSha256: origin.forecastManifestSha256,
    themeId: THEME_IDS[0] ?? '',
    baseDate: origin.originDate,
    cutoffAt: origin.forecastCutoff,
    interestRunId: null,
    interestResponseSha256: null,
    interestSourceMaxDate: null,
    interestSourceAgeDays: null,
    newsObservationIds: [],
    newsInputSha256: null,
    newsSourceMaxDate: null,
    newsSourceAgeDays: null,
    newsRunIds: [],
    newsRunResponseSha256s: [],
    bablObservationId: null,
    bablInputSha256: null,
    bablCandidatePool: null,
  },
  featureSnapshotSha256: canonicalJsonV1Sha256(goldenFixture.inputRow),
}

describe('prospective scoring replay boundary', () => {
  it('rejects scoring when replay envelope bytes differ', async () => {
    await expect(scoreProspectiveOrigin({
      origin,
      rows: [{
        origin,
        themeId: THEME_IDS[0] ?? '',
        snapshot,
        candidateProbability: pointProbability,
        candidateCiLower: 0,
        candidateCiUpper: 1,
        comparatorProbability: 0.5,
        outcome: true,
        labelId: deterministicUuid('mismatch-label', 1),
        finalizedAt: '2027-03-08T11:00:00.000Z',
      }],
      artifact,
      artifactJson,
      artifactSha256: createHash('sha256').update(artifactJson).digest('hex'),
      intervalEnsembleSha256: canonicalJsonV1Sha256(intervalEnsembleArtifact),
      intervalEnsembleArtifact,
      replicateBodies,
      modelCreatedAt: '2027-02-28T00:00:00.000Z',
      modelArtifactId: deterministicUuid('mismatch-model-artifact', 1),
    })).rejects.toMatchObject({
      name: 'ProspectiveScoringCriticalIncidentError',
      code: 'interval_replay_substitute_rejected',
      originDate: origin.originDate,
      checkedRows: 0,
    })
  })
})
