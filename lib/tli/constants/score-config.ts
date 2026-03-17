/** 점수 컴포넌트 가중치 및 UI 설정 — 단일 소스 */

import { DEFAULT_TLI_PARAMS, type TLIParams } from './tli-params'

// ── TLI 통합 파라미터 관리 ──

let _overriddenParams: Partial<TLIParams> | null = null

/** 런타임 파라미터 오버라이드 (evaluate.ts 등에서 사용) */
export function setTLIParams(params: Partial<TLIParams> | null) {
  _overriddenParams = params
}

/** 현재 활성 TLI 파라미터 반환. 우선순위: override > env v2 > 기본값 */
export function getTLIParams(): TLIParams {
  const base = { ...DEFAULT_TLI_PARAMS }

  // env var v2: optimized-params.json 로드 시도
  if (!_overriddenParams && typeof process !== 'undefined' && process.env.TLI_PARAMS_VERSION === 'v2') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const optimized = require('../../../scripts/tli-optimizer/optimized-params.json') as Partial<TLIParams>
      return { ...base, ...optimized }
    } catch {
      console.warn('[TLI] TLI_PARAMS_VERSION=v2 but optimized-params.json not found. Using defaults.')
      return base
    }
  }

  if (_overriddenParams) {
    return { ...base, ..._overriddenParams }
  }

  return base
}

/** 노이즈 감쇠 기본 임계값 */
export const MIN_RAW_INTEREST = 5

/** 캘리브레이션된 노이즈 임계값 (ROC 교정 시 업데이트) */
let _calibratedMinRawInterest: number | null = null

/** 캘리브레이션된 노이즈 임계값 설정 (calibrate-noise.ts에서 호출) */
export function setMinRawInterest(value: number) {
  _calibratedMinRawInterest = value
}

/** 현재 노이즈 임계값 반환 (캘리브레이션 우선, 없으면 기본값) */
export function getMinRawInterest(): number {
  return _calibratedMinRawInterest ?? MIN_RAW_INTEREST
}

/** 기본 점수 컴포넌트 가중치 */
export const SCORE_WEIGHTS = {
  interest: 0.40,
  newsMomentum: 0.35,
  volatility: 0.10,
  activity: 0.15,
} as const

/** Entropy 가중치 도메인 바운드 (최소, 최대) */
export const WEIGHT_BOUNDS = {
  interest: [0.25, 0.55] as const,
  newsMomentum: [0.20, 0.45] as const,
  volatility: [0.05, 0.20] as const,
  activity: [0.05, 0.25] as const,
} as const

/** 캘리브레이션된 가중치 (entropy-weights.ts에서 업데이트) */
let _calibratedWeights: { interest: number; newsMomentum: number; volatility: number; activity: number } | null = null

/** 캘리브레이션된 가중치 설정 */
export function setScoreWeights(weights: { interest: number; newsMomentum: number; volatility: number; activity: number }) {
  const sum = weights.interest + weights.newsMomentum + weights.volatility + weights.activity
  if (Math.abs(sum - 1.0) > 0.001) {
    throw new Error(`가중치 합계 ${sum} ≠ 1.0`)
  }
  _calibratedWeights = weights
}

/** 현재 가중치 반환 (캘리브레이션 우선, 없으면 기본값) */
export function getScoreWeights(): { interest: number; newsMomentum: number; volatility: number; activity: number } {
  return _calibratedWeights ?? { ...SCORE_WEIGHTS }
}

/** Confidence 임계값 기본값 */
export const CONFIDENCE_THRESHOLDS = {
  highCoverage: 0.7,
  highDays: 14,
  mediumCoverage: 0.4,
  mediumDays: 7,
} as const

/** 캘리브레이션된 confidence 임계값 (calibrate-confidence.ts에서 업데이트) */
let _calibratedConfidenceThresholds: { highCoverage: number; highDays: number; mediumCoverage: number; mediumDays: number } | null = null

/** 캘리브레이션된 confidence 임계값 설정 */
export function setConfidenceThresholds(thresholds: { highCoverage: number; highDays: number; mediumCoverage: number; mediumDays: number }) {
  _calibratedConfidenceThresholds = thresholds
}

/** 현재 confidence 임계값 반환 (캘리브레이션 우선, 없으면 기본값) */
export function getConfidenceThresholds(): { highCoverage: number; highDays: number; mediumCoverage: number; mediumDays: number } {
  return _calibratedConfidenceThresholds ?? { ...CONFIDENCE_THRESHOLDS }
}

// 기본 가중치 합계 검증
const _weightSum = Object.values(SCORE_WEIGHTS).reduce((s, w) => s + w, 0)
if (Math.abs(_weightSum - 1.0) > 0.001) {
  throw new Error(`SCORE_WEIGHTS 합계 ${_weightSum} ≠ 1.0`)
}

/** 점수 컴포넌트 키 타입 */
export type ScoreComponentKey = keyof typeof SCORE_WEIGHTS

/** 점수 컴포넌트 UI 설정 항목 */
export interface ScoreComponentConfig {
  key: ScoreComponentKey
  label: string
  weight: number
  weightLabel: string
  color: string
  colorFrom: string
  colorTo: string
  glow: string
  bg: string
  border: string
  rawLabel: string
}

/** 점수 컴포넌트 통합 설정 (색상 통일) */
export const SCORE_COMPONENTS: readonly ScoreComponentConfig[] = [
  {
    key: 'interest',
    label: '검색 관심',
    weight: Math.round(SCORE_WEIGHTS.interest * 100),
    weightLabel: `${Math.round(SCORE_WEIGHTS.interest * 100)}%`,
    color: '#10B981',
    colorFrom: '#10B981',
    colorTo: '#059669',
    glow: 'rgba(16, 185, 129, 0.3)',
    bg: 'bg-emerald-500/5',
    border: 'border-emerald-500/20',
    rawLabel: 'recent7dAvg,baseline30dAvg',
  },
  {
    key: 'newsMomentum',
    label: '뉴스 모멘텀',
    weight: Math.round(SCORE_WEIGHTS.newsMomentum * 100),
    weightLabel: `${Math.round(SCORE_WEIGHTS.newsMomentum * 100)}%`,
    color: '#0EA5E9',
    colorFrom: '#0EA5E9',
    colorTo: '#0284C7',
    glow: 'rgba(14, 165, 233, 0.3)',
    bg: 'bg-sky-500/5',
    border: 'border-sky-500/20',
    rawLabel: 'newsThisWeek,newsLastWeek',
  },
  {
    key: 'volatility',
    label: '변동성',
    weight: Math.round(SCORE_WEIGHTS.volatility * 100),
    weightLabel: `${Math.round(SCORE_WEIGHTS.volatility * 100)}%`,
    color: '#8B5CF6',
    colorFrom: '#8B5CF6',
    colorTo: '#7C3AED',
    glow: 'rgba(139, 92, 246, 0.3)',
    bg: 'bg-purple-500/5',
    border: 'border-purple-500/20',
    rawLabel: 'interestStddev',
  },
  {
    key: 'activity',
    label: '활동성',
    weight: Math.round(SCORE_WEIGHTS.activity * 100),
    weightLabel: `${Math.round(SCORE_WEIGHTS.activity * 100)}%`,
    color: '#F59E0B',
    colorFrom: '#F59E0B',
    colorTo: '#D97706',
    glow: 'rgba(245, 158, 11, 0.3)',
    bg: 'bg-amber-500/5',
    border: 'border-amber-500/20',
    rawLabel: 'stockPriceChange,volumeIntensity,dataCoverage',
  },
]
