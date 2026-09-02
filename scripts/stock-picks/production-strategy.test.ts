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
      name: 'volumeBreakoutNoGapUp',
      version: 'v0-2026-08-28',
      parameters: PRODUCTION_VOLUME_BREAKOUT_PARAMETERS,
    })
    expect(canonicalJson(PRODUCTION_VOLUME_BREAKOUT_PARAMETERS)).toBe(
      '{"excludeGapUp":true,"maxRsi":75,"minDistanceFromHighPercent":0,"minScore":0,"minTurnover":500000000,"minVolumePercentile":90}',
    )
    expect(hashCanonicalJson(PRODUCTION_VOLUME_BREAKOUT_PARAMETERS)).toBe(
      '57fde5c487d6d95326eeb1c529cc1a59039754ac2f912199788c2170ffee3e86',
    )
    expect(PRODUCTION_STRATEGY.parametersHash).toBe(
      hashCanonicalJson(PRODUCTION_VOLUME_BREAKOUT_PARAMETERS),
    )
  })
})
