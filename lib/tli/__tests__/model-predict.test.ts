import { readFileSync } from 'node:fs'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { describe, expect, it } from 'vitest'
import { CONFIRMATORY_FEATURE_NAMES } from '@/lib/tli/features/confirmatory-feature-types'
import { applyPriorCorrection } from '@/lib/tli/model/prior-correction'
import {
  loadM1ArtifactFromJsonFile,
  parseM1ModelArtifact,
  predictM1T1Probability,
  UnsupportedLegacyArtifactError,
} from '@/lib/tli/model/predict'
import type { LegacyM1ModelArtifactV1, M1ModelArtifactV2 } from '@/lib/tli/model/m1'

const GOLDEN_VECTOR_FIXTURE_PATH = join(__dirname, 'fixtures', 'm1-golden-vector.json')

const goldenVectorFixtureSchema = z.object({
  fixture_version: z.literal('tli-m1-golden-vector-v2'),
  artifact: z.unknown(),
  inputRow: z.object({
    values: z.array(z.number()),
    missingFlags: z.array(z.boolean()),
  }),
  expectedProbability: z.number(),
})

const loadGoldenVectorFixture = () => goldenVectorFixtureSchema.parse(
  JSON.parse(readFileSync(GOLDEN_VECTOR_FIXTURE_PATH, 'utf8')),
)

const makeLegacyArtifact = (): LegacyM1ModelArtifactV1 => {
  const artifact = parseM1ModelArtifact(loadGoldenVectorFixture().artifact)
  return {
    ...artifact,
    artifact_version: 'tli-model-artifact-v1',
  }
}

const makeSemanticsArtifact = (): M1ModelArtifactV2 => {
  const artifact = parseM1ModelArtifact(loadGoldenVectorFixture().artifact)
  const continuousWeights = CONFIRMATORY_FEATURE_NAMES.map((_, index) => {
    if (index === 0) return 0.5
    if (index === 1) return 0.25
    return 0
  })
  const missingWeights = CONFIRMATORY_FEATURE_NAMES.map((_, index) => (index === 2 ? 0.4 : 0))
  return {
    ...artifact,
    scaler: {
      median: [10, ...CONFIRMATORY_FEATURE_NAMES.slice(1).map(() => 0)],
      mad: [2, 0, ...CONFIRMATORY_FEATURE_NAMES.slice(2).map(() => 1)],
    },
    coefficients: {
      intercept: -0.3,
      weights: [...continuousWeights, ...missingWeights],
    },
    calibrator: { type: 'platt', a: -1.1, b: 0.2 },
  }
}

describe('M1 v2 artifact boundary and prediction parity', () => {
  it('parses the complete Python v2 artifact contract', () => {
    const artifact = parseM1ModelArtifact(loadGoldenVectorFixture().artifact)

    expect(artifact.artifact_version).toBe('tli-model-artifact-v2')
    expect(artifact.feature_schema).toEqual(CONFIRMATORY_FEATURE_NAMES)
    expect(artifact.estimator_contract.solver).toBe('lbfgs')
    expect(artifact.calibration_contract.source).toBe('time_blocked_cross_fitted_oof_margin')
    expect(artifact.inner_oof.fold_count).toBe(8)
    expect(artifact.runtime.python_version).toBe('3.13.11')
  })

  it('matches the pinned Python-generated golden probability within 1e-9', () => {
    const fixture = loadGoldenVectorFixture()
    const artifact = parseM1ModelArtifact(fixture.artifact)

    const probability = predictM1T1Probability({ artifact, row: fixture.inputRow })

    expect(artifact.train_event_rate).toBe(artifact.sample_report.event_rate)
    expect(probability).toBeCloseTo(fixture.expectedProbability, 9)
  })

  it('applies prior correction without changing the Python golden model output', () => {
    const fixture = loadGoldenVectorFixture()
    const artifact = parseM1ModelArtifact(fixture.artifact)
    const uncorrected = predictM1T1Probability({ artifact, row: fixture.inputRow })
    if (uncorrected === null) throw new TypeError('golden vector must be scoreable')

    const corrected = applyPriorCorrection(uncorrected, artifact.train_event_rate, 0.25)

    expect(uncorrected).toBeCloseTo(fixture.expectedProbability, 9)
    expect(corrected).toBeLessThan(uncorrected)
  })

  it('matches Python raw-MAD, zero-MAD, missing-flag, and Platt semantics', () => {
    const artifact = makeSemanticsArtifact()

    const probability = predictM1T1Probability({
      artifact,
      row: {
        values: [14, 3, 999, ...CONFIRMATORY_FEATURE_NAMES.slice(3).map(() => 0)],
        missingFlags: [false, false, true, ...CONFIRMATORY_FEATURE_NAMES.slice(3).map(() => false)],
      },
    })

    expect(probability).toBeCloseTo(0.8623562923985038, 12)
  })

  it('clips Platt probabilities to the Python contract interval', () => {
    const base = makeSemanticsArtifact()
    const artifact: M1ModelArtifactV2 = {
      ...base,
      coefficients: { intercept: 1e6, weights: base.coefficients.weights.map(() => 0) },
      calibrator: { type: 'platt', a: -1, b: 0 },
    }

    const probability = predictM1T1Probability({
      artifact,
      row: {
        values: CONFIRMATORY_FEATURE_NAMES.map(() => 0),
        missingFlags: CONFIRMATORY_FEATURE_NAMES.map(() => false),
      },
    })

    expect(probability).toBe(0.999999)
  })

  it('fails closed with the exact typed error before parsing a v1 artifact', () => {
    let caught: unknown

    try {
      parseM1ModelArtifact(makeLegacyArtifact())
    } catch (error) {
      if (!(error instanceof UnsupportedLegacyArtifactError)) throw error
      caught = error
    }

    expect(caught).toBeInstanceOf(UnsupportedLegacyArtifactError)
    if (!(caught instanceof UnsupportedLegacyArtifactError)) throw new TypeError('typed legacy error required')
    expect(caught.name).toBe('unsupported_legacy_artifact')
    expect(caught.code).toBe('unsupported_legacy_artifact')
    expect(caught.message).toBe('unsupported_legacy_artifact')
  })

  it('fails closed on v1 inference even when the row abstains', () => {
    const artifact = makeLegacyArtifact()

    expect(() => predictM1T1Probability({
      artifact,
      row: { values: [], missingFlags: [], abstain: true },
    })).toThrowError(UnsupportedLegacyArtifactError)
  })

  it('parses artifact JSON at the file boundary before inference', async () => {
    const fixture = loadGoldenVectorFixture()
    const dir = await mkdtemp(join(tmpdir(), 'tli-m1-artifact-'))
    const path = join(dir, 'artifact.json')
    await writeFile(path, JSON.stringify(fixture.artifact), 'utf8')

    const artifact = await loadM1ArtifactFromJsonFile(path)

    expect(artifact.feature_schema).toEqual(CONFIRMATORY_FEATURE_NAMES)
    expect(predictM1T1Probability({ artifact, row: fixture.inputRow })).toBeCloseTo(
      fixture.expectedProbability,
      9,
    )
  })

  it('rejects malformed v2 feature contracts', () => {
    const fixture = loadGoldenVectorFixture()

    expect(() => parseM1ModelArtifact({
      ...parseM1ModelArtifact(fixture.artifact),
      feature_schema: [...CONFIRMATORY_FEATURE_NAMES].reverse(),
    })).toThrow(/feature schema mismatch/i)
  })
})
