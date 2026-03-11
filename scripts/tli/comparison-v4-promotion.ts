import type { ComparisonRunStatus } from '../../lib/tli/types/db'

interface PromoteEligibilityInput {
  status: ComparisonRunStatus
  publish_ready: boolean
  expected_candidate_count: number
  materialized_candidate_count: number
  expected_snapshot_count: number
  materialized_snapshot_count: number
}

export function canPromoteComparisonRun(input: PromoteEligibilityInput) {
  return input.status === 'complete'
    && input.publish_ready
    && input.expected_candidate_count === input.materialized_candidate_count
    && input.expected_snapshot_count === input.materialized_snapshot_count
}

export function buildPromoteRunPatch(publishedAt = new Date().toISOString()) {
  return {
    status: 'published' as const,
    published_at: publishedAt,
  }
}

export function buildRollbackRunPatch() {
  return {
    status: 'rolled_back' as const,
    publish_ready: false,
  }
}
