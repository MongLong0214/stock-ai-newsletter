import { buildComparisonV4ControlRow, type ComparisonV4ControlRow } from './comparison-v4-control'
import { buildPromoteRunPatch } from './comparison-v4-promotion'
import { buildComparisonV4ReleasePlan } from './comparison-v4-release'

interface PromoteRunLike {
  id: string
  status: 'pending' | 'materializing' | 'complete' | 'published' | 'failed' | 'rolled_back'
  publish_ready: boolean
  expected_candidate_count: number
  materialized_candidate_count: number
  expected_snapshot_count: number
  materialized_snapshot_count: number
}

interface PromoteDeps {
  loadRuns: (runIds: string[]) => Promise<PromoteRunLike[]>
  updateRuns: (runIds: string[], patch: Record<string, unknown>) => Promise<void>
  disableActiveControlRows: () => Promise<void>
  upsertControlRow: (row: ComparisonV4ControlRow) => Promise<void>
}

export async function promoteComparisonV4Runs(
  deps: PromoteDeps,
  input: {
    runIds: string[]
    actor: string
    productionVersion: string
    promotedAt?: string
  },
) {
  const runs = await deps.loadRuns(input.runIds)
  const releasePlan = buildComparisonV4ReleasePlan(runs)
  if (releasePlan.promotableRunIds.length === 0) {
    throw new Error(`승격 가능한 run이 없습니다.\n${releasePlan.report}`)
  }

  const patch = buildPromoteRunPatch(input.promotedAt)
  await deps.updateRuns(releasePlan.promotableRunIds, patch)
  await deps.disableActiveControlRows()
  await deps.upsertControlRow(
    buildComparisonV4ControlRow({
      productionVersion: input.productionVersion,
      servingEnabled: true,
      actor: input.actor,
      promotedAt: patch.published_at,
    }),
  )

  return {
    promotedRunIds: releasePlan.promotableRunIds,
    skippedRunIds: releasePlan.skippedRunIds,
    report: releasePlan.report,
  }
}
