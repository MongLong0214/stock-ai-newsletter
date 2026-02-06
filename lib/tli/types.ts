/** TLI 라이프사이클 관련 타입 정의 */

/** API 응답 공통 래퍼 */
export interface ApiResponse<T> {
  success: boolean
  data: T
  error?: { message: string }
}

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
  source: 'general' | 'naver';
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

/** 테마 목록 아이템 (카드 표시용) */
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
  /** 최근 7일 점수 추이 (스파크라인용) */
  sparkline: number[];
  /** 주요 키워드 (최대 3개) */
  keywords: string[];
  /** 뉴스 기사 수 (최근 7일 합계) */
  newsCount7d: number;
}

/** 테마 상세 정보 */
export interface ThemeDetail {
  id: string;
  name: string;
  nameEn: string | null;
  description: string | null;
  /** 첫 급등일 */
  firstSpikeDate: string | null;
  /** 주요 키워드 목록 */
  keywords: string[];
  score: {
    value: number;
    stage: Stage;
    stageKo: string;
    updatedAt: string;
    change24h: number;
    change7d: number;
    isReigniting: boolean;
    components: {
      interest: number;
      newsMomentum: number;
      volatility: number;
    };
    /** raw 수치 (툴팁/상세용) */
    raw: {
      recent7dAvg: number;
      baseline30dAvg: number;
      newsThisWeek: number;
      newsLastWeek: number;
      interestStddev: number;
      activeDays: number;
    } | null;
  };
  stocks: Array<{
    symbol: string;
    name: string;
    market: string;
  }>;
  comparisons: Array<{
    pastTheme: string;
    pastThemeId: string;
    similarity: number;
    currentDay: number;
    pastPeakDay: number;
    pastTotalDays: number;
    estimatedDaysToPeak: number;
    postPeakDecline: number | null;
    message: string;
    /** 과거 테마 라이프사이클 곡선 (비교 오버레이용) */
    lifecycleCurve: Array<{ date: string; score: number }>;
  }>;
  lifecycleCurve: Array<{
    date: string;
    score: number;
  }>;
  /** 뉴스 볼륨 시계열 (보조 차트용) */
  newsTimeline: Array<{
    date: string;
    count: number;
  }>;
  /** 관심도 시계열 (보조 차트용) */
  interestTimeline: Array<{
    date: string;
    value: number;
  }>;
}

/** 테마 랭킹 (단계별 그룹) */
export interface ThemeRanking {
  early: ThemeListItem[];
  growth: ThemeListItem[];
  peak: ThemeListItem[];
  decay: ThemeListItem[];
  reigniting: ThemeListItem[];
  /** 요약 통계 */
  summary: {
    totalThemes: number;
    byStage: Record<string, number>;
    hottestTheme: { name: string; score: number; change7d: number } | null;
    mostImproved: { name: string; change7d: number } | null;
    avgScore: number;
  };
}

export const STAGE_CONFIG = {
  Dormant: { color: '#64748B', label: '관심 없음', labelEn: 'Dormant', bg: 'bg-slate-500/20', border: 'border-slate-500/30', text: 'text-slate-400' },
  Early:   { color: '#10B981', label: '초기',     labelEn: 'Early',   bg: 'bg-emerald-500/20', border: 'border-emerald-500/30', text: 'text-emerald-400' },
  Growth:  { color: '#0EA5E9', label: '성장',     labelEn: 'Growth',  bg: 'bg-sky-500/20', border: 'border-sky-500/30', text: 'text-sky-400' },
  Peak:    { color: '#F59E0B', label: '과열',     labelEn: 'Peak',    bg: 'bg-amber-500/20', border: 'border-amber-500/30', text: 'text-amber-400' },
  Decay:      { color: '#EF4444', label: '말기',     labelEn: 'Decay',      bg: 'bg-red-500/20',    border: 'border-red-500/30',    text: 'text-red-400' },
  Reigniting: { color: '#F97316', label: '재점화',   labelEn: 'Reigniting', bg: 'bg-orange-500/20', border: 'border-orange-500/30', text: 'text-orange-400' },
} as const;

/** DB 문자열 → Stage 타입 가드 (유효하지 않으면 Dormant 폴백) */
const VALID_STAGES = new Set<string>(['Dormant', 'Early', 'Growth', 'Peak', 'Decay'])

export function toStage(value: unknown): Stage {
  if (typeof value === 'string' && VALID_STAGES.has(value)) return value as Stage
  return 'Dormant'
}

/** JSONB → ScoreComponents 타입 가드 */
export function isScoreComponents(value: unknown): value is ScoreComponents {
  if (!value || typeof value !== 'object') return false
  const obj = value as Record<string, unknown>
  return (
    typeof obj.interest_score === 'number' &&
    typeof obj.news_momentum === 'number' &&
    typeof obj.volatility_score === 'number' &&
    typeof obj.maturity_ratio === 'number'
  )
}

export function getStageKo(stage: Stage): string {
  return STAGE_CONFIG[stage].label;
}
