/**
 * 블로그 콘텐츠 자동화 파이프라인 설정
 * Enterprise-grade configuration
 */

import type { PipelineConfig } from '../_types/blog';

/** 파이프라인 기본 설정 */
export const PIPELINE_CONFIG: PipelineConfig = {
  /** 분석할 경쟁사 수 (SerpApi 무료 플랜 최적화) */
  maxCompetitors: 5,

  /** 생성할 콘텐츠 최소 단어 수 */
  minWordCount: 1500,

  /** 생성할 콘텐츠 최대 단어 수 */
  maxWordCount: 3000,

  /** HTTP 요청 타임아웃 (ms) */
  requestTimeout: 30000,

  /** 재시도 횟수 */
  retryAttempts: 3,

  /** 재시도 대기 시간 (ms) */
  retryDelay: 2000,
} as const;

/** SerpApi 설정 */
export const SERP_API_CONFIG = {
  /** API 엔드포인트 */
  baseUrl: 'https://serpapi.com/search.json',

  /** 검색 엔진 */
  engine: 'google',

  /** 검색 지역 (한국) */
  location: 'South Korea',

  /** 언어 */
  hl: 'ko',

  /** 국가 */
  gl: 'kr',

  /** Google 도메인 */
  googleDomain: 'google.co.kr',

  /** 검색 결과 수 */
  num: 10,
} as const;

/** Gemini 콘텐츠 생성 설정 */
export const GEMINI_CONTENT_CONFIG = {
  /** 사용할 모델 */
  model: 'gemini-2.0-flash',

  /** 최대 출력 토큰 */
  maxOutputTokens: 8192,

  /** Temperature (창의성) - SEO 콘텐츠는 낮게 */
  temperature: 0.7,

  /** Top P */
  topP: 0.9,

  /** Top K */
  topK: 40,
} as const;

/** 콘텐츠 타입별 설정 */
export const CONTENT_TYPE_CONFIG = {
  comparison: {
    minWordCount: 2000,
    maxWordCount: 3500,
    faqCount: 5,
    requiredSections: ['intro', 'comparison-table', 'detailed-analysis', 'conclusion'],
  },
  guide: {
    minWordCount: 1500,
    maxWordCount: 3000,
    faqCount: 4,
    requiredSections: ['intro', 'step-by-step', 'tips', 'conclusion'],
  },
  listicle: {
    minWordCount: 1200,
    maxWordCount: 2500,
    faqCount: 3,
    requiredSections: ['intro', 'list-items', 'conclusion'],
  },
  review: {
    minWordCount: 1800,
    maxWordCount: 3000,
    faqCount: 4,
    requiredSections: ['intro', 'features', 'pros-cons', 'verdict'],
  },
} as const;

/** SEO 타겟 키워드 목록 */
export const TARGET_KEYWORDS = [
  {
    keyword: '주식 뉴스레터 추천',
    type: 'listicle' as const,
    priority: 1,
  },
  {
    keyword: 'AI 주식 분석',
    type: 'guide' as const,
    priority: 2,
  },
  {
    keyword: '무료 주식 뉴스레터',
    type: 'comparison' as const,
    priority: 1,
  },
  {
    keyword: '주식 투자 정보 사이트',
    type: 'listicle' as const,
    priority: 3,
  },
  {
    keyword: '주식 기술적 분석 사이트',
    type: 'guide' as const,
    priority: 2,
  },
  {
    keyword: '주식 종목 추천 서비스',
    type: 'comparison' as const,
    priority: 2,
  },
  {
    keyword: 'AI 주식 추천',
    type: 'review' as const,
    priority: 1,
  },
  {
    keyword: '주식 분석 뉴스레터',
    type: 'guide' as const,
    priority: 2,
  },
  {
    keyword: '코스피 종목 추천',
    type: 'listicle' as const,
    priority: 3,
  },
  {
    keyword: '주식 투자 뉴스레터',
    type: 'comparison' as const,
    priority: 2,
  },
] as const;

/** 사이트 정보 (콘텐츠 생성 시 사용) */
export const SITE_INFO = {
  name: 'Stock Matrix',
  nameKo: '스탁매트릭스',
  domain: 'https://stockmatrix.co.kr',
  features: [
    'AI 기반 기술적 분석',
    '30가지 지표 분석 (RSI, MACD, 볼린저밴드 등)',
    'KOSPI·KOSDAQ 종목 분석',
    '매일 오전 7:50 이메일 발송',
    '완전 무료 서비스',
  ],
  uniqueSellingPoints: [
    '30가지 기술적 지표 종합 분석',
    '매일 아침 자동 이메일 발송',
    '100% 무료',
    'AI 기반 객관적 분석',
  ],
} as const;

/** 경쟁사 대비 콘텐츠 차별화 포인트 */
export const CONTENT_GAPS = [
  'AI 기반 자동 분석',
  '30가지 기술적 지표',
  '매일 아침 이메일 발송',
  '완전 무료 서비스',
  'KOSPI·KOSDAQ 동시 분석',
] as const;