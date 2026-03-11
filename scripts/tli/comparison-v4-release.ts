import { canPromoteComparisonRun } from './comparison-v4-promotion'

interface ReleaseCandidate {
  id: string
  status: 'pending' | 'materializing' | 'complete' | 'published' | 'failed' | 'rolled_back'
  publish_ready: boolean
  expected_candidate_count: number
  materialized_candidate_count: number
  expected_snapshot_count: number
  materialized_snapshot_count: number
}

export function buildComparisonV4ReleasePlan(runs: ReleaseCandidate[]) {
  const promotableRunIds: string[] = []
  const skippedRunIds: string[] = []

  for (const run of runs) {
    if (canPromoteComparisonRun(run)) promotableRunIds.push(run.id)
    else skippedRunIds.push(run.id)
  }

  const report = [
    '# Comparison v4 Release Plan',
    '',
    `Promotable Runs: ${promotableRunIds.length}`,
    `Skipped Runs: ${skippedRunIds.length}`,
  ].join('\n')

  return { promotableRunIds, skippedRunIds, report }
}
