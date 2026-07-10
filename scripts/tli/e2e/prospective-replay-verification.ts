import {
  IntervalReplayError,
  assertReplayedEnvelope,
  type ReplicateBody,
} from '../../../lib/tli/model/interval-replay'
import type { M1ModelArtifactV2 } from '../../../lib/tli/model/m1'
import type { FixtureOriginRef } from './fixture-origins'
import type { ProspectiveScoringRow } from './prospective-scoring-contract'

export class ProspectiveScoringCriticalIncidentError extends Error {
  readonly name = 'ProspectiveScoringCriticalIncidentError'
  readonly kind = 'critical_incident'

  constructor(
    readonly code: string,
    readonly originDate: string,
    readonly themeId: string,
    readonly checkedRows: number,
    readonly cause: IntervalReplayError,
  ) {
    super(`prospective scoring rejected by replay preflight: ${code}`)
  }
}

export function assertProspectiveReplayBytes(input: {
  readonly origin: FixtureOriginRef
  readonly rows: readonly ProspectiveScoringRow[]
  readonly artifact: M1ModelArtifactV2
  readonly replicateBodies: readonly ReplicateBody[]
}): number {
  let checkedRows = 0
  for (const row of input.rows) {
    try {
      assertReplayedEnvelope({
        fullFitArtifact: input.artifact,
        replicateBodies: input.replicateBodies,
        row: { values: row.snapshot.values, missingFlags: row.snapshot.missingFlags },
        pointProbability: row.candidateProbability,
        storedLower: row.candidateCiLower,
        storedUpper: row.candidateCiUpper,
      })
    } catch (error) {
      if (error instanceof IntervalReplayError) {
        throw new ProspectiveScoringCriticalIncidentError(
          error.code,
          input.origin.originDate,
          row.themeId,
          checkedRows,
          error,
        )
      }
      throw error
    }
    checkedRows += 1
  }
  return checkedRows
}
