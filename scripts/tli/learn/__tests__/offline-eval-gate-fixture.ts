import { computeSplitOriginsSha256 } from '../../../../lib/tli/eval/walk-forward'
import {
  fitBAblStrataBaseline,
  fitPersistenceBaseline,
  type ScientificBaselineTrainRow,
} from '../../../../lib/tli/model/baselines'
import {
  computePrimaryTrainFitSha256,
  createScientificBaselineGateInputSchema,
} from '../offline-eval-baseline-gate'
import { computeStudyOriginScheduleSha256 } from '../offline-eval-study-lock'

export const STUDY_ID = 'study-todo-10'
export const STUDY_SHA256 = 'a'.repeat(64)
export const weeklyOrigin = (index: number): string => (
  new Date(Date.UTC(2026, 0, 5 + index * 7)).toISOString().slice(0, 10)
)
export const origins = Array.from({ length: 26 }, (_unused, index) => weeklyOrigin(index))
export const originSchedule = origins.map((originDate) => ({
  originDate,
  forecastCutoff: `${originDate}T09:00:00.000Z`,
}))

const trainRowsForOrigins = (originDates: readonly string[]): ScientificBaselineTrainRow[] => originDates.flatMap((originDate) => ([
  {
    themeId: 'positive',
    originDate,
    studyContractId: STUDY_ID,
    studyContractSha256: STUDY_SHA256,
    bablPhase: 'rising',
    interestReturn10d: 1,
    y: true,
  },
  {
    themeId: 'negative',
    originDate,
    studyContractId: STUDY_ID,
    studyContractSha256: STUDY_SHA256,
    bablPhase: 'cooling',
    interestReturn10d: -1,
    y: false,
  },
]))

export const persistenceArtifact = fitPersistenceBaseline({ rows: trainRowsForOrigins(origins.slice(0, 13)) })
type PrimaryArtifact = ReturnType<typeof fitBAblStrataBaseline>

export const bindArtifactToSplit = (input: {
  readonly splitOriginsSha256: string
  readonly trainOrigins: readonly string[]
  readonly artifact: PrimaryArtifact
}) => {
  const trainOriginRowCounts = Object.fromEntries(input.trainOrigins.map((origin) => [origin, 2]))
  return {
    trainOriginRowCounts,
    trainFitSha256: computePrimaryTrainFitSha256({
      splitOriginsSha256: input.splitOriginsSha256,
      trainOrigins: input.trainOrigins,
      trainOriginRowCounts,
      artifactSha256: input.artifact.artifactSha256,
    }),
  }
}

export const buildOuterArtifacts = (originDates: readonly string[], count: number) => Array.from({ length: count }, (_unused, index) => {
  const sequence = index + 1
  const trainOrigins = originDates.slice(0, 13 + index)
  const testOrigin = originDates[13 + index]
  const artifact = fitBAblStrataBaseline({ rows: trainRowsForOrigins(trainOrigins) })
  const splitOriginsSha256 = computeSplitOriginsSha256({
    kind: 'outer-fold-split-v1', sequence, testOrigin, trainOrigins,
  })
  return {
    scope: 'outer_fold' as const,
    foldId: `outer-${sequence.toString().padStart(2, '0')}`,
    testOrigin,
    trainOrigins,
    splitOriginsSha256,
    artifact,
    ...bindArtifactToSplit({ splitOriginsSha256, trainOrigins, artifact }),
  }
})

export const outerArtifacts = buildOuterArtifacts(origins, 13)

export const buildProspectiveArtifact = (trainOrigins: readonly string[]) => {
  const artifact = fitBAblStrataBaseline({ rows: trainRowsForOrigins(trainOrigins) })
  const splitOriginsSha256 = computeSplitOriginsSha256({
    kind: 'prospective-baseline-fit-v1',
    studyContractId: STUDY_ID,
    studyContractSha256: STUDY_SHA256,
    trainOrigins,
  })
  return {
    scope: 'prospective_cycle' as const,
    foldId: null,
    testOrigin: null,
    trainOrigins,
    splitOriginsSha256,
    artifact,
    ...bindArtifactToSplit({ splitOriginsSha256, trainOrigins, artifact }),
  }
}

export const prospectiveArtifact = buildProspectiveArtifact(origins)
export const walkForwardSplitSha256 = (
  studyOrigins: readonly string[],
  artifacts: ReturnType<typeof buildOuterArtifacts>,
) => computeSplitOriginsSha256({
  kind: 'study-walk-forward-split-v1',
  originCount: studyOrigins.length,
  initialTrainOriginCount: 13,
  folds: artifacts.map((artifact, index) => ({
    sequence: index + 1,
    testOrigin: artifact.testOrigin,
    trainOrigins: artifact.trainOrigins,
  })),
})

export const validInput = {
  studyContractId: STUDY_ID,
  studyContractSha256: STUDY_SHA256,
  studyOriginSchedule: originSchedule,
  studyOrigins: origins,
  studyOriginScheduleSha256: computeStudyOriginScheduleSha256({
    studyContractId: STUDY_ID,
    studyContractSha256: STUDY_SHA256,
    studyOriginSchedule: originSchedule,
  }),
  walkForwardSplitSha256: walkForwardSplitSha256(origins, outerArtifacts),
  outerFoldCount: outerArtifacts.length,
  primaryArtifacts: [...outerArtifacts, prospectiveArtifact],
}

export const scientificBaselineGateInputSchema = createScientificBaselineGateInputSchema({
  studyContractId: STUDY_ID,
  studyContractSha256: STUDY_SHA256,
  studyOriginScheduleSha256: validInput.studyOriginScheduleSha256,
})
