import {
  buildConfirmatoryFeatureVector,
  type ConfirmatoryFeatureInput,
} from '../../../lib/tli/features/build-confirmatory-features'
import { predictM1Probability, type M1ModelArtifactV2 } from '../../../lib/tli/model/m1'
import { replayCandidateEnvelope, type ReplicateBody } from '../../../lib/tli/model/interval-replay'
import { getKoreanTradingDateWindow } from '../../../lib/tli/trading-calendar'
import type { FixtureOriginRef, FixtureOriginStack } from './fixture-origins'
import {
  CYCLE_ID,
  THEME_IDS,
  deterministicUuid,
} from './fixture-identities'
import {
  buildProspectiveFeatureInput,
  buildProspectiveOutcome,
  type FixtureSignalMode,
} from './fixture-study-data'
import {
  scoreProspectiveOrigin,
} from './prospective-scoring'
import type { ProspectiveScoringReceipt, ProspectiveScoringRow } from './prospective-scoring-contract'

export interface ProspectivePanelRow extends ProspectiveScoringRow {
  readonly sequence: number
  readonly featureInput: ConfirmatoryFeatureInput
}

export interface ProspectivePanel {
  readonly rows: readonly ProspectivePanelRow[]
  readonly scoredOriginCount: number
  readonly plannedFinalizations: number
  readonly completedFinalizations: number
  readonly intervalEnsembleSha256: string
  readonly replayEnvelopeChecks: number
  readonly replayEnvelopeByteMatch: 'pass'
  readonly crossCycleRoleJoinCount: number
  readonly rolePairViolationCount: number
  readonly featureSnapshotMismatchCount: number
  readonly v1MixCount: number
  readonly nullToFalseCount: number
}

const isoBefore = (date: string): string => {
  const instant = new Date(`${date}T00:00:00.000Z`)
  instant.setUTCDate(instant.getUTCDate() - 1)
  return instant.toISOString()
}

const buildPanelRow = (input: {
  readonly stack: FixtureOriginStack
  readonly origin: FixtureOriginRef
  readonly originIndex: number
  readonly themeId: string
  readonly mode: FixtureSignalMode
  readonly artifact: M1ModelArtifactV2
  readonly replicateBodies: readonly ReplicateBody[]
}): ProspectivePanelRow => {
  const featureInput = buildProspectiveFeatureInput({
    stack: input.stack,
    origin: input.origin,
    themeId: input.themeId,
    mode: input.mode,
  })
  const snapshot = buildConfirmatoryFeatureVector(featureInput)
  const candidateProbability = predictM1Probability(input.artifact, snapshot)
  if (candidateProbability === null || snapshot.abstain) {
    throw new Error(`prospective candidate unexpectedly abstained for ${input.origin.originDate}:${input.themeId}`)
  }
  // Todo 13/15: build the stored candidate envelope from the frozen 500-model ensemble; the scoring
  // boundary independently replays the same bodies and rejects any byte-different stored bounds.
  const envelope = replayCandidateEnvelope({
    fullFitArtifact: input.artifact,
    replicateBodies: input.replicateBodies,
    row: { values: snapshot.values, missingFlags: snapshot.missingFlags },
    pointProbability: candidateProbability,
  })
  const lastFuture = getKoreanTradingDateWindow({
    baseDate: input.origin.originDate,
    startOffset: 1,
    endOffset: 5,
  }).at(-1)
  if (lastFuture === undefined) throw new Error(`prospective future window missing for ${input.origin.originDate}`)
  return {
    sequence: input.originIndex + 1,
    origin: input.origin,
    themeId: input.themeId,
    featureInput,
    snapshot,
    candidateProbability,
    candidateCiLower: envelope.lower,
    candidateCiUpper: envelope.upper,
    comparatorProbability: 0.5,
    outcome: buildProspectiveOutcome(input.themeId),
    labelId: deterministicUuid('prospective-label', `${input.origin.originDate}:${input.themeId}`),
    finalizedAt: `${lastFuture}T11:00:00.000Z`,
  }
}

export async function buildAndScoreProspectivePanel(input: {
  readonly stack: FixtureOriginStack
  readonly mode: FixtureSignalMode
  readonly artifact: M1ModelArtifactV2
  readonly artifactSha256: string
  readonly intervalEnsembleSha256: string
  readonly intervalEnsembleArtifact: unknown
  readonly replicateBodies: readonly ReplicateBody[]
}): Promise<ProspectivePanel> {
  const rows = input.stack.prospectiveOrigins.flatMap((origin, originIndex) => (
    THEME_IDS.map((themeId) => buildPanelRow({ ...input, origin, originIndex, themeId }))
  ))
  const firstOrigin = input.stack.prospectiveOrigins.at(0)
  if (firstOrigin === undefined) throw new Error('prospective origin schedule is empty')
  const receipts: ProspectiveScoringReceipt[] = []
  for (const origin of input.stack.prospectiveOrigins) {
    receipts.push(await scoreProspectiveOrigin({
      origin,
      rows: rows.filter((row) => row.origin.originDate === origin.originDate),
      artifact: input.artifact,
      artifactSha256: input.artifactSha256,
      intervalEnsembleSha256: input.intervalEnsembleSha256,
      intervalEnsembleArtifact: input.intervalEnsembleArtifact,
      replicateBodies: input.replicateBodies,
      modelCreatedAt: isoBefore(firstOrigin.originDate),
      modelArtifactId: deterministicUuid('model-manifest-artifact', CYCLE_ID),
    }))
  }
  const sum = (select: (receipt: (typeof receipts)[number]) => number): number => (
    receipts.reduce((total, receipt) => total + select(receipt), 0)
  )
  return {
    rows,
    scoredOriginCount: input.stack.prospectiveOrigins.length,
    plannedFinalizations: sum((receipt) => receipt.plannedFinalizations),
    completedFinalizations: sum((receipt) => receipt.completedFinalizations),
    intervalEnsembleSha256: input.intervalEnsembleSha256,
    replayEnvelopeChecks: sum((receipt) => receipt.replayEnvelopeChecks),
    replayEnvelopeByteMatch: 'pass',
    crossCycleRoleJoinCount: sum((receipt) => receipt.crossCycleRoleJoinCount),
    rolePairViolationCount: sum((receipt) => receipt.rolePairViolationCount),
    featureSnapshotMismatchCount: sum((receipt) => receipt.featureSnapshotMismatchCount),
    v1MixCount: sum((receipt) => receipt.v1MixCount),
    nullToFalseCount: sum((receipt) => receipt.nullToFalseCount),
  }
}
