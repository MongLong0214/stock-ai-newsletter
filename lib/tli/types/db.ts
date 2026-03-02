/** 데이터베이스 모델 인터페이스 */

export type Stage = 'Dormant' | 'Emerging' | 'Growth' | 'Peak' | 'Decline';

/** 표시용 단계 (UI 렌더링에 Reigniting 포함) */
export type DisplayStage = Stage | 'Reigniting';

export interface Theme {
  id: string;
  name: string;
  name_en: string | null;
  description: string | null;
  naver_theme_id: string | null;
  is_active: boolean;
  first_spike_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface ThemeKeyword {
  id: string;
  theme_id: string;
  keyword: string;
  source: 'general' | 'naver' | 'auto_enriched' | 'auto_stock' | 'auto_autocomplete';
  weight: number;
  is_primary: boolean;
}

export interface ThemeStock {
  id: string;
  theme_id: string;
  symbol: string;
  name: string;
  market: 'KOSPI' | 'KOSDAQ';
  source: 'naver' | 'dart' | 'manual';
  is_curated: boolean;
  relevance: number;
  is_active: boolean;
  current_price: number | null;
  price_change_pct: number | null;
  volume: number | null;
}

export interface NewsArticle {
  title: string;
  link: string;
  source: string | null;
  pubDate: string;
}

export interface InterestMetric {
  id: string;
  theme_id: string;
  time: string;
  source: string;
  raw_value: number;
  normalized: number;
}

export interface NewsMetric {
  id: string;
  theme_id: string;
  time: string;
  article_count: number;
  growth_rate: number | null;
}

/** 신뢰도 레벨 */
export type ConfidenceLevel = 'high' | 'medium' | 'low'

/** Score Confidence — 점수 신뢰도 지표 */
export interface ScoreConfidence {
  level: ConfidenceLevel
  dataAge: number
  interestCoverage: number
  newsCoverage: number
  reason: string
}

export interface ScoreComponents {
  interest_score: number;
  news_momentum: number;
  volatility_score: number;
  maturity_ratio: number;
  /** 활동 점수 — 주가/거래량/데이터 성숙도 교차 시그널 (v2 신규, 하위 호환 optional) */
  activity_score?: number;
  weights: {
    interest: number;
    news: number;
    volatility: number;
    activity?: number;
  };
  raw: {
    recent_7d_avg: number;
    baseline_30d_avg: number;
    news_this_week: number;
    news_last_week: number;
    interest_stddev: number;
    active_days: number;
    raw_interest_avg?: number;
    dampening_factor?: number;
    raw_percentile?: number | null;
    /** v2 이중축 필드 */
    level_score?: number;
    momentum_score?: number;
    /** 관심도 선형회귀 기울기 (정규화 전 raw slope) — stage 판정용 */
    interest_slope?: number;
    dvi?: number;
    volume_intensity?: number;
    data_coverage?: number;
    raw_score?: number;
    smoothed_score?: number;
    /** 히스테리시스용: 마르코프 제약 단계 후보 (다음날 비교용) */
    stage_candidate?: string;
    /** Multi-signal sentiment proxy (price + news accel + volume breadth) */
    sentiment_proxy?: number;
    /** 평균 거래량 (다음 실행의 prevAvgVolume 참조용) */
    avg_volume?: number;
  };
  confidence?: ScoreConfidence;
}

export interface LifecycleScore {
  id: string;
  theme_id: string;
  calculated_at: string;
  score: number;
  stage: Stage;
  is_reigniting: boolean;
  stage_changed: boolean;
  prev_stage: Stage | null;
  components: ScoreComponents;
}

export interface ThemeComparison {
  id: string;
  current_theme_id: string;
  past_theme_id: string;
  similarity_score: number;
  current_day: number;
  past_peak_day: number;
  past_total_days: number;
  message: string;
  calculated_at: string;
  /** 3-Pillar 분해 점수 */
  feature_sim: number | null;
  curve_sim: number | null;
  keyword_sim: number | null;
  /** 과거 테마 결과 정보 */
  past_peak_score: number | null;
  past_final_stage: string | null;
  past_decline_days: number | null;
  /** 결과 검증 필드 */
  outcome_verified?: boolean;
  trajectory_correlation?: number | null;
  stage_match?: boolean | null;
  verified_at?: string | null;
}

/** Bootstrap prediction interval (B=1000, 90% CI) */
export interface PredictionInterval {
  lower: number;
  upper: number;
  median: number;
  confidenceLevel: number;
}

export interface ComparisonCalibration {
  id: string;
  calculated_at: string;
  total_verified: number;
  avg_trajectory_corr: number | null;
  stage_match_rate: number | null;
  feature_corr_when_accurate: number | null;
  curve_corr_when_accurate: number | null;
  keyword_corr_when_accurate: number | null;
  feature_corr_when_inaccurate: number | null;
  curve_corr_when_inaccurate: number | null;
  keyword_corr_when_inaccurate: number | null;
  suggested_threshold: number | null;
  suggested_sector_penalty: number | null;
  details: Record<string, unknown> | null;
  created_at: string;
}
