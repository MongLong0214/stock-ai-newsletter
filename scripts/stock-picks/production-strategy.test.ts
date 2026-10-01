import { describe, expect, it } from 'vitest'

import {
  BULLISH_TARGET_STRATEGY,
  FROZEN_BULLISH_TARGET_MODEL,
  FROZEN_COMPOSITE_UTILITY_MODEL,
  LEGACY_VOLUME_BREAKOUT_STRATEGY,
  LOW_VOLATILITY_STABLE_STRATEGY,
  PRODUCTION_STRATEGY,
  PRODUCTION_VOLUME_BREAKOUT_PARAMETERS,
  canonicalJson,
  hashCanonicalJson,
} from '@/scripts/stock-picks/production-strategy'
import { BULLISH_TARGET_PARAMETERS, LOW_VOLATILITY_STABLE_PARAMETERS } from '@/scripts/stock-picks/strategies'
import { SIGNAL_SCORE_VERSION } from '@/scripts/stock-picks/signals'
import { OBSERVED_INPUT_VERSION } from '@/scripts/stock-picks/observed-inputs'
import { addKoreanTradingDays } from '@/lib/tli/trading-calendar'

describe('frozen production strategy artifact', () => {
  it('keeps the canonical frozen-parameter hash stable', () => {
    expect(LEGACY_VOLUME_BREAKOUT_STRATEGY).toMatchObject({
      name: 'volumeBreakoutNoGapUp+volumeOnlyFill',
      version: 'v1.1-2026-09-07',
      parameters: PRODUCTION_VOLUME_BREAKOUT_PARAMETERS,
      fillTiers: ['breakout', 'volumeOnly'],
    })
    expect(canonicalJson(PRODUCTION_VOLUME_BREAKOUT_PARAMETERS)).toBe(
      '{"excludeGapUp":true,"maxRsi":75,"minDistanceFromHighPercent":0,"minScore":0,"minTurnover":500000000,"minVolumePercentile":90}',
    )
    expect(hashCanonicalJson(PRODUCTION_VOLUME_BREAKOUT_PARAMETERS)).toBe(
      '57fde5c487d6d95326eeb1c529cc1a59039754ac2f912199788c2170ffee3e86',
    )
    expect(LEGACY_VOLUME_BREAKOUT_STRATEGY.parametersHash).toBe(
      hashCanonicalJson({
        parameters: PRODUCTION_VOLUME_BREAKOUT_PARAMETERS,
        fillTiers: ['breakout', 'volumeOnly'],
        gateVersion: 'status-flags-valid-candle-v2',
      }),
    )
    expect(LEGACY_VOLUME_BREAKOUT_STRATEGY.parametersHash).toBe(
      '981aa91b3db42c62fc0dd220f44c9d9624ebe0e1e7463a5c5783c5f67fed969c',
    )
    expect(LOW_VOLATILITY_STABLE_STRATEGY).toMatchObject({
      name: 'lowVolatilityStable',
      version: 'v2-2026-09-23',
      parameters: LOW_VOLATILITY_STABLE_PARAMETERS,
    })
    expect(LOW_VOLATILITY_STABLE_STRATEGY.parametersHash).toBe(hashCanonicalJson({
      parameters: LOW_VOLATILITY_STABLE_PARAMETERS,
      gateVersion: 'status-flags-valid-candle-v2',
      preferredRule: 'krx-code-last-digit-nonzero',
    }))
    expect(LOW_VOLATILITY_STABLE_STRATEGY.parametersHash).toBe(
      '35bebdb2a6e26d4db47784c19fafc5d4bcaf985fb81c419cccf4eaeef442846d',
    )
  })

  it('identifies the whole composite utility model, observed inputs and unchanged eligibility parameters', () => {
    expect(SIGNAL_SCORE_VERSION).toBe('technical-signals-v2-2026-09-30')
    expect(PRODUCTION_STRATEGY).toEqual({
      name: 'compositeUtility',
      version: 'v4-2026-09-30',
      objective: 'compositeUtility',
      parameters: LOW_VOLATILITY_STABLE_PARAMETERS,
      parametersHash: hashCanonicalJson({
        parameters: LOW_VOLATILITY_STABLE_PARAMETERS,
        gateVersion: 'status-flags-valid-candle-v2',
        preferredRule: 'krx-code-last-digit-nonzero',
        signalScoreVersion: SIGNAL_SCORE_VERSION,
        observedInputVersion: OBSERVED_INPUT_VERSION,
        model: FROZEN_COMPOSITE_UTILITY_MODEL,
      }),
    })
    expect(PRODUCTION_STRATEGY.parameters).toBe(LOW_VOLATILITY_STABLE_STRATEGY.parameters)
    expect(PRODUCTION_STRATEGY.parametersHash).not.toBe(LOW_VOLATILITY_STABLE_STRATEGY.parametersHash)
    expect(PRODUCTION_STRATEGY.parametersHash).toBe('7c1eb45a10e6f7f502e5e2190327e472201c03b96259d1a2ffbde7ad6603d9b9')
    expect(FROZEN_COMPOSITE_UTILITY_MODEL.trainedLabelsThrough).toBe('2026-09-29')
    expect(FROZEN_COMPOSITE_UTILITY_MODEL.trees).toHaveLength(100)
    expect(PRODUCTION_STRATEGY.parametersHash).not.toBe(hashCanonicalJson({
      parameters: LOW_VOLATILITY_STABLE_PARAMETERS,
      gateVersion: 'status-flags-valid-candle-v2', preferredRule: 'krx-code-last-digit-nonzero',
      signalScoreVersion: SIGNAL_SCORE_VERSION, observedInputVersion: `${OBSERVED_INPUT_VERSION}-changed`,
      model: FROZEN_COMPOSITE_UTILITY_MODEL,
    }))
  })

  it('hashes the frozen target model with its pool gates and keeps training-label availability', () => {
    expect(BULLISH_TARGET_STRATEGY).toMatchObject({
      name: 'bullishTarget5d', version: 'v3-2026-09-29',
      objective: 'bullishThenTouch10Within5TradingDays', parameters: BULLISH_TARGET_PARAMETERS,
    })
    expect(BULLISH_TARGET_STRATEGY.parametersHash).toBe(hashCanonicalJson({
      parameters: BULLISH_TARGET_PARAMETERS, model: FROZEN_BULLISH_TARGET_MODEL,
      gateVersion: 'status-flags-valid-candle-v2', preferredRule: 'krx-code-last-digit-nonzero',
    }))
    expect(BULLISH_TARGET_STRATEGY.parametersHash).toBe(
      '4b2c349c751be708b98e810b4e77dd31b38680bf6f3967b9d7756011feadf1f9',
    )
    expect(FROZEN_BULLISH_TARGET_MODEL.trainedLabelsThrough)
      .toBe(addKoreanTradingDays(FROZEN_BULLISH_TARGET_MODEL.trainedSignalThrough!, 5))
  })
})
