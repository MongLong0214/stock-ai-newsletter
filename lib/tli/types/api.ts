/** API response types */

import type { Stage, NewsArticle } from './db'

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
  sentimentAvg?: number
  sentimentArticleCount?: number
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

/** 유사 테마 비교 결과 (comparison-list, theme-prediction, query-helpers 통합) */
export interface ComparisonResult {
  pastTheme: string
  pastThemeId: string
  similarity: number
  currentDay: number
  pastPeakDay: number
  pastTotalDays: number
  estimatedDaysToPeak: number
  postPeakDecline: number | null
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
  /** 최근 감성 점수 (0=중립, >0=긍정, <0=부정) */
  sentimentScore: number;
}

/** 테마 상세 정보 */
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
      /** 감성 점수 (0~1 정규화, 0 = 중립, >0 = 긍정, <0 = 부정) */
      sentiment: number;
      /** 변동성 점수 (0~1 정규화) */
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
      sentimentAvg?: number;
      sentimentArticleCount?: number;
    } | null;
  };
  /** 관련 종목 총 수 (카드와 동일 기준) */
  stockCount: number;
  stocks: Array<{
    symbol: string;
    name: string;
    market: string;
    currentPrice: number | null;
    priceChangePct: number | null;
    volume: number | null;
  }>;
  /** 뉴스 기사 총 수 (카드와 동일 기준) */
  newsCount: number;
  recentNews: NewsArticle[];
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
    /** 유사도 3-Pillar 분해 */
    featureSim: number | null;
    curveSim: number | null;
    keywordSim: number | null;
    /** 과거 테마 결과 */
    pastPeakScore: number | null;
    pastFinalStage: string | null;
    pastDeclineDays: number | null;
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
    hottestTheme: { name: string; score: number; stage: string; stockCount: number } | null;
    /** 급상승 테마 (Early/Growth 단계, 이번 주 최대 상승) */
    surging: { name: string; score: number; change7d: number; stage: string } | null;
    avgScore: number;
  };
}
