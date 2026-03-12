import { describe, expect, it } from 'vitest'
import {
  buildLegacyEvalBridgeRunKey,
  resolveLegacyBridgeRunId,
  isLegacyEvalBridgeEnabled,
  THEME_COMPARISON_EVAL_V2_ON_CONFLICT,
  THEME_COMPARISON_EVAL_V2_NATIVE_ON_CONFLICT,
} from '../evaluate-comparisons'

describe('evaluate-comparisons legacy bridge', () => {
  it('uses the full unique key for theme_comparison_eval_v2 upsert', () => {
    expect(THEME_COMPARISON_EVAL_V2_ON_CONFLICT).toBe('run_id,candidate_theme_id,evaluation_horizon_days')
  })

  it('maps legacy bridge eval rows by current theme and run date, not by theme only', () => {
    expect(buildLegacyEvalBridgeRunKey('theme-1', '2026-03-01')).toBe('theme-1:2026-03-01')
  })

  it('includes algorithm and pool identity in the legacy bridge run key', () => {
    expect(
      buildLegacyEvalBridgeRunKey('theme-1', '2026-03-01', 'comparison-v4-shadow-v1', 'prod', 'archetype'),
    ).toBe('theme-1:2026-03-01:comparison-v4-shadow-v1:prod:archetype')
  })

  it('uses the same full unique key for native v4 eval upsert', () => {
    expect(THEME_COMPARISON_EVAL_V2_NATIVE_ON_CONFLICT).toBe('run_id,candidate_theme_id,evaluation_horizon_days')
  })

  it('keeps the risky legacy eval bridge disabled by default in the production path', () => {
    delete process.env.TLI_LEGACY_EVAL_BRIDGE_ENABLED
    expect(isLegacyEvalBridgeEnabled()).toBe(false)
    process.env.TLI_LEGACY_EVAL_BRIDGE_ENABLED = 'true'
    expect(isLegacyEvalBridgeEnabled()).toBe(true)
  })

  it('only resolves a bridge run id when the theme/date pair maps to a unique surface', () => {
    const unique = new Map([
      ['theme-1:2026-03-01', ['run-unique']],
      ['theme-2:2026-03-01', ['run-a', 'run-b']],
    ])

    expect(resolveLegacyBridgeRunId(unique, 'theme-1', '2026-03-01')).toBe('run-unique')
    expect(resolveLegacyBridgeRunId(unique, 'theme-2', '2026-03-01')).toBeNull()
    expect(resolveLegacyBridgeRunId(unique, 'theme-3', '2026-03-01')).toBeNull()
  })
})
