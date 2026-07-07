import { buildFeatureVector } from '../../../lib/tli/features/build-features'
import type { M1ModelArtifact } from '../../../lib/tli/model/m1'
import {
  TLI_V3_M1_PARAM_VERSION,
  buildBaselinePredictionV3Row,
  buildM1PredictionV3Row,
  parsePredictionPhase,
} from '../comparison/theme-predictions-v3-records'
import { loadFeatureInputsForBaseDate } from '../features/load-feature-inputs'
import type { ReplayAuditPredictionRow } from './replay-audit'

interface ReplaySnapshotForScoring {
  readonly theme_id: string
  readonly snapshot_date: string
  readonly phase: string
}

const SCORE_REPLAY_CONCURRENCY = 8

export const scoreReplayRows = async (input: {
  readonly snapshots: readonly ReplaySnapshotForScoring[]
  readonly artifact: M1ModelArtifact
  readonly trainEnd: string
}): Promise<ReplayAuditPredictionRow[]> => {
  const rows = new Array<ReplayAuditPredictionRow | null>(input.snapshots.length).fill(null)
  let nextIndex = 0
  const workerCount = Math.min(SCORE_REPLAY_CONCURRENCY, input.snapshots.length)
  const workers = Array.from({ length: workerCount }, async () => {
    for (;;) {
      const index = nextIndex
      nextIndex += 1
      if (index >= input.snapshots.length) return
      const snapshot = input.snapshots[index]
      if (snapshot === undefined) {
        throw new Error(`missing replay snapshot at index ${index}`)
      }
      const featureInputs = await loadFeatureInputsForBaseDate({
        themeId: snapshot.theme_id,
        baseDate: snapshot.snapshot_date,
      })
      const featureVector = buildFeatureVector(featureInputs)
      const m1 = buildM1PredictionV3Row({
        themeId: snapshot.theme_id,
        predictionDate: snapshot.snapshot_date,
        featureVector,
        artifact: input.artifact,
        modelVersion: `m1-replay-${input.trainEnd}`,
        paramVersion: TLI_V3_M1_PARAM_VERSION,
        servingRole: 'shadow',
      })
      const bAbl = buildBaselinePredictionV3Row({
        themeId: snapshot.theme_id,
        predictionDate: snapshot.snapshot_date,
        prediction: { phase: parsePredictionPhase(snapshot.phase) },
        featureVector,
        servingRole: 'champion',
      })
      rows[index] = {
        themeId: snapshot.theme_id,
        baseDate: snapshot.snapshot_date,
        pRiseM1: m1.pRise,
        pRiseBAbl: bAbl.pRise,
      }
    }
  })
  await Promise.all(workers)
  return rows.map((row, index) => {
    if (row === null) {
      throw new Error(`missing scored replay row at index ${index}`)
    }
    return row
  })
}
