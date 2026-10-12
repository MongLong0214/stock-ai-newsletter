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
import { BULLISH_TARGET_PARAMETERS, LOW_VOLATILITY_STABLE_PARAMETERS, UTILITY_LOCKED_DOWN_RULE } from '@/scripts/stock-picks/strategies'
import { UTILITY_SCORE_VERSION } from '@/scripts/stock-picks/utility-model'
import { SIGNAL_SCORE_VERSION, VOLATILITY_SCORE_REFERENCE } from '@/scripts/stock-picks/signals'
import { MODEL_MARKET_SOURCE_VERSION, OBSERVED_INPUT_VERSION } from '@/scripts/stock-picks/observed-inputs'
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

  it('identifies the whole composite utility model, fixed score reference, locked-down rule and market source contract', () => {
    expect(SIGNAL_SCORE_VERSION).toBe('technical-signals-v3-2026-10-02')
    expect(MODEL_MARKET_SOURCE_VERSION).toBe('kis-market-21-20-v1')
    expect(PRODUCTION_STRATEGY).toEqual({
      name: 'compositeUtility',
      version: 'v5-2026-10-12',
      objective: 'compositeUtility',
      parameters: LOW_VOLATILITY_STABLE_PARAMETERS,
      parametersHash: hashCanonicalJson({
        parameters: LOW_VOLATILITY_STABLE_PARAMETERS,
        gateVersion: 'status-flags-valid-candle-v2',
        preferredRule: 'krx-code-last-digit-nonzero',
        signalScoreVersion: SIGNAL_SCORE_VERSION,
        volatilityScoreReference: VOLATILITY_SCORE_REFERENCE,
        observedInputVersion: OBSERVED_INPUT_VERSION,
        modelMarketSourceVersion: MODEL_MARKET_SOURCE_VERSION,
        utilityScoreVersion: UTILITY_SCORE_VERSION,
        lockedDownRule: UTILITY_LOCKED_DOWN_RULE,
        model: FROZEN_COMPOSITE_UTILITY_MODEL,
      }),
    })
    expect(PRODUCTION_STRATEGY.parameters).toBe(LOW_VOLATILITY_STABLE_STRATEGY.parameters)
    expect(PRODUCTION_STRATEGY.parametersHash).not.toBe(LOW_VOLATILITY_STABLE_STRATEGY.parametersHash)
    expect(PRODUCTION_STRATEGY.parametersHash).toBe('341cbaf15ea18efce096796886ca0e9abc4eba2775f1f73d9f148435778e759a')
    // Technical categories retain their original frozen calibration; the composite refit is separate.
    expect(VOLATILITY_SCORE_REFERENCE).toMatchObject({
      referenceAtrPercent14: 5.221735562010756, referenceRows: 506470, referencePanels: 421,
      referenceThrough: '2026-09-29', referenceLastSignal: '2026-09-18',
      weighting: 'equal signal date, strict matured training rows',
      fitInputSha256: '7e390305a071d6dbb57d9b3800eb880b5ca6abcb066347f6f4fe12340bcc9ed2',
    })
    expect(FROZEN_COMPOSITE_UTILITY_MODEL).toMatchObject({
      schemaVersion: 4, modelVersion: 'composite-utility-v4', trainedLabelsThrough: '2026-10-08',
      targetDefinition: { version: 'touch-nonloss-v1', formula: 'clip(touch)*clip(nonLoss)^2', roundTripCostBps: 30 },
      normalization: {
        version: UTILITY_SCORE_VERSION, center: 50, oneStandardDeviationScore: 70, tailCurvature: 5.25,
        referencePanels: 386, referenceRows: 466134, referenceThrough: '2026-10-08',
        referenceLastSignal: '2026-09-30', source: 'kis',
        weighting: 'equal signal date, strict matured training rows',
      },
    })
    if (FROZEN_COMPOSITE_UTILITY_MODEL.schemaVersion !== 4) throw new Error('Expected separate heads')
    expect(FROZEN_COMPOSITE_UTILITY_MODEL.heads.touch.trees).toHaveLength(100)
    expect(FROZEN_COMPOSITE_UTILITY_MODEL.heads.nonLoss.trees).toHaveLength(100)
    expect(PRODUCTION_STRATEGY.parametersHash).not.toBe(hashCanonicalJson({
      parameters: LOW_VOLATILITY_STABLE_PARAMETERS,
      gateVersion: 'status-flags-valid-candle-v2', preferredRule: 'krx-code-last-digit-nonzero',
      signalScoreVersion: SIGNAL_SCORE_VERSION, observedInputVersion: `${OBSERVED_INPUT_VERSION}-changed`,
      modelMarketSourceVersion: MODEL_MARKET_SOURCE_VERSION,
      utilityScoreVersion: UTILITY_SCORE_VERSION, lockedDownRule: UTILITY_LOCKED_DOWN_RULE,
      model: FROZEN_COMPOSITE_UTILITY_MODEL,
    }))
    expect(PRODUCTION_STRATEGY.parametersHash).not.toBe(hashCanonicalJson({
      parameters: LOW_VOLATILITY_STABLE_PARAMETERS,
      gateVersion: 'status-flags-valid-candle-v2', preferredRule: 'krx-code-last-digit-nonzero',
      signalScoreVersion: SIGNAL_SCORE_VERSION, observedInputVersion: OBSERVED_INPUT_VERSION,
      modelMarketSourceVersion: `${MODEL_MARKET_SOURCE_VERSION}-changed`,
      utilityScoreVersion: UTILITY_SCORE_VERSION, lockedDownRule: UTILITY_LOCKED_DOWN_RULE,
      model: FROZEN_COMPOSITE_UTILITY_MODEL,
    }))
    const contract = {
      parameters: LOW_VOLATILITY_STABLE_PARAMETERS,
      gateVersion: 'status-flags-valid-candle-v2', preferredRule: 'krx-code-last-digit-nonzero',
      signalScoreVersion: SIGNAL_SCORE_VERSION, observedInputVersion: OBSERVED_INPUT_VERSION,
      modelMarketSourceVersion: MODEL_MARKET_SOURCE_VERSION,
      utilityScoreVersion: UTILITY_SCORE_VERSION, lockedDownRule: UTILITY_LOCKED_DOWN_RULE,
      volatilityScoreReference: VOLATILITY_SCORE_REFERENCE,
      model: FROZEN_COMPOSITE_UTILITY_MODEL,
    }
    expect(PRODUCTION_STRATEGY.parametersHash).not.toBe(hashCanonicalJson({ ...contract,
      utilityScoreVersion: 'utility-reference-z10-v1' }))
    expect(PRODUCTION_STRATEGY.parametersHash).not.toBe(hashCanonicalJson({ ...contract,
      lockedDownRule: { ...UTILITY_LOCKED_DOWN_RULE, maxPreviousCloseReturn: -0.30 } }))
    expect(PRODUCTION_STRATEGY.parametersHash).not.toBe(hashCanonicalJson({ ...contract,
      volatilityScoreReference: { ...VOLATILITY_SCORE_REFERENCE, referenceAtrPercent14: 3 } }))
    expect(PRODUCTION_STRATEGY.parametersHash).not.toBe(hashCanonicalJson({ ...contract,
      model: { ...FROZEN_COMPOSITE_UTILITY_MODEL, normalization: {
        ...FROZEN_COMPOSITE_UTILITY_MODEL.normalization, mean: 0.4,
      } },
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
