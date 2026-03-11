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
