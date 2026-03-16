/** API 응답 타입 */

import type { Stage, NewsArticle, ConfidenceLevel } from './db'
import type { Level4ConfidenceTier, Level4SourceSurface } from '@/lib/tli/comparison/level4-types'

/** API 응답 공통 래퍼 */
export interface ApiResponse<T> {
  success: boolean
  data: T
  error?: { message: string }
}

/** 종목 아이템 (상세 페이지용) */
export interface ThemeStockItem {
  symbol: string
  name: string
  market: string
  currentPrice: number | null
  priceChangePct: number | null
  volume: number | null
}

/** 점수 raw 수치 (툴팁/상세용) */
export interface ScoreRawData {
  recent7dAvg: number
  baseline30dAvg: number
  newsThisWeek: number
  newsLastWeek: number
  interestStddev: number
  activeDays: number
}

/** 생명주기 곡선 데이터 포인트 */
export interface LifecycleCurvePoint {
  date: string
  score: number
}

/** 시계열 카운트 데이터 포인트 */
export interface TimelinePoint {
  date: string
  count: number
}

export interface ThemeSignalItem {
  id: string
  name: string
  detail: string
}

export interface ThemeSignalCard {
  key: 'movers' | 'peak' | 'emerging' | 'reigniting'
  title: string
  themes: ThemeSignalItem[]
}

/** 유사 테마 비교 결과 (comparison-list, theme-prediction, query-helpers 통합) */
export interface ComparisonResult {
  pastTheme: string
  pastThemeId: string
  similarity: number
  currentDay: number
  pastPeakDay: number
  pastTotalDays: number
  estimatedDaysToPeak: number
  message: string
  lifecycleCurve: LifecycleCurvePoint[]
  /** 3-Pillar 분해 */
  featureSim: number | null
  curveSim: number | null
  keywordSim: number | null
  /** 과거 테마 결과 */
  pastPeakScore: number | null
  pastFinalStage: string | null
  pastDeclineDays: number | null
  /** Level-4 serving metadata (optional for backward compatibility) */
  relevanceProbability?: number | null
  probabilityCiLower?: number | null
  probabilityCiUpper?: number | null
  supportCount?: number | null
  confidenceTier?: Level4ConfidenceTier | null
  calibrationVersion?: string | null
  weightVersion?: string | null
  sourceSurface?: Level4SourceSurface | null
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
  /** 대표 종목명 (최대 5개) */
  topStocks: string[];
  isReigniting: boolean;
  updatedAt: string;
  /** 최근 7일 점수 추이 (스파크라인용) */
  sparkline: number[];
  /** 뉴스 기사 수 (theme_news_articles 총 건수) */
  newsCount7d: number;
  /** 점수 신뢰도 */
  confidenceLevel?: ConfidenceLevel;
  /** 관련주 평균 등락률 (%) — null이면 데이터 없음 */
  avgStockChange: number | null;
}

/** 테마 상세 정보 */
export interface ThemeForecastControl {
  serving: boolean
  version: string | null
  rollbackAvailable: boolean
  rollbackVersion: string | null
  reason?: string
}

export interface ThemeDetail {
  id: string;
  name: string;
  nameEn: string | null;
  description: string | null;
  /** 첫 급등일 */
  firstSpikeDate: string | null;
  /** 관련 키워드 */
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
      /** 관심도 점수 (0~1 정규화) */
      interest: number;
      /** 뉴스 모멘텀 점수 (0~1 정규화) */
      newsMomentum: number;
      /** 변동성 점수 (0~1 정규화) */
      volatility: number;
      /** 활동성 점수 (0~1 정규화, v2 신규 — 하위 호환 optional) */
      activity?: number;
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
    /** 점수 신뢰도 */
    confidence: {
      level: ConfidenceLevel;
      dataAge: number;
      interestCoverage: number;
      newsCoverage: number;
      reason: string;
    } | null;
  };
  /** 관련 종목 총 수 (카드와 동일 기준) */
  stockCount: number;
  stocks: ThemeStockItem[];
  /** 뉴스 기사 총 수 (카드와 동일 기준) */
  newsCount: number;
  recentNews: NewsArticle[];
  comparisons: ComparisonResult[];
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
  emerging: ThemeListItem[];
  growth: ThemeListItem[];
  peak: ThemeListItem[];
  decline: ThemeListItem[];
  reigniting: ThemeListItem[];
  signals: ThemeSignalCard[];
  /** 요약 통계 */
  summary: {
    /** 품질 게이트를 통과한 활성 테마 수 */
    totalThemes: number;
    /** DB 기준 추적 중인 전체 활성 테마 수 (is_active=true) */
    trackedThemes: number;
    /** 기본 화면에 실제로 노출되는 테마 수 (stage cap 적용 후) */
    visibleThemes: number;
    byStage: Record<string, number>;
    hottestTheme: { id: string; name: string; score: number; stage: string; stockCount: number } | null;
    /** 급상승 테마 (Emerging/Growth 단계, 이번 주 최대 상승) */
    surging: { id: string; name: string; score: number; change7d: number; stage: string } | null;
    avgScore: number;
  };
}
