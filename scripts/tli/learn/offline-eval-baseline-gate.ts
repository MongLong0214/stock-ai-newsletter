import { canonicalJsonV1Sha256 } from '../../../lib/tli/canonical-json-v1'
import {
  computeSplitOriginsSha256,
  INITIAL_TRAIN_ORIGIN_COUNT,
  MIN_CLEAN_ORIGIN_COUNT,
  MIN_OOS_TEST_ORIGIN_COUNT,
} from '../../../lib/tli/eval/walk-forward'
import { z } from 'zod'
import type { ScientificBaselineEvaluation } from './offline-eval-baselines'
import { isoDateSchema, primaryArtifactSchema, sha256Schema } from './offline-eval-baseline-artifact-schema'
import { computeStudyOriginScheduleSha256, type ScientificBaselineStudyLock } from './offline-eval-study-lock'

interface PrimaryTrainFitBindingInput {
  readonly splitOriginsSha256: string
  readonly trainOrigins: readonly string[]
  readonly trainOriginRowCounts: Readonly<Record<string, number>>
  readonly artifactSha256: string
}

const foldSequence = (foldId: string): number => {
  const sequence = Number(foldId.slice('outer-'.length))
  return Number.isSafeInteger(sequence) && sequence >= 1 ? sequence : 0
}

export const computePrimaryTrainFitSha256 = (input: PrimaryTrainFitBindingInput): string => (
  canonicalJsonV1Sha256({ kind: 'scientific-primary-train-fit-v1', ...input })
)

const artifactEnvelopeSchema = z.object({
  splitOriginsSha256: sha256Schema,
  trainOrigins: z.array(isoDateSchema).min(1),
  trainOriginRowCounts: z.record(isoDateSchema, z.number().int().nonnegative()),
  trainFitSha256: sha256Schema,
  artifact: primaryArtifactSchema,
})

const studyOriginSchema = z.object({ originDate: isoDateSchema,
  forecastCutoff: z.string().refine((value) => Number.isFinite(Date.parse(value)), 'invalid forecast cutoff'),
}).strict()

const primaryArtifactEnvelopeSchema = z.discriminatedUnion('scope', [
  artifactEnvelopeSchema.extend({
    scope: z.literal('outer_fold'),
    foldId: z.string().regex(/^outer-\d{2,15}$/).refine((value) => foldSequence(value) > 0),
    testOrigin: isoDateSchema,
  }).strict(),
  artifactEnvelopeSchema.extend({
    scope: z.literal('prospective_cycle'),
    foldId: z.null(),
    testOrigin: z.null(),
  }).strict(),
])

