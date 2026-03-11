export const COMPARISON_V4_PRIMARY_OWNER = 'comparison-v4-primary-owner'
export const COMPARISON_V4_SECONDARY_OWNER = 'comparison-v4-secondary-owner'
export const COMPARISON_V4_LEGACY_CLEANUP_DAYS = 90

export const COMPARISON_V4_DASHBOARDS = [
  { id: 'shadow-run-throughput', title: 'Shadow Run Throughput' },
  { id: 'published-run-lag', title: 'Published Run Lag' },
  { id: 'primary-endpoint-trend', title: 'Primary Endpoint Trend' },
  { id: 'censoring-breakdown', title: 'Censoring Breakdown' },
  { id: 'prediction-availability-drift', title: 'Prediction Availability Drift' },
  { id: 'v2-storage-growth', title: 'V2 Storage Growth' },
] as const

export const COMPARISON_V4_ALERTS = [
  { id: 'failed-run-rate', threshold: '> 5% over 1h' },
  { id: 'unpublished-backlog', threshold: '> 1 batch window' },
  { id: 'top3-censoring-rate', threshold: '>= 10%' },
  { id: 'prediction-availability-delta', threshold: 'guardrail breach' },
  { id: 'storage-growth-budget', threshold: '> planned budget' },
  { id: 'contract-parity-e2e', threshold: 'promotion candidate failure' },
] as const

// ── PRD §13.2: evaluatable numeric thresholds ──

export const COMPARISON_V4_ALERT_THRESHOLDS = {
  failedRunRatePct: 5,
  failedRunWindowMinutes: 60,
  unpublishedBacklogBatchWindows: 1,
  top3CensoringRatePct: 10,
  predictionAvailabilityDeltaPct: 5,
  storageGrowthOverBudgetPct: 20,
} as const

type AlertThresholdKey = keyof typeof COMPARISON_V4_ALERT_THRESHOLDS

const THRESHOLD_TO_ALERT_ID: Record<AlertThresholdKey, string> = {
  failedRunRatePct: 'failed-run-rate',
  failedRunWindowMinutes: 'failed-run-rate',
  unpublishedBacklogBatchWindows: 'unpublished-backlog',
  top3CensoringRatePct: 'top3-censoring-rate',
  predictionAvailabilityDeltaPct: 'prediction-availability-delta',
  storageGrowthOverBudgetPct: 'storage-growth-budget',
}

// >= threshold means breach (top3CensoringRatePct uses >=, rest use >)
const GTE_THRESHOLDS = new Set<AlertThresholdKey>(['top3CensoringRatePct'])

export const evaluateAlertThreshold = (
  key: AlertThresholdKey,
  value: number,
): { breached: boolean; alertId: string; threshold: number; value: number } => {
  const threshold = COMPARISON_V4_ALERT_THRESHOLDS[key]
  const breached = GTE_THRESHOLDS.has(key)
    ? value >= threshold
    : value > threshold
  return { breached, alertId: THRESHOLD_TO_ALERT_ID[key], threshold, value }
}

// ── PRD §13.3: notification channel ──

export const COMPARISON_V4_NOTIFICATION_CHANNEL = {
  type: 'github-issue' as const,
  primaryOwner: COMPARISON_V4_PRIMARY_OWNER,
  secondaryOwner: COMPARISON_V4_SECONDARY_OWNER,
}

// ── PRD §12: retention policy ──

export const COMPARISON_V4_RETENTION_POLICY = {
  theme_comparison_runs_v2: 365,
  theme_comparison_candidates_v2: 120,
  theme_comparison_eval_v2: 365,
  prediction_snapshots_v2: 365,
  comparison_backfill_manifest_v2: -1, // -1 = permanent
} as const

// ── Observability readiness check (promotion prerequisite) ──

interface ObservabilityInput {
  dashboardsConfigured: boolean
  alertsConfigured: boolean
  notificationChannelConfigured: boolean
  runbookExists: boolean
  drillEvidenceExists: boolean
}

export const isObservabilityReady = (
  input: ObservabilityInput,
): { ready: boolean; missingPrerequisites: string[] } => {
  const missing: string[] = []
  for (const [key, value] of Object.entries(input)) {
    if (!value) missing.push(key)
  }
  return { ready: missing.length === 0, missingPrerequisites: missing }
}

// ── Drill evidence ──

export interface DrillEvidence {
  drillDate: string
  passed: boolean
  steps: {
    flagReverted: boolean
    readerPinned: boolean
    shadowWriterFrozen: boolean
    affectedRunRange: { from: string; to: string }
    parityResult: { ok: boolean }
    incidentNote: string
  }
}

export const buildDrillEvidence = (input: {
  drillDate: string
  flagReverted: boolean
  readerPinned: boolean
  shadowWriterFrozen: boolean
  affectedRunRange: { from: string; to: string }
  parityResult: { ok: boolean }
  incidentNote: string
}): DrillEvidence => {
  const passed = input.flagReverted && input.readerPinned && input.parityResult.ok
  return {
    drillDate: input.drillDate,
    passed,
    steps: {
      flagReverted: input.flagReverted,
      readerPinned: input.readerPinned,
      shadowWriterFrozen: input.shadowWriterFrozen,
      affectedRunRange: input.affectedRunRange,
      parityResult: input.parityResult,
      incidentNote: input.incidentNote,
    },
  }
}
