/** TLI 파라미터 통합 인터페이스 — Bayesian Optimization 탐색 공간 대응 */

/** 32개 탐색 파라미터 (계산값 w_activity, sent_volume_weight 제외) */
export interface TLIParams {
  // ── Scoring Weights (3개, w_activity = 1.0 - sum) ──
  w_interest: number
  w_newsMomentum: number
  w_volatility: number

  // ── Stage Thresholds (5개, 단조 증가: dormant < emerging < growth < peak) ──
  stage_dormant: number
  stage_emerging: number
  stage_growth: number
  stage_peak: number
  trend_threshold: number

  // ── Smoothing Core (2개) ──
  ema_alpha: number
  min_raw_interest: number

  // ── Interest (4개) ──
  interest_level_center: number
  interest_level_scale: number
  interest_momentum_scale: number
  interest_level_ratio: number

  // ── News (4개) ──
  news_log_scale: number
  news_momentum_scale: number
  news_volume_ratio: number
  min_news_last_week: number

  // ── Volatility (2개) ──
  vol_center: number
  vol_scale: number

  // ── Activity (8개) ──
  price_sigmoid_scale: number
  volume_log_scale: number
  coverage_days: number
  activity_vs_sentiment_ratio: number
  level_dampening_threshold: number
  activity_price_weight: number
  activity_volume_weight: number
  activity_coverage_weight: number

  // ── Sentiment Proxy (3개, sent_volume_weight = 1.0 - price - news) ──
  sent_price_weight: number
  sent_news_weight: number
  sent_volume_scale: number

  // ── Stage Bypass (2개) ──
  peak_bypass_news: number
  decline_score_ratio: number

  // ── Smoothing Fine-tune (1개) ──
  min_daily_change: number

  // ── Cautious Decay (1개) ──
  cautious_floor_ratio: number

  // ── EMA Schedule (3개) ──
  ema_alpha_fresh: number
  ema_alpha_mature: number
  ema_schedule_days: number

  // ── Confidence (2개) ──
  confidence_interest_weight: number
  confidence_news_weight: number

  // ── Prediction (5개) ──
  momentum_accel_threshold: number
  momentum_decel_threshold: number
  momentum_min_ratio: number
  phase_rising_ratio: number
  phase_cooling_ratio: number

  // ── Comparison (5개) ──
  curve_shape_weight: number
  curve_derivative_weight: number
  curve_dtw_weight: number
  lifecycle_post_peak_weight: number
  lifecycle_drawdown_weight: number
}

/** Bayesian Optimized 기본 파라미터 (2026-03-17, GDDA 53.5% → 66.6%, val 64.9%) */
export const DEFAULT_TLI_PARAMS: Readonly<TLIParams> = {
  // Scoring Weights — 뉴스 모멘텀 비중 증가, 관심도 비중 소폭 감소
  w_interest: 0.304148,
  w_newsMomentum: 0.366408,
  w_volatility: 0.104017,

  // Stage Thresholds — Growth 진입 소폭 상향, Peak 소폭 상향
  stage_dormant: 10,
  stage_emerging: 40,
  stage_growth: 61,
  stage_peak: 71,
  trend_threshold: 0.163507,

  // Smoothing Core
  ema_alpha: 0.416554,
  min_raw_interest: 4,

  // Interest — sigmoid 중심 상향 + 가파른 곡선
  interest_level_center: 45.793311,
  interest_level_scale: 10.799847,
  interest_momentum_scale: 1.5,
  interest_level_ratio: 0.576366,

  // News — log scale 확대
  news_log_scale: 64.338194,
  news_momentum_scale: 1.324128,
  news_volume_ratio: 0.6,
  min_news_last_week: 3,

  // Volatility — 중심 하향
  vol_center: 10.752023,
  vol_scale: 10,

  // Activity
  price_sigmoid_scale: 5,
  volume_log_scale: 50_000_000,
  coverage_days: 14,
  activity_vs_sentiment_ratio: 0.727894,
  level_dampening_threshold: 0.1,
  activity_price_weight: 0.5,
  activity_volume_weight: 0.3,
  activity_coverage_weight: 0.2,

  // Sentiment Proxy
  sent_price_weight: 0.50,
  sent_news_weight: 0.30,
  sent_volume_scale: 0.5,

  // Stage Bypass
  peak_bypass_news: 30,
  decline_score_ratio: 0.860943,

  // Smoothing Fine-tune
  min_daily_change: 10,

  // Cautious Decay — floor 비율 상향 (더 보수적)
  cautious_floor_ratio: 0.946661,

  // EMA Schedule — 신생/성숙 테마 반응 속도
  ema_alpha_fresh: 0.6,
  ema_alpha_mature: 0.3,
  ema_schedule_days: 30,

  // Confidence — 데이터 커버리지 가중치
  confidence_interest_weight: 0.6,
  confidence_news_weight: 0.4,

  // Prediction — 모멘텀/Phase 판단 임계값
  momentum_accel_threshold: 0.7,
  momentum_decel_threshold: 1.1,
  momentum_min_ratio: 0.4,
  phase_rising_ratio: 0.8,
  phase_cooling_ratio: 1.2,

  // Comparison — 곡선 유사도 + Lifecycle 가중치
  curve_shape_weight: 0.35,
  curve_derivative_weight: 0.30,
  curve_dtw_weight: 0.35,
  lifecycle_post_peak_weight: 0.6,
  lifecycle_drawdown_weight: 0.4,
}

// ── 런타임 파라미터 관리 ──

let _overriddenParams: Partial<TLIParams> | null = null

/** 런타임 파라미터 오버라이드 (evaluate.ts 등에서 사용) */
export function setTLIParams(params: Partial<TLIParams> | null) {
  _overriddenParams = params
}

/** 현재 활성 TLI 파라미터 반환. 우선순위: override > env v2 > 기본값 */
export function getTLIParams(): TLIParams {
  const base = { ...DEFAULT_TLI_PARAMS }

  if (!_overriddenParams && typeof process !== 'undefined' && process.env.TLI_PARAMS_VERSION === 'v2') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const optimized = require('../../../scripts/tli-optimizer/optimized-params.json') as Partial<TLIParams>
      return { ...base, ...optimized }
    } catch {
      console.error('[TLI] TLI_PARAMS_VERSION=v2 but optimized-params.json not found. Using defaults.')
      return base
    }
  }

  if (_overriddenParams) {
    return { ...base, ..._overriddenParams }
  }

  return base
}

/** 계산값: w_activity = 1.0 - (w_interest + w_newsMomentum + w_volatility) */
export function computeWActivity(params: TLIParams): number {
  return 1.0 - (params.w_interest + params.w_newsMomentum + params.w_volatility)
}

/** 계산값: sent_volume_weight = 1.0 - (sent_price_weight + sent_news_weight) */
export function computeSentVolumeWeight(params: TLIParams): number {
  return 1.0 - (params.sent_price_weight + params.sent_news_weight)
}