const scientificBaselineGatePayloadSchema = z.object({
  studyContractId: z.string().min(1),
  studyContractSha256: sha256Schema,
  studyOriginSchedule: z.array(studyOriginSchema).min(MIN_CLEAN_ORIGIN_COUNT),
  studyOrigins: z.array(isoDateSchema).min(MIN_CLEAN_ORIGIN_COUNT),
  studyOriginScheduleSha256: sha256Schema,
  walkForwardSplitSha256: sha256Schema,
  outerFoldCount: z.number().int().min(MIN_OOS_TEST_ORIGIN_COUNT),
  primaryArtifacts: z.array(primaryArtifactEnvelopeSchema).min(MIN_OOS_TEST_ORIGIN_COUNT + 1),
}).strict().superRefine((input, context) => {
  const outerFolds = input.primaryArtifacts.filter((artifact) => artifact.scope === 'outer_fold')
  const prospective = input.primaryArtifacts.filter((artifact) => artifact.scope === 'prospective_cycle')
  const scheduledOriginDates = input.studyOriginSchedule.map((origin) => origin.originDate)
  const sortedStudyOrigins = [...input.studyOrigins].sort()
  if (
    new Set(input.studyOrigins).size !== input.studyOrigins.length
    || sortedStudyOrigins.some((origin, index) => origin !== input.studyOrigins[index])
  ) {
    context.addIssue({ code: 'custom', path: ['studyOrigins'], message: 'study origins must be sorted and unique' })
  }
  if (scheduledOriginDates.length !== input.studyOrigins.length
    || scheduledOriginDates.some((origin, index) => origin !== input.studyOrigins[index])
  ) {
    context.addIssue({ code: 'custom', path: ['studyOriginSchedule'], message: 'study origin schedule must exactly match study origins' })
  }
  const expectedScheduleSha256 = computeStudyOriginScheduleSha256(input)
  if (input.studyOriginScheduleSha256 !== expectedScheduleSha256) {
    context.addIssue({ code: 'custom', path: ['studyOriginScheduleSha256'], message: 'study origin schedule hash mismatch' })
  }
  if (input.outerFoldCount !== input.studyOrigins.length - INITIAL_TRAIN_ORIGIN_COUNT) {
    context.addIssue({ code: 'custom', path: ['outerFoldCount'], message: 'outer fold count does not match study schedule' })
  }
  if (outerFolds.length !== input.outerFoldCount) {
    context.addIssue({ code: 'custom', path: ['primaryArtifacts'], message: 'outer fold count mismatch' })
  }
  if (prospective.length !== 1) {
    context.addIssue({ code: 'custom', path: ['primaryArtifacts'], message: 'exactly one prospective artifact is required' })
  }

  const expectedFoldIds = new Set(input.studyOrigins.slice(INITIAL_TRAIN_ORIGIN_COUNT)
    .map((_origin, index) => `outer-${(index + 1).toString().padStart(2, '0')}`))
  const actualFoldIds = new Set(outerFolds.map((artifact) => artifact.foldId))
  if (actualFoldIds.size !== outerFolds.length || [...expectedFoldIds].some((foldId) => !actualFoldIds.has(foldId))) {
    context.addIssue({ code: 'custom', path: ['primaryArtifacts'], message: 'outer fold IDs must be complete and unique' })
  }

  input.primaryArtifacts.forEach((envelope, index) => {
    const { artifactSha256, ...artifactBody } = envelope.artifact
    if (canonicalJsonV1Sha256(artifactBody) !== artifactSha256) {
      context.addIssue({ code: 'custom', path: ['primaryArtifacts', index, 'artifact'], message: 'artifact hash mismatch' })
    }
    if (
      envelope.artifact.studyContractId !== input.studyContractId
      || envelope.artifact.studyContractSha256 !== input.studyContractSha256
    ) {
      context.addIssue({
        code: 'custom',
        path: ['primaryArtifacts', index, 'artifact'],
        message: 'mixed-study primary baseline artifacts are forbidden',
      })
    }
    if (new Set(envelope.trainOrigins).size !== envelope.trainOrigins.length) {
      context.addIssue({ code: 'custom', path: ['primaryArtifacts', index, 'trainOrigins'], message: 'duplicate train origin' })
    }
    const sortedTrainOrigins = [...envelope.trainOrigins].sort()
    if (sortedTrainOrigins.some((origin, originIndex) => origin !== envelope.trainOrigins[originIndex])) {
      context.addIssue({ code: 'custom', path: ['primaryArtifacts', index, 'trainOrigins'], message: 'train origins must be sorted' })
    }
    const countOrigins = Object.keys(envelope.trainOriginRowCounts).sort()
    if (
      countOrigins.length !== envelope.trainOrigins.length
      || countOrigins.some((origin, originIndex) => origin !== envelope.trainOrigins[originIndex])
    ) {
      context.addIssue({ code: 'custom', path: ['primaryArtifacts', index, 'trainOriginRowCounts'], message: 'row-count origins must exactly match train origins' })
    }
    const declaredTrainRowCount = Object.values(envelope.trainOriginRowCounts).reduce((sum, count) => sum + count, 0)
    if (declaredTrainRowCount !== envelope.artifact.trainRowCount) {
      context.addIssue({ code: 'custom', path: ['primaryArtifacts', index, 'trainOriginRowCounts'], message: 'row counts do not match fitted artifact' })
    }
    const expectedTrainFitSha256 = computePrimaryTrainFitSha256({
      splitOriginsSha256: envelope.splitOriginsSha256,
      trainOrigins: envelope.trainOrigins,
      trainOriginRowCounts: envelope.trainOriginRowCounts,
      artifactSha256: envelope.artifact.artifactSha256,
    })
    if (envelope.trainFitSha256 !== expectedTrainFitSha256) {
      context.addIssue({ code: 'custom', path: ['primaryArtifacts', index, 'trainFitSha256'], message: 'primary artifact is not bound to its train split' })
    }
    const fittedTrainOrigins = envelope.trainOrigins.filter((origin) => envelope.trainOriginRowCounts[origin] > 0)
    if (envelope.artifact.trainRowCount === 0 || fittedTrainOrigins.length === 0) {
      context.addIssue({ code: 'custom', path: ['primaryArtifacts', index, 'artifact'], message: 'primary baseline fit must contain training rows' })
    }

    if (envelope.scope === 'outer_fold') {
      const sequence = foldSequence(envelope.foldId)
      const expectedTestOrigin = input.studyOrigins[INITIAL_TRAIN_ORIGIN_COUNT + sequence - 1]
      const candidateTrainOrigins = input.studyOrigins.slice(0, INITIAL_TRAIN_ORIGIN_COUNT + sequence - 1)
      if (envelope.testOrigin !== expectedTestOrigin) {
        context.addIssue({ code: 'custom', path: ['primaryArtifacts', index, 'testOrigin'], message: 'test origin does not match study schedule' })
      }
      if (
        envelope.trainOrigins.length !== candidateTrainOrigins.length
        || envelope.trainOrigins.some((origin, originIndex) => origin !== candidateTrainOrigins[originIndex])
      ) {
        context.addIssue({ code: 'custom', path: ['primaryArtifacts', index, 'trainOrigins'], message: 'train origins do not match the authoritative expanding prefix' })
      }
      if (envelope.trainOrigins.some((origin) => origin >= envelope.testOrigin)) {
        context.addIssue({ code: 'custom', path: ['primaryArtifacts', index], message: 'outer train origin reaches test origin' })
      }
      const expectedSplitSha256 = computeSplitOriginsSha256({
        kind: 'outer-fold-split-v1',
        sequence,
        testOrigin: envelope.testOrigin,
        trainOrigins: fittedTrainOrigins,
      })
      if (envelope.splitOriginsSha256 !== expectedSplitSha256) {
        context.addIssue({ code: 'custom', path: ['primaryArtifacts', index], message: 'outer split hash mismatch' })
      }
    } else {
      const expectedSplitSha256 = computeSplitOriginsSha256({
        kind: 'prospective-baseline-fit-v1',
        studyContractId: input.studyContractId,
        studyContractSha256: input.studyContractSha256,
        trainOrigins: fittedTrainOrigins,
      })
      if (envelope.splitOriginsSha256 !== expectedSplitSha256) {
        context.addIssue({ code: 'custom', path: ['primaryArtifacts', index], message: 'prospective split hash mismatch' })
      }
      if (
        envelope.trainOrigins.length !== input.studyOrigins.length
        || envelope.trainOrigins.some((origin, originIndex) => origin !== input.studyOrigins[originIndex])
      ) {
        context.addIssue({ code: 'custom', path: ['primaryArtifacts', index, 'trainOrigins'], message: 'prospective train origins do not match the study schedule' })
      }
    }
  })

  const orderedOuterFolds = [...outerFolds].sort((left, right) => foldSequence(left.foldId) - foldSequence(right.foldId))
  const expectedWalkForwardSha256 = computeSplitOriginsSha256({
    kind: 'study-walk-forward-split-v1',
    originCount: input.studyOrigins.length,
    initialTrainOriginCount: INITIAL_TRAIN_ORIGIN_COUNT,
    folds: orderedOuterFolds.map((envelope) => ({
      sequence: foldSequence(envelope.foldId),
      testOrigin: envelope.testOrigin,
      trainOrigins: envelope.trainOrigins.filter((origin) => envelope.trainOriginRowCounts[origin] > 0),
    })),
  })
  if (input.walkForwardSplitSha256 !== expectedWalkForwardSha256) {
    context.addIssue({ code: 'custom', path: ['walkForwardSplitSha256'], message: 'walk-forward split manifest hash mismatch' })
  }
})

