import { describe, expect, it } from 'vitest'

import {
  BULLISH_TARGET_STRATEGY,
  FROZEN_BULLISH_TARGET_MODEL,
  FROZEN_COMPOSITE_RETURN_MODEL,
  LEGACY_VOLUME_BREAKOUT_STRATEGY,
  LOW_VOLATILITY_STABLE_STRATEGY,
  PRODUCTION_STRATEGY,
  PRODUCTION_VOLUME_BREAKOUT_PARAMETERS,
  canonicalJson,
  hashCanonicalJson,
} from '@/scripts/stock-picks/production-strategy'
import { BULLISH_TARGET_PARAMETERS, LOW_VOLATILITY_STABLE_PARAMETERS, UTILITY_HIT_RANK_BLEND, UTILITY_LOCKED_DOWN_RULE } from '@/scripts/stock-picks/strategies'
import { RETURN_SCORE_VERSION } from '@/scripts/stock-picks/utility-model'
import { SIGNAL_SCORE_VERSION, VOLATILITY_SCORE_REFERENCE } from '@/scripts/stock-picks/signals'
import { MODEL_MARKET_SOURCE_VERSION, OBSERVED_FLOW_INPUT_NAMES, OBSERVED_FLOW_INPUT_VERSION, OBSERVED_INPUT_VERSION } from '@/scripts/stock-picks/observed-inputs'
import { INVESTOR_FLOW_WINDOW_TRADING_DAYS, MIN_INVESTOR_FLOW_COVERAGE } from '@/scripts/stock-picks/investor-flow'
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

  it('identifies the frozen v9 model, investor-flow inputs, per-date hit-head blend, locked-down rule and market source contract', () => {
    expect(SIGNAL_SCORE_VERSION).toBe('technical-signals-v3-2026-10-02')
    expect(MODEL_MARKET_SOURCE_VERSION).toBe('kis-market-21-20-v1')
    expect(OBSERVED_FLOW_INPUT_VERSION).toBe(`${OBSERVED_INPUT_VERSION}+kis-investor-flow-15-v1-2026-11-02`)
    expect(UTILITY_HIT_RANK_BLEND).toEqual({
      rankAdjustment: 'mean-of-pool-z-return-pred-and-hit-log-odds-in-return-units', hitWeight: 1,
      statsPool: 'gated-pre-cooldown', scoreCurve: 'model-return-reference-smooth',
    })
    const contract = {
      parameters: LOW_VOLATILITY_STABLE_PARAMETERS,
      gateVersion: 'status-flags-valid-candle-v2', preferredRule: 'krx-code-last-digit-nonzero',
      signalScoreVersion: SIGNAL_SCORE_VERSION, observedInputVersion: OBSERVED_FLOW_INPUT_VERSION,
      investorFlowSource: 'kis-FHPTJ04160001-signal-date-close',
      investorFlowWindowTradingDays: INVESTOR_FLOW_WINDOW_TRADING_DAYS,
      minInvestorFlowCoverage: MIN_INVESTOR_FLOW_COVERAGE,
      modelMarketSourceVersion: MODEL_MARKET_SOURCE_VERSION,
      utilityScoreVersion: RETURN_SCORE_VERSION, lockedDownRule: UTILITY_LOCKED_DOWN_RULE,
      volatilityScoreReference: VOLATILITY_SCORE_REFERENCE,
      ...UTILITY_HIT_RANK_BLEND,
      model: FROZEN_COMPOSITE_RETURN_MODEL,
    }
    expect(PRODUCTION_STRATEGY).toEqual({
      name: 'compositeUtility',
      version: 'v9-2026-11-12',
      objective: 'compositeUtility',
      parameters: LOW_VOLATILITY_STABLE_PARAMETERS,
      parametersHash: hashCanonicalJson(contract),
    })
    expect(INVESTOR_FLOW_WINDOW_TRADING_DAYS).toBe(30)
    expect(MIN_INVESTOR_FLOW_COVERAGE).toBe(0.95)
    expect(PRODUCTION_STRATEGY.parameters).toBe(LOW_VOLATILITY_STABLE_STRATEGY.parameters)
    expect(PRODUCTION_STRATEGY.parametersHash).not.toBe(LOW_VOLATILITY_STABLE_STRATEGY.parametersHash)
    expect(PRODUCTION_STRATEGY.parametersHash).toBe('156140d8038bf108d25202e49d163758cb9431f3c0ead099d84fe22a00865805')
    // Technical categories retain their original frozen calibration; the composite refit is separate.
    expect(VOLATILITY_SCORE_REFERENCE).toMatchObject({
      referenceAtrPercent14: 5.221735562010756, referenceRows: 506470, referencePanels: 421,
      referenceThrough: '2026-09-29', referenceLastSignal: '2026-09-18',
      weighting: 'equal signal date, strict matured training rows',
      fitInputSha256: '7e390305a071d6dbb57d9b3800eb880b5ca6abcb066347f6f4fe12340bcc9ed2',
    })
    expect(FROZEN_COMPOSITE_RETURN_MODEL).toMatchObject({
      schemaVersion: 6, modelVersion: 'composite-return-v9', trainedLabelsThrough: '2026-11-11',
      observedInputVersion: OBSERVED_FLOW_INPUT_VERSION, featureNames: OBSERVED_FLOW_INPUT_NAMES,
      targetDefinition: { version: 'demeaned-tp7-net-v1',
        formula: 'touch7=floor(max(D1..D5 high)+.5)*100 >= floor(entry+.5)*107; net=(touch7 ? .07 : D5close/entry-1)-costBps/10000; y=net-dateMean(net)', horizon: 5,
        takeProfit: .07, cost: 'krx-realistic-v1', demean: 'signal-date strict rows' },
      hitTargetDefinition: { version: 'net-positive-d5-v1', formula: 'hit = D5close/entry-1-costBps/10000 > 0',
        horizon: 5, cost: 'krx-realistic-v1', output: 'log-odds' },
      normalization: {
        version: RETURN_SCORE_VERSION, center: 50, oneStandardDeviationScore: 70, tailCurvature: 5.25,
        referencePanels: 409, referenceRows: 492739, referenceThrough: '2026-11-11',
        referenceLastSignal: '2026-11-04', source: 'kis',
        weighting: 'equal signal date, strict matured training rows',
      },
    })
    if (FROZEN_COMPOSITE_RETURN_MODEL.schemaVersion !== 6) throw new Error('Expected return and hit predictors')
    expect(FROZEN_COMPOSITE_RETURN_MODEL.trees).toHaveLength(200)
    expect(FROZEN_COMPOSITE_RETURN_MODEL.hitHead.trees).toHaveLength(200)
    expect(PRODUCTION_STRATEGY.parametersHash).not.toBe(hashCanonicalJson({ ...contract,
      observedInputVersion: `${OBSERVED_FLOW_INPUT_VERSION}-changed` }))
    expect(PRODUCTION_STRATEGY.parametersHash).not.toBe(hashCanonicalJson({ ...contract,
      observedInputVersion: OBSERVED_INPUT_VERSION }))
    expect(PRODUCTION_STRATEGY.parametersHash).not.toBe(hashCanonicalJson({ ...contract,
      investorFlowWindowTradingDays: 20 }))
    expect(PRODUCTION_STRATEGY.parametersHash).not.toBe(hashCanonicalJson({ ...contract,
      minInvestorFlowCoverage: 0.9 }))
    expect(PRODUCTION_STRATEGY.parametersHash).not.toBe(hashCanonicalJson({ ...contract,
      modelMarketSourceVersion: `${MODEL_MARKET_SOURCE_VERSION}-changed` }))
    expect(PRODUCTION_STRATEGY.parametersHash).toBe(hashCanonicalJson(contract))
    expect(PRODUCTION_STRATEGY.parametersHash).not.toBe(hashCanonicalJson({ ...contract,
      rankAdjustment: 'model-integer-score' }))
    expect(PRODUCTION_STRATEGY.parametersHash).not.toBe(hashCanonicalJson({ ...contract, hitWeight: 0.5 }))
    expect(PRODUCTION_STRATEGY.parametersHash).not.toBe(hashCanonicalJson({ ...contract, statsPool: 'post-cooldown' }))
    expect(PRODUCTION_STRATEGY.parametersHash).not.toBe(hashCanonicalJson({ ...contract,
      scoreCurve: 'per-date-z-linear-clamp' }))
    expect(PRODUCTION_STRATEGY.parametersHash).not.toBe(hashCanonicalJson({ ...contract,
      utilityScoreVersion: 'utility-reference-z10-v1' }))
    expect(PRODUCTION_STRATEGY.parametersHash).not.toBe(hashCanonicalJson({ ...contract,
      lockedDownRule: { ...UTILITY_LOCKED_DOWN_RULE, maxPreviousCloseReturn: -0.30 } }))
    expect(PRODUCTION_STRATEGY.parametersHash).not.toBe(hashCanonicalJson({ ...contract,
      volatilityScoreReference: { ...VOLATILITY_SCORE_REFERENCE, referenceAtrPercent14: 3 } }))
    expect(PRODUCTION_STRATEGY.parametersHash).not.toBe(hashCanonicalJson({ ...contract,
      model: { ...FROZEN_COMPOSITE_RETURN_MODEL, normalization: {
        ...FROZEN_COMPOSITE_RETURN_MODEL.normalization, mean: 0.4,
      } },
    }))
    expect(PRODUCTION_STRATEGY.parametersHash).not.toBe(hashCanonicalJson({ ...contract,
      model: { ...FROZEN_COMPOSITE_RETURN_MODEL, hitHead: {
        ...FROZEN_COMPOSITE_RETURN_MODEL.hitHead, baselinePrediction: 0,
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
