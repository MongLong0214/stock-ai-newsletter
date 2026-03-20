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

These dashboards are documented directly here and are no longer backed by a dedicated helper module.

## Required Alerts

| ID | Threshold | Condition |
|----|-----------|-----------|
| failed-run-rate | 5% | > 5% over 1 hour window |
| unpublished-backlog | 1 batch window | > 1 batch window lag |
| top3-censoring-rate | 10% | >= 10% of top-3 results censored |
| prediction-availability-delta | 5% | > 5% availability drop |
| storage-growth-budget | 20% | > 20% over planned budget |
| contract-parity-e2e | N/A | any promotion candidate parity failure |

These numeric alert thresholds are documented directly here and should be enforced by the actual promotion and incident workflow.

## Notification Channel

- Type: GitHub Issue (auto-created on alert breach)
- Primary Owner: comparison-v4-primary-owner
- Secondary Owner: comparison-v4-secondary-owner

Notification ownership is documented directly here and should be wired through the actual incident workflow.

## Retention Policy (PRD §12)

| Table | Retention |
|-------|-----------|
| theme_comparison_runs_v2 | 365 days |
| theme_comparison_candidates_v2 | 120 days |
| theme_comparison_eval_v2 | 365 days |
| prediction_snapshots_v2 | 365 days |
| comparison_backfill_manifest_v2 | permanent |

Retention policy is documented directly here and should be enforced by the actual retention jobs.

## Promotion Prerequisites

Promotion (`/api/admin/tli/comparison-v4/promote`) requires all:

1. Dashboards configured
2. Alerts configured with numeric thresholds
3. Notification channel assigned with primary/secondary owner
4. Rollback runbook exists (`docs/comparison-v4-runbook.md`)
5. Drill evidence exists (at least one successful drill recorded)

Promotion readiness should verify these five prerequisites directly instead of relying on a docs-only helper module.
