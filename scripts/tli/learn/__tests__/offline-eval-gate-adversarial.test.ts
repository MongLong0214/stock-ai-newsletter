import { describe, expect, it } from 'vitest'
import { computeStudyOriginScheduleSha256 } from '../offline-eval-study-lock'
import {
  buildOuterArtifacts,
  buildProspectiveArtifact,
  originSchedule,
  scientificBaselineGateInputSchema,
  STUDY_ID,
  STUDY_SHA256,
  validInput,
  walkForwardSplitSha256,
  weeklyOrigin,
} from './offline-eval-gate-fixture'

describe('TLI v3 scientific baseline adversarial gate input', () => {
  it('rejects rewritten origin dates or cutoffs under the external study lock', () => {
    const rewrittenOrigins = Array.from({ length: 26 }, (_unused, index) => weeklyOrigin(index + 52))
    const rewrittenSchedule = rewrittenOrigins.map((originDate) => ({
      originDate,
      forecastCutoff: `${originDate}T09:00:00.000Z`,
    }))
    const rewrittenOuterArtifacts = buildOuterArtifacts(rewrittenOrigins, 13)

    expect(scientificBaselineGateInputSchema.safeParse({
      ...validInput,
      studyOriginSchedule: rewrittenSchedule,
      studyOrigins: rewrittenOrigins,
      studyOriginScheduleSha256: computeStudyOriginScheduleSha256({
        studyContractId: STUDY_ID,
        studyContractSha256: STUDY_SHA256,
        studyOriginSchedule: rewrittenSchedule,
      }),
      walkForwardSplitSha256: walkForwardSplitSha256(rewrittenOrigins, rewrittenOuterArtifacts),
      primaryArtifacts: [...rewrittenOuterArtifacts, buildProspectiveArtifact(rewrittenOrigins)],
    }).success).toBe(false)

    const rewrittenCutoffSchedule = originSchedule.map((origin, index) => (
      index === 13 ? { ...origin, forecastCutoff: `${origin.originDate}T08:00:00.000Z` } : origin
    ))
    expect(scientificBaselineGateInputSchema.safeParse({
      ...validInput,
      studyOriginSchedule: rewrittenCutoffSchedule,
      studyOriginScheduleSha256: computeStudyOriginScheduleSha256({
        studyContractId: STUDY_ID,
        studyContractSha256: STUDY_SHA256,
        studyOriginSchedule: rewrittenCutoffSchedule,
      }),
    }).success).toBe(false)
  })

  it('rejects unbounded fold inputs without throwing or count-sized allocation', () => {
    const parse = () => scientificBaselineGateInputSchema.safeParse({
      ...validInput,
      primaryArtifacts: validInput.primaryArtifacts.map((envelope, index) => (
        index === 0 ? { ...envelope, foldId: `outer-${'9'.repeat(400)}` } : envelope
      )),
    })

    expect(parse).not.toThrow()
    expect(parse().success).toBe(false)
    expect(() => scientificBaselineGateInputSchema.safeParse({
      ...validInput,
      outerFoldCount: 4_294_967_295,
    })).not.toThrow()
  })
})
