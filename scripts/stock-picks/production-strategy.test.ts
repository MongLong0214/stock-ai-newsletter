import { describe, expect, it } from 'vitest'

import {
  PRODUCTION_STRATEGY,
  PRODUCTION_VOLUME_BREAKOUT_PARAMETERS,
  canonicalJson,
  hashCanonicalJson,
} from '@/scripts/stock-picks/production-strategy'

describe('frozen production strategy artifact', () => {
  it('keeps the canonical frozen-parameter hash stable', () => {
    expect(PRODUCTION_STRATEGY).toMatchObject({
      name: 'volumeBreakoutNoGapUp+volumeOnlyFill',
      version: 'v1-2026-09-03',
      parameters: PRODUCTION_VOLUME_BREAKOUT_PARAMETERS,
      fillTiers: ['breakout', 'volumeOnly'],
    })
    expect(canonicalJson(PRODUCTION_VOLUME_BREAKOUT_PARAMETERS)).toBe(
      '{"excludeGapUp":true,"maxRsi":75,"minDistanceFromHighPercent":0,"minScore":0,"minTurnover":500000000,"minVolumePercentile":90}',
    )
    expect(hashCanonicalJson(PRODUCTION_VOLUME_BREAKOUT_PARAMETERS)).toBe(
      '57fde5c487d6d95326eeb1c529cc1a59039754ac2f912199788c2170ffee3e86',
    )
    expect(PRODUCTION_STRATEGY.parametersHash).toBe(
      hashCanonicalJson({
        parameters: PRODUCTION_VOLUME_BREAKOUT_PARAMETERS,
        fillTiers: ['breakout', 'volumeOnly'],
        gateVersion: 'status-flags-v1',
      }),
    )
    expect(PRODUCTION_STRATEGY.parametersHash).toBe(
      'e92cdc70170b45a2e9c589b0082c56f370c2ba8a2d255d9e5916875345c7c94e',
    )
  })
})
