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

export type ComparisonRunType = 'prod' | 'shadow' | 'backtest'
export type ComparisonCandidatePool = 'archetype' | 'peer' | 'mixed_legacy'
export type ComparisonRunStatus = 'pending' | 'materializing' | 'complete' | 'published' | 'failed' | 'rolled_back'

export interface ThemeComparisonRunV2 {
  id: string
  run_date: string
  current_theme_id: string
  algorithm_version: string
  run_type: ComparisonRunType
  candidate_pool: ComparisonCandidatePool
  threshold_policy_version: string
  source_data_cutoff_date: string
  comparison_spec_version: string
  status: ComparisonRunStatus
  publish_ready: boolean
  expected_candidate_count: number
  materialized_candidate_count: number
  expected_snapshot_count: number
  materialized_snapshot_count: number
  attempt_no: number
  checkpoint_cursor: Record<string, unknown> | null
  last_error: string | null
  started_at: string | null
  completed_at: string | null
  published_at: string | null
  created_at: string
}

export interface ThemeComparisonCandidateV2 {
  run_id: string
  candidate_theme_id: string
  rank: number
  similarity_score: number
  feature_sim: number | null
  curve_sim: number | null
  keyword_sim: number | null
  current_day: number
  past_peak_day: number
  past_total_days: number
  estimated_days_to_peak: number
  message: string
  past_peak_score: number | null
  past_final_stage: string | null
  past_decline_days: number | null
  is_selected_top3: boolean
}

export interface ThemeComparisonEvalV2 {
  run_id: string
  candidate_theme_id: string
  evaluation_horizon_days: number
  trajectory_corr_h14: number | null
  position_stage_match_h14: boolean | null
  binary_relevant: boolean
  graded_gain: number
  censored_reason: string | null
  evaluated_at: string
}

export interface PredictionSnapshotV2 {
  id: string
  theme_id: string
  snapshot_date: string
  comparison_run_id: string
  comparison_count: number
  avg_similarity: number
  phase: string
  confidence: string
  risk_level: string
  momentum: string
  avg_peak_day: number
  avg_total_days: number
  avg_days_to_peak: number
  current_progress: number
  days_since_spike: number
  best_scenario: Record<string, unknown> | null
  median_scenario: Record<string, unknown> | null
  worst_scenario: Record<string, unknown> | null
  prediction_intervals?: Record<string, unknown> | null
  status: string
  created_at: string
  algorithm_version: string
  run_type: ComparisonRunType
  candidate_pool: ComparisonCandidatePool
  evaluation_horizon_days: number
  comparison_spec_version: string
  evaluated_at: string | null
  actual_score: number | null
  actual_stage: string | null
  phase_correct: boolean | null
  peak_timing_error_days: number | null
}

export interface ThemeStateHistoryV2 {
  theme_id: string
  effective_from: string
  effective_to: string | null
  is_active: boolean
  closed_at: string | null
  first_spike_date: string | null
  state_version: string
}

export interface ComparisonBackfillManifestV2 {
  manifest_id: string
  source_table: string
  source_row_count: number
  target_row_count: number
  row_count_parity_ok: boolean
  sample_contract_parity_ok: boolean
  executed_at: string
  notes: string | null
}

export interface ComparisonV4Control {
  id: string
  production_version: string
  serving_enabled: boolean
  promoted_by: string
  promoted_at: string
  created_at: string
}
