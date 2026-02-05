export type Stage = 'Dormant' | 'Early' | 'Growth' | 'Peak' | 'Decay';

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
  source: 'general' | 'naver' | 'bigkinds';
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
  volatility_score: number;
  maturity_ratio: number;
  weights: {
    interest: number;
    news: number;
    volatility: number;
    maturity: number;
  };
  raw: {
    recent_7d_avg: number;
    baseline_30d_avg: number;
    news_this_week: number;
    news_last_week: number;
    interest_stddev: number;
    active_days: number;
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
}

export interface ThemeListItem {
  id: string;
  name: string;
  nameEn: string | null;
  score: number;
  stage: Stage;
  stageKo: string;
  change7d: number;
  stockCount: number;
  isReigniting: boolean;
  updatedAt: string;
}

export interface ThemeDetail {
  id: string;
  name: string;
  nameEn: string | null;
  description: string | null;
  score: {
    value: number;
    stage: Stage;
    stageKo: string;
    updatedAt: string;
    change24h: number;
    change7d: number;
    components: {
      interest: number;
      newsMomentum: number;
      volatility: number;
      maturity: number;
    };
  };
  stocks: Array<{
    symbol: string;
    name: string;
    market: string;
    source: string;
    relevance: number;
  }>;
  comparisons: Array<{
    pastTheme: string;
    similarity: number;
    currentDay: number;
    pastPeakDay: number;
    estimatedDaysToPeak: number;
    postPeakDecline: number | null;
    message: string;
  }>;
  lifecycleCurve: Array<{
    date: string;
    score: number;
  }>;
}

export interface ThemeRanking {
  early: ThemeListItem[];
  growth: ThemeListItem[];
  peak: ThemeListItem[];
  decay: ThemeListItem[];
  reigniting: ThemeListItem[];
}

export const STAGE_CONFIG = {
  Dormant: { color: '#64748B', label: '관심 없음', labelEn: 'Dormant', bg: 'bg-slate-500/20', border: 'border-slate-500/30', text: 'text-slate-400' },
  Early:   { color: '#10B981', label: '초기',     labelEn: 'Early',   bg: 'bg-emerald-500/20', border: 'border-emerald-500/30', text: 'text-emerald-400' },
  Growth:  { color: '#0EA5E9', label: '성장',     labelEn: 'Growth',  bg: 'bg-sky-500/20', border: 'border-sky-500/30', text: 'text-sky-400' },
  Peak:    { color: '#F59E0B', label: '과열',     labelEn: 'Peak',    bg: 'bg-amber-500/20', border: 'border-amber-500/30', text: 'text-amber-400' },
  Decay:   { color: '#EF4444', label: '말기',     labelEn: 'Decay',   bg: 'bg-red-500/20', border: 'border-red-500/30', text: 'text-red-400' },
} as const;

export function getStageKo(stage: Stage): string {
  return STAGE_CONFIG[stage].label;
}
