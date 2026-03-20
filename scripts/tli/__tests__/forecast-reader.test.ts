/**
 * TCAR-018: Forecast Reader — API helper for reading serving version.
 */
import { describe, it, expect } from 'vitest'
import {
  readForecastForTheme,
  type ForecastReaderResult,
} from '@/app/api/tli/themes/[id]/forecast-reader'
import type { ControlPlaneState } from '@/scripts/tli/comparison/forecast-serving'

const makeState = (overrides: Partial<ControlPlaneState> = {}): ControlPlaneState => ({
  productionVersion: 'v1.2.0',
  servingStatus: 'production',
  cutoverReady: true,
  rollbackTargetVersion: 'v1.1.0',
  failClosedVerified: true,
  shipVerdictArtifactId: 'artifact-001',
  ...overrides,
})

describe('TCAR-018: readForecastForTheme', () => {
  it('returns serving=true when all conditions met', () => {
    const result = readForecastForTheme(makeState())
    expect(result.serving).toBe(true)
    expect(result.version).toBe('v1.2.0')
    expect(result.rollbackAvailable).toBe(true)
    expect(result.rollbackVersion).toBe('v1.1.0')
    expect(result.reason).toBeUndefined()
  })

  it('returns serving=false when not in production', () => {
    const result = readForecastForTheme(makeState({ servingStatus: 'shadow' }))
    expect(result.serving).toBe(false)
    expect(result.version).toBeNull()
    expect(result.reason).toBe('not_production')
  })

  it('returns serving=false when fail-closed not verified', () => {
    const result = readForecastForTheme(makeState({ failClosedVerified: false }))
    expect(result.serving).toBe(false)
    expect(result.reason).toBe('fail_closed_not_verified')
  })

  it('returns serving=false when cutover not ready', () => {
    const result = readForecastForTheme(makeState({ cutoverReady: false }))
    expect(result.serving).toBe(false)
    expect(result.reason).toBe('cutover_not_ready')
  })

  it('returns rollbackAvailable=false when no rollback version (fail-closed)', () => {
    const result = readForecastForTheme(makeState({ rollbackTargetVersion: null }))
    expect(result.serving).toBe(false)
    expect(result.rollbackAvailable).toBe(false)
    expect(result.rollbackVersion).toBeNull()
    expect(result.reason).toBe('no_rollback_target')
  })

  it('result satisfies ForecastReaderResult interface', () => {
    const result: ForecastReaderResult = readForecastForTheme(makeState())
    expect(typeof result.serving).toBe('boolean')
    expect(typeof result.rollbackAvailable).toBe('boolean')
  })
})
