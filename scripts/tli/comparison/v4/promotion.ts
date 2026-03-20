import type { ComparisonRunStatus } from '@/lib/tli/types/db'

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
    && input.expected_candidate_count > 0
    && input.expected_candidate_count === input.materialized_candidate_count
    && input.expected_snapshot_count === input.materialized_snapshot_count
}

export function isPromotionBlocked(input: {
  stateHistoryBackfillComplete: boolean
  manifestParityPassed?: boolean
}): { blocked: boolean; reason: string | null } {
  if (!input.stateHistoryBackfillComplete) {
    return { blocked: true, reason: 'theme_state_history_v2 backfill이 완료되지 않았습니다' }
  }
  if (input.manifestParityPassed === false) {
    return { blocked: true, reason: 'backfill manifest parity 검증이 통과하지 않았습니다' }
  }
  return { blocked: false, reason: null }
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
