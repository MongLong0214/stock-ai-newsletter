/** 점수 컴포넌트 가중치 및 UI 설정 — tli-params.ts가 단일 소스 */

import { DEFAULT_TLI_PARAMS, computeWActivity } from './tli-params'

/** 노이즈 감쇠 기본 임계값 — tli-params에서 파생 */
export const MIN_RAW_INTEREST = DEFAULT_TLI_PARAMS.min_raw_interest

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

/**
 * 앵커 척도 노이즈 감쇠 임계값
 *
 * `min_raw_interest(4)`는 앵커 이전 raw_value 스케일에 맞춰져 있어 앵커 척도에 그대로 쓸 수 없다
 * (두 값의 크기가 세 자릿수 다르다). 단위를 기계적으로 환산하면 앵커 도입으로 이미 어긋난
 * 감쇠율을 그대로 박제하므로, **감쇠 대상 비율**을 기준으로 역산했다.
 *
 * 실측(2026-07-26, 프로덕션): 앵커 이전 체제(base ≤ 2026-06-06)에서 min_raw_interest=4가
 * 감쇠하던 테마 비율은 36.9%였다. 현재 앵커 척도 분포에서 같은 36.9%를 재현하는 값이
 * 0.0031이고, 이를 0.003으로 둔다(감쇠 대상 36.5%). 같은 시점 raw_value 기준 감쇠율은
 * 88.1%까지 폭주해 있었다.
 *
 * 이 값은 앵커 키워드가 바뀌면 다시 역산해야 한다 (PRD §5.4.1의 CV>0.3 앵커 교체 경로).
 */
export const MIN_ANCHOR_INTEREST = 0.003

let _calibratedMinAnchorInterest: number | null = null

/** 캘리브레이션된 앵커 노이즈 임계값 설정 */
export function setMinAnchorInterest(value: number) {
  _calibratedMinAnchorInterest = value
}

/** 현재 앵커 노이즈 임계값 반환 (캘리브레이션 우선, 없으면 기본값) */
export function getMinAnchorInterest(): number {
  return _calibratedMinAnchorInterest ?? MIN_ANCHOR_INTEREST
}

/**
 * 척도에 맞는 노이즈 감쇠 임계값 — 계산기가 쓰는 단일 진입점
 *
 * 두 척도의 임계값은 크기가 세 자릿수 다르므로 서로 대체할 수 없다.
 */
export function getNoiseFloor(scale: 'raw' | 'anchor'): number {
  return scale === 'anchor' ? getMinAnchorInterest() : getMinRawInterest()
}

/**
 * 해당 척도에 실제로 적용되는 캘리브레이션 값이 있는지
 *
 * `calibrate-noise.ts`는 raw 척도로만 임계값을 산출한다. 앵커 척도로 도는 런에서
 * raw 캘리브레이션을 적재하면 **조용히 무시**되므로, 호출부가 이 상태를 드러내야 한다.
 */
export function describeNoiseFloorCalibration(scale: 'raw' | 'anchor'): {
  readonly applied: number | null
  readonly ignoredRawCalibration: number | null
} {
  if (scale === 'anchor') {
    return { applied: _calibratedMinAnchorInterest, ignoredRawCalibration: _calibratedMinRawInterest }
  }
  return { applied: _calibratedMinRawInterest, ignoredRawCalibration: null }
}

/** 기본 점수 컴포넌트 가중치 — tli-params에서 파생 */
export const SCORE_WEIGHTS = {
  interest: DEFAULT_TLI_PARAMS.w_interest,
  newsMomentum: DEFAULT_TLI_PARAMS.w_newsMomentum,
  volatility: DEFAULT_TLI_PARAMS.w_volatility,
  activity: computeWActivity(DEFAULT_TLI_PARAMS),
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
