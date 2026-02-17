/** 점수 컴포넌트 가중치 및 UI 설정 — 단일 소스 */

/** 점수 컴포넌트 가중치 */
export const SCORE_WEIGHTS = {
  interest: 0.40,
  newsMomentum: 0.35,
  volatility: 0.10,
  activity: 0.15,
} as const

// 가중치 합계 검증 (1.0이 아니면 즉시 에러)
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
