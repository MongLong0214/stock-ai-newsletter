import { describe, expect, it } from 'vitest'
import {
  DEFAULT_COMPARISON_V4_SERVING_VERSION,
  buildComparisonV4ControlRow,
  resolveComparisonV4ServingVersion,
} from '../comparison-v4-control'

describe('comparison v4 control helpers', () => {
  it('prefers persisted production pointer over env default', () => {
    const version = resolveComparisonV4ServingVersion({
      envVersion: 'env-v1',
      controlRow: {
        production_version: 'db-v2',
        serving_enabled: true,
      },
    })

    expect(version).toBe('db-v2')
  })

  it('falls back to env version and then latest', () => {
    expect(resolveComparisonV4ServingVersion({ envVersion: 'env-v1', controlRow: null })).toBe('env-v1')
    expect(resolveComparisonV4ServingVersion({ envVersion: undefined, controlRow: null })).toBe(DEFAULT_COMPARISON_V4_SERVING_VERSION)
  })

  it('builds a control row patch for published promotion', () => {
    const row = buildComparisonV4ControlRow({
      productionVersion: 'algo-v4-prod',
      servingEnabled: true,
      actor: 'codex',
      promotedAt: '2026-03-11T00:00:00.000Z',
    })

    expect(row.production_version).toBe('algo-v4-prod')
    expect(row.serving_enabled).toBe(true)
    expect(row.promoted_by).toBe('codex')
  })
})
