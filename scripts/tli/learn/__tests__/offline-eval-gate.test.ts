import { describe, expect, it } from 'vitest'
import { canonicalJsonV1Sha256 } from '../../../../lib/tli/canonical-json-v1'
import { computeSplitOriginsSha256 } from '../../../../lib/tli/eval/walk-forward'
import { computeStudyOriginScheduleSha256 } from '../offline-eval-study-lock'
import {
  computePrimaryTrainFitSha256,
  createScientificBaselineGateInputSchema,
} from '../offline-eval-baseline-gate'
import {
  bindArtifactToSplit,
  buildOuterArtifacts,
  buildProspectiveArtifact,
  origins,
  outerArtifacts,
  persistenceArtifact,
  prospectiveArtifact,
  scientificBaselineGateInputSchema,
  STUDY_ID,
  STUDY_SHA256,
  validInput,
  walkForwardSplitSha256,
  weeklyOrigin,
} from './offline-eval-gate-fixture'

describe('TLI v3 scientific baseline gate input', () => {
  it('rejects a self-consistent fold recast outside the authoritative study schedule', () => {
    const testOrigin = weeklyOrigin(26)
    const splitOriginsSha256 = computeSplitOriginsSha256({
      kind: 'outer-fold-split-v1',
      sequence: 1,
      testOrigin,
      trainOrigins: origins,
    })
    const recastOuterFold = {
      ...outerArtifacts[0],
      testOrigin,
      trainOrigins: origins,
      splitOriginsSha256,
      artifact: prospectiveArtifact.artifact,
      ...bindArtifactToSplit({
        splitOriginsSha256,
        trainOrigins: origins,
        artifact: prospectiveArtifact.artifact,
      }),
    }

    expect(scientificBaselineGateInputSchema.safeParse({
      ...validInput,
      primaryArtifacts: [recastOuterFold, ...outerArtifacts.slice(1), prospectiveArtifact],
    }).success).toBe(false)
  })

  it('rejects a fixed initial train block reused across scheduled outer folds', () => {
    const fixedTrainOrigins = origins.slice(0, 13)
    const fixedArtifact = outerArtifacts[0].artifact
    const repeatedTrainArtifacts = outerArtifacts.map((envelope, index) => {
      const sequence = index + 1
      const splitOriginsSha256 = computeSplitOriginsSha256({
        kind: 'outer-fold-split-v1',
        sequence,
        testOrigin: envelope.testOrigin,
        trainOrigins: fixedTrainOrigins,
      })
      return {
        ...envelope,
        trainOrigins: fixedTrainOrigins,
        splitOriginsSha256,
        artifact: fixedArtifact,
        ...bindArtifactToSplit({ splitOriginsSha256, trainOrigins: fixedTrainOrigins, artifact: fixedArtifact }),
      }
    })

    expect(scientificBaselineGateInputSchema.safeParse({
      ...validInput,
      walkForwardSplitSha256: walkForwardSplitSha256(origins, repeatedTrainArtifacts),
      primaryArtifacts: [...repeatedTrainArtifacts, prospectiveArtifact],
    }).success).toBe(false)
  })

  it('rejects a primary artifact reused across expanding train splits', () => {
    expect(scientificBaselineGateInputSchema.safeParse({
      ...validInput,
      primaryArtifacts: validInput.primaryArtifacts.map((envelope, index) => (
        index === 0 ? { ...envelope, artifact: prospectiveArtifact.artifact } : envelope
      )),
    }).success).toBe(false)

    const emptyStratum = (stratum: 'rising' | 'cooling' | 'other' | 'missing') => ({
      stratum,
      trainRowCount: 0,
      trainPositiveCount: 0,
      probability: 0.5,
      usedGlobalFallback: true,
    })
    const zeroArtifactBody = {
      baselineId: 'babl-strata-v1' as const,
      role: 'primary' as const,
      studyContractId: STUDY_ID,
      studyContractSha256: STUDY_SHA256,
      trainRowCount: 0,
      trainPositiveCount: 0,
      globalFallbackProbability: 0.5,
      strata: {
        rising: emptyStratum('rising'),
        cooling: emptyStratum('cooling'),
        other: emptyStratum('other'),
        missing: emptyStratum('missing'),
      },
    }
    const zeroArtifact = {
      ...zeroArtifactBody,
      artifactSha256: canonicalJsonV1Sha256(zeroArtifactBody),
    }
    const zeroBinding = bindArtifactToSplit({
      splitOriginsSha256: prospectiveArtifact.splitOriginsSha256,
      trainOrigins: prospectiveArtifact.trainOrigins,
      artifact: zeroArtifact,
    })
    expect(scientificBaselineGateInputSchema.safeParse({
      ...validInput,
      primaryArtifacts: [
        ...outerArtifacts,
        { ...prospectiveArtifact, artifact: zeroArtifact, ...zeroBinding },
      ],
    }).success).toBe(false)

    const zeroTrainOriginRowCounts = Object.fromEntries(origins.map((origin) => [origin, 0]))
    const zeroSplitOriginsSha256 = computeSplitOriginsSha256({
      kind: 'prospective-baseline-fit-v1',
      studyContractId: STUDY_ID,
      studyContractSha256: STUDY_SHA256,
      trainOrigins: [],
    })
    expect(scientificBaselineGateInputSchema.safeParse({
      ...validInput,
      primaryArtifacts: [
        ...outerArtifacts,
        {
          ...prospectiveArtifact,
          splitOriginsSha256: zeroSplitOriginsSha256,
          trainOriginRowCounts: zeroTrainOriginRowCounts,
          trainFitSha256: computePrimaryTrainFitSha256({
            splitOriginsSha256: zeroSplitOriginsSha256,
            trainOrigins: origins,
            trainOriginRowCounts: zeroTrainOriginRowCounts,
            artifactSha256: zeroArtifact.artifactSha256,
          }),
          artifact: zeroArtifact,
        },
      ],
    }).success).toBe(false)
  })

  it('rejects secondary and mixed-study gate inputs', () => {
    expect(scientificBaselineGateInputSchema.safeParse(validInput).success).toBe(true)
    expect(scientificBaselineGateInputSchema.safeParse({
      ...validInput,
      primaryArtifacts: validInput.primaryArtifacts.map((envelope, index) => (
        index === 0
          ? { ...envelope, artifact: { ...persistenceArtifact } }
          : envelope
      )),
    }).success).toBe(false)
    expect(scientificBaselineGateInputSchema.safeParse({
      ...validInput,
      primaryArtifacts: validInput.primaryArtifacts.map((envelope, index) => (
        index === 0
          ? { ...envelope, artifact: { ...envelope.artifact, studyContractId: 'study-other' } }
          : envelope
      )),
    }).success).toBe(false)
    expect(scientificBaselineGateInputSchema.safeParse({
      ...validInput,
      secondaryDiagnostics: [{ baselineId: 'climatology-v1', role: 'secondary_diagnostic' }],
    }).success).toBe(false)
  })

  it('rejects incomplete, duplicated, split-tampered, and relabeled-hash artifact sets', () => {
    expect(scientificBaselineGateInputSchema.safeParse({
      ...validInput,
      primaryArtifacts: [outerArtifacts[0]],
    }).success).toBe(false)
    expect(scientificBaselineGateInputSchema.safeParse({
      ...validInput,
      primaryArtifacts: [outerArtifacts[0], outerArtifacts[0], ...outerArtifacts.slice(2), prospectiveArtifact],
    }).success).toBe(false)
    expect(scientificBaselineGateInputSchema.safeParse({
      ...validInput,
      primaryArtifacts: validInput.primaryArtifacts.map((envelope, index) => (
        index === 0 ? { ...envelope, splitOriginsSha256: 'b'.repeat(64) } : envelope
      )),
    }).success).toBe(false)
    expect(scientificBaselineGateInputSchema.safeParse({
      ...validInput,
      primaryArtifacts: validInput.primaryArtifacts.map((envelope, index) => (
        index === 0
          ? { ...envelope, artifact: { ...envelope.artifact, artifactSha256: persistenceArtifact.artifactSha256 } }
          : envelope
      )),
    }).success).toBe(false)
  })

  it('accepts the walk-forward fold ID emitted after outer-99', () => {
    const extendedOrigins = Array.from({ length: 113 }, (_unused, index) => weeklyOrigin(index))
    const extendedSchedule = extendedOrigins.map((originDate) => ({
      originDate,
      forecastCutoff: `${originDate}T09:00:00.000Z`,
    }))
    const extendedOuterArtifacts = buildOuterArtifacts(extendedOrigins, 100)

    const extendedScheduleSha256 = computeStudyOriginScheduleSha256({
      studyContractId: STUDY_ID,
      studyContractSha256: STUDY_SHA256,
      studyOriginSchedule: extendedSchedule,
    })
    const extendedSchema = createScientificBaselineGateInputSchema({
      studyContractId: STUDY_ID,
      studyContractSha256: STUDY_SHA256,
      studyOriginScheduleSha256: extendedScheduleSha256,
    })

    expect(extendedSchema.safeParse({
      ...validInput,
      studyOriginSchedule: extendedSchedule,
      studyOrigins: extendedOrigins,
      studyOriginScheduleSha256: extendedScheduleSha256,
      walkForwardSplitSha256: walkForwardSplitSha256(extendedOrigins, extendedOuterArtifacts),
      outerFoldCount: extendedOuterArtifacts.length,
      primaryArtifacts: [
        ...extendedOuterArtifacts,
        buildProspectiveArtifact(extendedOrigins),
      ],
    }).success).toBe(true)
  })
})
