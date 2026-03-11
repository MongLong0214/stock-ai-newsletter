import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  COMPARISON_V4_ALERTS,
  COMPARISON_V4_DASHBOARDS,
  COMPARISON_V4_LEGACY_CLEANUP_DAYS,
  COMPARISON_V4_PRIMARY_OWNER,
  COMPARISON_V4_SECONDARY_OWNER,
} from '../comparison-v4-ops'

describe('comparison v4 ops config', () => {
  it('defines the required dashboards', () => {
    expect(COMPARISON_V4_DASHBOARDS.map((item) => item.id)).toEqual([
      'shadow-run-throughput',
      'published-run-lag',
      'primary-endpoint-trend',
      'censoring-breakdown',
      'prediction-availability-drift',
      'v2-storage-growth',
    ])
  })

  it('defines the required alert thresholds', () => {
    expect(COMPARISON_V4_ALERTS.map((item) => item.id)).toEqual([
      'failed-run-rate',
      'unpublished-backlog',
      'top3-censoring-rate',
      'prediction-availability-delta',
      'storage-growth-budget',
      'contract-parity-e2e',
    ])
  })

  it('defines the legacy comparison cleanup window as 90 days', () => {
    expect(COMPARISON_V4_LEGACY_CLEANUP_DAYS).toBe(90)
  })

  it('defines primary and secondary owners', () => {
    expect(COMPARISON_V4_PRIMARY_OWNER).toBeTruthy()
    expect(COMPARISON_V4_SECONDARY_OWNER).toBeTruthy()
  })
})

describe('comparison v4 operational docs', () => {
  it('includes the rollback runbook document with required steps', () => {
    const markdown = readFileSync(resolve(process.cwd(), 'docs/comparison-v4-runbook.md'), 'utf8')
    expect(markdown).toContain('# Comparison v4 Rollback Runbook')
    expect(markdown).toContain('feature flag revert')
    expect(markdown).toContain('published reader pin')
    expect(markdown).toContain('affected run/date range')
  })

  it('includes the observability document with dashboard and alert sections', () => {
    const markdown = readFileSync(resolve(process.cwd(), 'docs/comparison-v4-observability.md'), 'utf8')
    expect(markdown).toContain('# Comparison v4 Observability')
    expect(markdown).toContain('Required Dashboards')
    expect(markdown).toContain('Required Alerts')
    expect(markdown).toContain('Owner')
  })
})
