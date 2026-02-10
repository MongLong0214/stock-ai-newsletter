/** 데이터베이스 모델 인터페이스 */

export type Stage = 'Dormant' | 'Early' | 'Growth' | 'Peak' | 'Decay';

/** Display stage (includes Reigniting for UI rendering) */
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
  sentimentScore?: number | null;
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

export interface ScoreComponents {
  interest_score: number;
  news_momentum: number;
  sentiment_score: number;
  volatility_score: number;
  maturity_ratio: number;
  weights: {
    interest: number;
    news: number;
    sentiment: number;
    volatility: number;
  };
  raw: {
    recent_7d_avg: number;
    baseline_30d_avg: number;
    news_this_week: number;
    news_last_week: number;
    interest_stddev: number;
    active_days: number;
    sentiment_avg?: number;
    sentiment_article_count?: number;
    raw_interest_avg?: number;
    dampening_factor?: number;
    raw_percentile?: number | null;
  };
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
