import { describe, expect, it } from 'vitest'

import { canonicalJsonV1Sha256 } from '../../../lib/tli/canonical-json'
import { buildScientificPredictionScoringPlan } from '../comparison/theme-predictions-v3-scientific-scoring'
import {
  CANDIDATE_ID,
  CANDIDATE_SHA,
  COMPARATOR_ID,
  FEATURE_CONTRACT_SHA,
  INTERVAL_SHA,
  makeScientificScoringFixture,
  THEME_ID,
} from './theme-predictions-v3-scientific-scoring.fixture'

const build = (input = makeScientificScoringFixture()) => buildScientificPredictionScoringPlan(input)
const MODEL_ARTIFACT_ID = '90000000-0000-4000-8000-000000000002'

describe('Todo 13 scientific scorer — frozen interval', () => {
  it('rejects the r3 [0,1] substitute before either role can be finalized', () => {
    const fixture = makeScientificScoringFixture()
    fixture.predictions = fixture.predictions.map((row) => row.id === CANDIDATE_ID
      ? { ...row, ci_lower: 0, ci_upper: 1 }
      : row)

    expect(() => build(fixture)).toThrow(expect.objectContaining({
      name: 'ScientificScoringCriticalIncidentError',
      kind: 'critical_incident',
      code: 'interval_replay_substitute_rejected',
      predictionId: CANDIDATE_ID,
    }))
  })

  it('rejects a comparator [0,1] substitute before either role can be finalized', () => {
    const fixture = makeScientificScoringFixture()
    fixture.predictions = fixture.predictions.map((row) => row.id === COMPARATOR_ID
      ? { ...row, ci_lower: 0, ci_upper: 1 }
      : row)

    expect(() => build(fixture)).toThrow(expect.objectContaining({
      name: 'ScientificScoringCriticalIncidentError',
      kind: 'critical_incident',
      code: 'comparator_interval_substitute_rejected',
      predictionId: COMPARATOR_ID,
    }))
  })

  it.each(['candidate', 'both'] as const)(
    'rejects the r4 %s abstain + [0,1] bypass before either role can be finalized',
    (mode) => {
      const fixture = makeScientificScoringFixture()
      fixture.predictions = fixture.predictions.map((row) => (
        mode === 'both' || row.id === CANDIDATE_ID
          ? { ...row, abstain: true, ci_lower: 0, ci_upper: 1 }
          : row
      ))

      expect(() => build(fixture)).toThrow(expect.objectContaining({
        name: 'ScientificScoringCriticalIncidentError',
        kind: 'critical_incident',
        code: 'abstain_interval_contract_violation',
        predictionId: CANDIDATE_ID,
      }))
    },
  )

  it('rejects the r4 comparator-only abstain + [0,1] bypass', () => {
    const fixture = makeScientificScoringFixture()
    fixture.predictions = fixture.predictions.map((row) => row.id === COMPARATOR_ID
      ? { ...row, abstain: true, ci_lower: 0, ci_upper: 1 }
      : row)

    expect(() => build(fixture)).toThrow(expect.objectContaining({
      code: 'abstain_interval_contract_violation',
      predictionId: COMPARATOR_ID,
    }))
  })

  it.each([
    ['probability', { p_rise: 0.5, ci_lower: null, ci_upper: null }],
    ['lower bound', { p_rise: null, ci_lower: 0, ci_upper: null }],
    ['upper bound', { p_rise: null, ci_lower: null, ci_upper: 1 }],
  ] as const)('rejects an abstain with only a non-sentinel %s', (_name, interval) => {
    const fixture = makeScientificScoringFixture()
    fixture.predictions = fixture.predictions.map((row) => row.id === CANDIDATE_ID
      ? { ...row, abstain: true, ...interval }
      : row)

    expect(() => build(fixture)).toThrow(expect.objectContaining({
      code: 'abstain_interval_contract_violation',
      predictionId: CANDIDATE_ID,
    }))
  })

  it('finalizes the exact all-null abstain sentinel without counting it as envelope eligible or complete', () => {
    const fixture = makeScientificScoringFixture()
    fixture.predictions = fixture.predictions.map((row) => ({
      ...row,
      abstain: true,
      p_rise: null,
      ci_lower: null,
      ci_upper: null,
    }))

    const plan = build(fixture)

    expect(plan.finalizations).toHaveLength(2)
    expect(plan.intervalEligibleCount).toBe(0)
    expect(plan.intervalCompleteCount).toBe(0)
  })

  it('keeps a sentinel abstain out of both interval counts while counting the verified peer', () => {
    const fixture = makeScientificScoringFixture()
    fixture.predictions = fixture.predictions.map((row) => row.id === CANDIDATE_ID
      ? { ...row, abstain: true, p_rise: null, ci_lower: null, ci_upper: null }
      : row)

    const plan = build(fixture)

    expect(plan.finalizations).toHaveLength(2)
    expect(plan.intervalEligibleCount).toBe(1)
    expect(plan.intervalCompleteCount).toBe(1)
  })

  it('requires exact frozen-500 metadata before label finalization', () => {
    expect(build().intervalEvidence).toEqual({
      ensembleVersion: 'interval-ensemble-v2',
      envelopeVersion: 'block_bootstrap_envelope_v1',
      replicateCount: 500,
      ensembleSha256: INTERVAL_SHA,
    })
  })

  it.each([
    ['missing bound', { ci_lower: null }],
    ['lower above p', { ci_lower: 0.8 }],
    ['p above upper', { ci_upper: 0.6 }],
    ['out-of-range bound', { ci_lower: -0.1 }],
  ] as const)('rejects %s for a non-abstain prediction', (_name, change) => {
    const fixture = makeScientificScoringFixture()
    fixture.predictions = fixture.predictions.map((row) => row.id === CANDIDATE_ID
      ? { ...row, ...change }
      : row)
    expect(() => build(fixture)).toThrow(/interval/i)
  })

  it.each([
    ['interval ensemble', { interval_ensemble_artifact: { replicate_bodies: [] } }, 'model_manifest_content_sha256_mismatch'],
    ['candidate model', { candidate_model_artifact_json: '{}' }, 'model_manifest_content_sha256_mismatch'],
  ] as const)('rejects %s payload bytes under the attested manifest SHA', (_name, change, code) => {
    const fixture = makeScientificScoringFixture()
    fixture.evidenceArtifacts = fixture.evidenceArtifacts.map((artifact) => artifact.id === MODEL_ARTIFACT_ID
      ? { ...artifact, payload: { ...artifact.payload, ...change } }
      : artifact)

    expect(() => build(fixture)).toThrow(expect.objectContaining({ code }))
  })

  it.each([
    ['interval ensemble', { interval_ensemble_artifact: { replicate_bodies: [] } }, 'interval_ensemble_sha256_mismatch'],
    ['candidate model', { candidate_model_artifact_json: '{}' }, 'candidate_model_artifact_sha256_mismatch'],
  ] as const)('rejects %s bytes even when the outer manifest is re-attested', (_name, change, code) => {
    const fixture = makeScientificScoringFixture()
    const modelArtifact = fixture.evidenceArtifacts.find((artifact) => artifact.id === MODEL_ARTIFACT_ID)
    if (modelArtifact === undefined) throw new Error('model artifact fixture is missing')
    const payload = { ...modelArtifact.payload, ...change }
    const contentSha256 = canonicalJsonV1Sha256(payload)
    fixture.evidenceArtifacts = fixture.evidenceArtifacts.map((artifact) => artifact.id === MODEL_ARTIFACT_ID
      ? { ...artifact, payload, content_sha256: contentSha256 }
      : artifact)
    fixture.evidenceAttestations = fixture.evidenceAttestations.map((attestation) => (
      attestation.artifact_id === MODEL_ARTIFACT_ID ? { ...attestation, content_sha256: contentSha256 } : attestation
    ))

    expect(() => build(fixture)).toThrow(expect.objectContaining({ code }))
  })

  it('rejects a candidate point that does not replay from the frozen full-fit model', () => {
    const fixture = makeScientificScoringFixture()
    fixture.predictions = fixture.predictions.map((row) => row.id === CANDIDATE_ID
      ? { ...row, p_rise: 0.5, ci_lower: 0.5 }
      : row)

    expect(() => build(fixture)).toThrow(expect.objectContaining({ code: 'candidate_point_replay_mismatch' }))
  })

  it('rejects self-hashed feature provenance that does not match the frozen forecast', () => {
    const fixture = makeScientificScoringFixture()
    fixture.predictions = fixture.predictions.map((row) => {
      if (row.id !== CANDIDATE_ID && row.id !== COMPARATOR_ID) return row
      const currentProvenance = row.features.provenance
      if (typeof currentProvenance !== 'object' || currentProvenance === null) {
        throw new Error('feature provenance fixture is missing')
      }
      const provenance = { ...currentProvenance, cutoffAt: '2030-01-01T00:00:00.000Z' }
      const features = { ...row.features, provenance }
      return { ...row, features, feature_snapshot_hash: canonicalJsonV1Sha256(features) }
    })

    expect(() => build(fixture)).toThrow(expect.objectContaining({ code: 'feature_snapshot_provenance_mismatch' }))
  })

  it('rejects mismatched feature provenance even when both roles abstain', () => {
    const fixture = makeScientificScoringFixture()
    fixture.predictions = fixture.predictions.map((row) => {
      const currentProvenance = row.features.provenance
      if (typeof currentProvenance !== 'object' || currentProvenance === null) {
        throw new Error('feature provenance fixture is missing')
      }
      const features = {
        ...row.features,
        provenance: { ...currentProvenance, themeId: '00000000-0000-4000-8000-000000000099' },
      }
      return {
        ...row,
        abstain: true,
        p_rise: null,
        ci_lower: null,
        ci_upper: null,
        features,
        feature_snapshot_hash: canonicalJsonV1Sha256(features),
      }
    })

    expect(() => build(fixture)).toThrow(expect.objectContaining({ code: 'feature_snapshot_provenance_mismatch' }))
  })

  it('rejects changed ensemble identity and post-outcome timestamps', () => {
    const badCount = makeScientificScoringFixture()
    badCount.evidenceArtifacts = badCount.evidenceArtifacts.map((artifact) => artifact.id === MODEL_ARTIFACT_ID
      ? { ...artifact, payload: { ...artifact.payload, interval_replicate_count: 499 } }
      : artifact)
    expect(() => build(badCount)).toThrow()

    const badHash = makeScientificScoringFixture()
    badHash.evidenceArtifacts = badHash.evidenceArtifacts.map((artifact) => artifact.id === MODEL_ARTIFACT_ID
      ? { ...artifact, payload: { ...artifact.payload, candidate_model_sha256: '9'.repeat(64) } }
      : artifact)
    expect(() => build(badHash)).toThrow()

    const late = makeScientificScoringFixture()
    late.predictions = late.predictions.map((row) => row.id === CANDIDATE_ID
      ? { ...row, created_at: '2026-07-13T09:00:01.000Z' }
      : row)
    expect(() => build(late)).toThrow(/finalization/i)
  })

  it('rejects provenance attested only after prediction insertion', () => {
    const fixture = makeScientificScoringFixture()
    fixture.evidenceAttestations = fixture.evidenceAttestations.map((attestation) => (
      attestation.artifact_id === '90000000-0000-4000-8000-000000000001'
        ? { ...attestation, verified_at: '2026-07-06T09:01:01.000Z' }
        : attestation
    ))

    expect(() => build(fixture)).toThrow(/prediction insert/i)
  })

  it('keeps exact role and contract hashes attached to both finalizations', () => {
    const fixture = makeScientificScoringFixture()
    expect(fixture.predictions.find((row) => row.id === CANDIDATE_ID)).toMatchObject({
      model_artifact_sha256: CANDIDATE_SHA,
      feature_contract_hash: FEATURE_CONTRACT_SHA,
      theme_id: THEME_ID,
    })
    expect(build(fixture).finalizations).toHaveLength(2)
  })
})
