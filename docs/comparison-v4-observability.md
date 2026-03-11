# Comparison v4 Observability

## Required Dashboards

| ID | Title | Owner |
|----|-------|-------|
| shadow-run-throughput | Shadow Run Throughput | comparison-v4-primary-owner |
| published-run-lag | Published Run Lag | comparison-v4-primary-owner |
| primary-endpoint-trend | Primary Endpoint Trend | comparison-v4-primary-owner |
| censoring-breakdown | Censoring Breakdown | comparison-v4-secondary-owner |
| prediction-availability-drift | Prediction Availability Drift | comparison-v4-secondary-owner |
| v2-storage-growth | V2 Storage Growth | comparison-v4-secondary-owner |

Config: `scripts/tli/comparison-v4-ops.ts` `COMPARISON_V4_DASHBOARDS`

## Required Alerts

| ID | Threshold | Condition |
|----|-----------|-----------|
| failed-run-rate | 5% | > 5% over 1 hour window |
| unpublished-backlog | 1 batch window | > 1 batch window lag |
| top3-censoring-rate | 10% | >= 10% of top-3 results censored |
| prediction-availability-delta | 5% | > 5% availability drop |
| storage-growth-budget | 20% | > 20% over planned budget |
| contract-parity-e2e | N/A | any promotion candidate parity failure |

Config: `scripts/tli/comparison-v4-ops.ts` `COMPARISON_V4_ALERT_THRESHOLDS`

## Notification Channel

- Type: GitHub Issue (auto-created on alert breach)
- Primary Owner: comparison-v4-primary-owner
- Secondary Owner: comparison-v4-secondary-owner

Config: `scripts/tli/comparison-v4-ops.ts` `COMPARISON_V4_NOTIFICATION_CHANNEL`

## Retention Policy (PRD §12)

| Table | Retention |
|-------|-----------|
| theme_comparison_runs_v2 | 365 days |
| theme_comparison_candidates_v2 | 120 days |
| theme_comparison_eval_v2 | 365 days |
| prediction_snapshots_v2 | 365 days |
| comparison_backfill_manifest_v2 | permanent |

Config: `scripts/tli/comparison-v4-ops.ts` `COMPARISON_V4_RETENTION_POLICY`

## Promotion Prerequisites

Promotion (`/api/admin/tli/comparison-v4/promote`) requires all:

1. Dashboards configured
2. Alerts configured with numeric thresholds
3. Notification channel assigned with primary/secondary owner
4. Rollback runbook exists (`docs/comparison-v4-runbook.md`)
5. Drill evidence exists (at least one successful drill recorded)

Checker: `scripts/tli/comparison-v4-ops.ts` `isObservabilityReady()`
