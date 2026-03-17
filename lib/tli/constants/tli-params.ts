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

  // ── Activity (5개) ──
  price_sigmoid_scale: number
  volume_log_scale: number
  coverage_days: number
  activity_vs_sentiment_ratio: number
  level_dampening_threshold: number

  // ── Sentiment Proxy (3개, sent_volume_weight = 1.0 - price - news) ──
  sent_price_weight: number
  sent_news_weight: number
  sent_volume_scale: number

  // ── Stage Bypass (2개) ──
  peak_bypass_news: number
  decline_score_ratio: number

  // ── Smoothing Fine-tune (1개) ──
  min_daily_change: number

  // ── Cautious Decay (1개, Step 2 신규) ──
  cautious_floor_ratio: number
}

/** 현재 하드코딩 값과 동일한 기본 파라미터 */
export const DEFAULT_TLI_PARAMS: Readonly<TLIParams> = {
  // Scoring Weights
  w_interest: 0.40,
  w_newsMomentum: 0.35,
  w_volatility: 0.10,

  // Stage Thresholds
  stage_dormant: 15,
  stage_emerging: 40,
  stage_growth: 58,
  stage_peak: 68,
  trend_threshold: 0.10,

  // Smoothing Core
  ema_alpha: 0.4,
  min_raw_interest: 5,

  // Interest
  interest_level_center: 30,
  interest_level_scale: 20,
  interest_momentum_scale: 1.5,
  interest_level_ratio: 0.6,

  // News
  news_log_scale: 50,
  news_momentum_scale: 1.0,
  news_volume_ratio: 0.6,
  min_news_last_week: 3,

  // Volatility
  vol_center: 15,
  vol_scale: 10,

  // Activity
  price_sigmoid_scale: 5,
  volume_log_scale: 50_000_000,
  coverage_days: 14,
  activity_vs_sentiment_ratio: 0.7,
  level_dampening_threshold: 0.1,

  // Sentiment Proxy
  sent_price_weight: 0.50,
  sent_news_weight: 0.30,
  sent_volume_scale: 0.5,

  // Stage Bypass
  peak_bypass_news: 30,
  decline_score_ratio: 0.85,

  // Smoothing Fine-tune
  min_daily_change: 10,

  // Cautious Decay
  cautious_floor_ratio: 0.90,
}

/** 계산값: w_activity = 1.0 - (w_interest + w_newsMomentum + w_volatility) */
export function computeWActivity(params: TLIParams): number {
  return 1.0 - (params.w_interest + params.w_newsMomentum + params.w_volatility)
}

/** 계산값: sent_volume_weight = 1.0 - (sent_price_weight + sent_news_weight) */
export function computeSentVolumeWeight(params: TLIParams): number {
  return 1.0 - (params.sent_price_weight + params.sent_news_weight)
}