export type ScientificBaselineGateInput = z.infer<typeof scientificBaselineGatePayloadSchema>

export const createScientificBaselineGateInputSchema = (lock: ScientificBaselineStudyLock) => (
  scientificBaselineGatePayloadSchema.superRefine((input, context) => {
    if (
      input.studyContractId !== lock.studyContractId
      || input.studyContractSha256 !== lock.studyContractSha256
      || input.studyOriginScheduleSha256 !== lock.studyOriginScheduleSha256
    ) {
      context.addIssue({ code: 'custom', path: [], message: 'gate input does not match the externally frozen study lock' })
    }
  })
)

export function buildScientificBaselineGateInput(evaluation: ScientificBaselineEvaluation, lock: ScientificBaselineStudyLock): ScientificBaselineGateInput {
  const toEnvelope = (bundle: ScientificBaselineEvaluation['outerFolds'][number]) => ({
    scope: 'outer_fold' as const,
    foldId: bundle.foldId,
    testOrigin: bundle.testOrigin,
    splitOriginsSha256: bundle.splitOriginsSha256,
    trainOrigins: bundle.trainOrigins,
    trainOriginRowCounts: bundle.trainOriginRowCounts,
    trainFitSha256: computePrimaryTrainFitSha256({
      splitOriginsSha256: bundle.splitOriginsSha256,
      trainOrigins: bundle.trainOrigins,
      trainOriginRowCounts: bundle.trainOriginRowCounts,
      artifactSha256: bundle.primary.artifact.artifactSha256,
    }),
    artifact: bundle.primary.artifact,
  })
  return createScientificBaselineGateInputSchema(lock).parse({
    studyContractId: evaluation.studyContractId,
    studyContractSha256: evaluation.studyContractSha256,
    studyOriginSchedule: evaluation.studyOriginSchedule,
    studyOrigins: evaluation.studyOrigins,
    studyOriginScheduleSha256: evaluation.studyOriginScheduleSha256,
    walkForwardSplitSha256: evaluation.walkForwardSplitSha256,
    outerFoldCount: evaluation.outerFolds.length,
    primaryArtifacts: [
      ...evaluation.outerFolds.map(toEnvelope),
      {
        scope: 'prospective_cycle' as const,
        foldId: null,
        testOrigin: null,
        splitOriginsSha256: evaluation.prospectiveCycle.splitOriginsSha256,
        trainOrigins: evaluation.prospectiveCycle.trainOrigins,
        trainOriginRowCounts: evaluation.prospectiveCycle.trainOriginRowCounts,
        trainFitSha256: computePrimaryTrainFitSha256({
          splitOriginsSha256: evaluation.prospectiveCycle.splitOriginsSha256,
          trainOrigins: evaluation.prospectiveCycle.trainOrigins,
          trainOriginRowCounts: evaluation.prospectiveCycle.trainOriginRowCounts,
          artifactSha256: evaluation.prospectiveCycle.primary.artifact.artifactSha256,
        }),
        artifact: evaluation.prospectiveCycle.primary.artifact,
      },
    ],
  })
}
