import type { ConfirmatoryFeatureSnapshot } from '../../../lib/tli/features/build-confirmatory-features'
import type { FixtureOriginRef } from './fixture-origins'

export interface ProspectiveScoringRow {
  readonly origin: FixtureOriginRef
  readonly themeId: string
  readonly snapshot: ConfirmatoryFeatureSnapshot
  readonly candidateProbability: number
  readonly candidateCiLower: number
  readonly candidateCiUpper: number
  readonly comparatorProbability: 0.5
  readonly outcome: boolean
  readonly labelId: string
  readonly finalizedAt: string
}

export interface ProspectiveScoringReceipt {
  readonly plannedFinalizations: number
  readonly completedFinalizations: number
  readonly replayEnvelopeChecks: number
  readonly replayEnvelopeByteMatch: 'pass'
  readonly crossCycleRoleJoinCount: number
  readonly rolePairViolationCount: number
  readonly featureSnapshotMismatchCount: number
  readonly v1MixCount: number
  readonly nullToFalseCount: number
}
