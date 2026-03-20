import { config } from 'dotenv'
config({ path: '.env.local' })

import { materializePhase0Artifacts } from '@/scripts/tli/comparison/materialize-phase0-artifacts'

export async function runPhase0Materialization() {
  const result = await materializePhase0Artifacts()
  console.log(
    `✅ phase0 materialization complete: history=${result.stateHistoryBackfillCount}, episodes=${result.episodeCount}, snapshots=${result.querySnapshotCount}, labels=${result.labelCount}, candidates=${result.analogCandidateCount}, evidence=${result.analogEvidenceCount}`,
  )
  return result
}

const isDirectRun = process.argv[1]?.includes('run-phase0-materialization')
if (isDirectRun) {
  runPhase0Materialization().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
