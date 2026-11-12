import { createHash } from 'node:crypto'

import { BULLISH_TARGET_PARAMETERS, LOW_VOLATILITY_STABLE_PARAMETERS, UTILITY_HIT_RANK_BLEND, UTILITY_LOCKED_DOWN_RULE, type VolumeBreakoutParameters } from '@/scripts/stock-picks/strategies'
import frozenTargetModel from '@/scripts/stock-picks/models/bullish-target-v3.json'
import type { TargetModelArtifact } from '@/scripts/stock-picks/target-model'
import { SIGNAL_SCORE_VERSION, VOLATILITY_SCORE_REFERENCE } from '@/scripts/stock-picks/signals'
import frozenReturnModel from '@/scripts/stock-picks/models/composite-return-v9.json'
import { INVESTOR_FLOW_WINDOW_TRADING_DAYS, MIN_INVESTOR_FLOW_COVERAGE } from '@/scripts/stock-picks/investor-flow'
import { MODEL_MARKET_SOURCE_VERSION, OBSERVED_FLOW_INPUT_VERSION } from '@/scripts/stock-picks/observed-inputs'
import { RETURN_SCORE_VERSION, validateUtilityModel, type UtilityModelArtifact } from '@/scripts/stock-picks/utility-model'

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value)
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('canonical JSON은 유한수만 허용합니다')
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (typeof value === 'object') {
    const entries = Object.entries(value as Readonly<Record<string, unknown>>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    return `{${entries.map(([key, entryValue]) => (
      `${JSON.stringify(key)}:${canonicalJson(entryValue)}`
    )).join(',')}}`
  }
  throw new Error(`canonical JSON으로 직렬화할 수 없는 값입니다: ${typeof value}`)
}

export function hashCanonicalJson(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex')
}

/**
 * optimize-v3(2026-08-28, 공급 하한 반영)의 volumeBreakoutNoGapUp 최빈 fold 선택값.
 * 이 객체는 프로덕션과 frozen 연구 평가가 공유하는 단일 파라미터 원본이다.
 */
export const PRODUCTION_VOLUME_BREAKOUT_PARAMETERS: VolumeBreakoutParameters = {
  minTurnover: 500_000_000,
  minScore: 0,
  minVolumePercentile: 90,
  minDistanceFromHighPercent: 0,
  maxRsi: 75,
  excludeGapUp: true,
}

export const LEGACY_VOLUME_BREAKOUT_STRATEGY = {
  name: 'volumeBreakoutNoGapUp+volumeOnlyFill',
  version: 'v1.1-2026-09-07',
  parameters: PRODUCTION_VOLUME_BREAKOUT_PARAMETERS,
  fillTiers: ['breakout', 'volumeOnly'] as const,
  parametersHash: hashCanonicalJson({
    parameters: PRODUCTION_VOLUME_BREAKOUT_PARAMETERS,
    fillTiers: ['breakout', 'volumeOnly'],
    gateVersion: 'status-flags-valid-candle-v2',
  }),
} as const

export const LOW_VOLATILITY_STABLE_STRATEGY = {
  name: 'lowVolatilityStable',
  version: 'v2-2026-09-23',
  parameters: LOW_VOLATILITY_STABLE_PARAMETERS,
  parametersHash: hashCanonicalJson({
    parameters: LOW_VOLATILITY_STABLE_PARAMETERS,
    gateVersion: 'status-flags-valid-candle-v2',
    preferredRule: 'krx-code-last-digit-nonzero',
  }),
} as const

export const FROZEN_BULLISH_TARGET_MODEL = frozenTargetModel as TargetModelArtifact & {
  readonly trainedLabelsThrough: string
}

/** 동결한 v3 모델은 연구 섀도우에서만 평가한다. */
export const BULLISH_TARGET_STRATEGY = {
  name: 'bullishTarget5d',
  version: 'v3-2026-09-29',
  objective: 'bullishThenTouch10Within5TradingDays',
  parameters: BULLISH_TARGET_PARAMETERS,
  parametersHash: hashCanonicalJson({
    parameters: BULLISH_TARGET_PARAMETERS,
    model: FROZEN_BULLISH_TARGET_MODEL,
    gateVersion: 'status-flags-valid-candle-v2',
    preferredRule: 'krx-code-last-digit-nonzero',
  }),
} as const

/** v9: v8과 같은 수익 머리(11/11 종가까지 재학습)에 같은 65개 입력의 타율 머리(5일 순수익 > 0 로그오즈)를 더했다. */
export const FROZEN_COMPOSITE_RETURN_MODEL = validateUtilityModel(frozenReturnModel as UtilityModelArtifact)

export const PRODUCTION_STRATEGY = {
  name: 'compositeUtility',
  version: 'v9-2026-11-12',
  objective: 'compositeUtility',
  parameters: LOW_VOLATILITY_STABLE_PARAMETERS,
  parametersHash: hashCanonicalJson({
    parameters: LOW_VOLATILITY_STABLE_PARAMETERS,
    gateVersion: 'status-flags-valid-candle-v2',
    preferredRule: 'krx-code-last-digit-nonzero',
    signalScoreVersion: SIGNAL_SCORE_VERSION,
    volatilityScoreReference: VOLATILITY_SCORE_REFERENCE,
    observedInputVersion: OBSERVED_FLOW_INPUT_VERSION,
    investorFlowSource: 'kis-FHPTJ04160001-signal-date-close',
    investorFlowWindowTradingDays: INVESTOR_FLOW_WINDOW_TRADING_DAYS,
    minInvestorFlowCoverage: MIN_INVESTOR_FLOW_COVERAGE,
    modelMarketSourceVersion: MODEL_MARKET_SOURCE_VERSION,
    utilityScoreVersion: RETURN_SCORE_VERSION,
    lockedDownRule: UTILITY_LOCKED_DOWN_RULE,
    ...UTILITY_HIT_RANK_BLEND,
    model: FROZEN_COMPOSITE_RETURN_MODEL,
  }),
} as const
