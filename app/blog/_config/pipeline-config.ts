/**
 * 블로그 콘텐츠 자동화 파이프라인 설정
 *
 * [이 파일의 역할]
 * - 블로그 자동 생성 시스템의 모든 설정값을 중앙에서 관리
 * - 다른 파일에서 import하여 설정값을 사용
 *
 * [왜 설정을 분리하는가?]
 * - 설정값 변경 시 이 파일만 수정하면 됨 (유지보수 용이)
 * - 하드코딩 방지로 코드 품질 향상
 * - 환경별(개발/운영) 다른 설정 적용 가능
 */

import type { PipelineConfig } from '../_types/blog';
import { siteConfig } from '@/lib/constants/seo/config';

/**
 * 파이프라인 기본 설정
 *
 * 블로그 콘텐츠 생성 시 사용되는 핵심 설정값들
 * 'as const'를 붙이면 값이 변경 불가능한 상수가 됨 (타입 안정성 향상)
 */
export const PIPELINE_CONFIG: PipelineConfig = {
  /** 분석할 경쟁사 수 - SerpApi 무료 플랜이 월 250회 제한이라 5개로 설정 */
  maxCompetitors: 5,

  /** 생성할 콘텐츠 최소 단어 수 - SEO에 최소 1500단어 권장 */
  minWordCount: 1500,

  /** 생성할 콘텐츠 최대 단어 수 - 너무 길면 이탈률 증가 */
  maxWordCount: 3000,

  /** HTTP 요청 타임아웃 (ms) - 30초 후 요청 취소 */
  requestTimeout: 30000,

  /** API 호출 실패 시 재시도 횟수 */
  retryAttempts: 3,

  /** 재시도 전 대기 시간 (ms) - 2초 후 재시도 */
  retryDelay: 2000,
} as const;

/**
 * SerpApi 설정
 *
 * [SerpApi란?]
 * - Google 검색 결과를 API로 가져올 수 있는 서비스
 * - 경쟁사 블로그 URL을 수집하는 데 사용
 * - 무료 플랜: 월 100회 제한
 */
export const SERP_API_CONFIG = {
  /** API 호출 URL */
  baseUrl: 'https://serpapi.com/search.json',

  /** 검색 엔진 - Google 사용 */
  engine: 'google',

  /** 검색 지역 - 한국 검색 결과를 가져오기 위함 */
  location: 'South Korea',

  /** 검색 결과 언어 - 한국어 */
  hl: 'ko',

  /** 검색 대상 국가 - 한국 */
  gl: 'kr',

  /** Google 한국 도메인 사용 */
  googleDomain: 'google.co.kr',

  /** 가져올 검색 결과 개수 */
  num: 10,
} as const;

/**
 * Gemini AI 설정
 *
 * [중요]
 * Gemini API 설정은 lib/llm/_config/pipeline-config.ts에서 중앙 관리합니다.
 * - GEMINI_API_CONFIG.MODEL: gemini-3-pro-preview
 * - GEMINI_API_CONFIG.MAX_OUTPUT_TOKENS: 64000
 * - GEMINI_API_CONFIG.TEMPERATURE: 1.0 (Gemini 3 권장)
 * - GEMINI_API_CONFIG.TOP_P: 0.95
 * - GEMINI_API_CONFIG.TOP_K: 64
 *
 * 블로그 콘텐츠 생성 서비스(content-generator.ts)에서
 * lib/llm/_config/pipeline-config.ts의 GEMINI_API_CONFIG를 직접 import하여 사용합니다.
 */

/**
 * 콘텐츠 타입별 기본 설정
 * AI가 키워드에 맞는 콘텐츠 형식을 자동으로 선택하여 적용
 */
export const CONTENT_TYPE_CONFIG = {
  guide: {
    minWordCount: 1500,
    maxWordCount: 3000,
    faqCount: 4,
  },
} as const;

/**
 * 우리 사이트(Stock Matrix) 정보
 *
 * [사용 목적]
 * - AI가 콘텐츠 생성 시 우리 서비스를 자연스럽게 홍보하도록 함
 * - features: 주요 기능 설명
 * - uniqueSellingPoints: 경쟁사 대비 차별점
 *
 * [주의]
 * - domain, name은 siteConfig (lib/constants/seo/config.ts)를 Single Source of Truth로 사용
 * - Schema.org 생성은 _utils/schema-generator.ts에서 통합 처리
 */
export const SITE_INFO = {
  /** siteConfig에서 가져온 도메인 (중복 방지) */
  name: siteConfig.serviceName,
  nameKo: siteConfig.serviceNameKo,
  domain: siteConfig.domain,
  /** 우리 서비스의 주요 기능들 */
  features: [
    'AI 기반 기술적 분석',
    '30가지 지표 분석 (RSI, MACD, 볼린저밴드 등)',
    'KOSPI·KOSDAQ 종목 분석',
    '매일 오전 7:50 이메일 발송',
    '완전 무료 서비스',
  ],
  /** 경쟁사 대비 우리만의 강점 */
  uniqueSellingPoints: [
    '30가지 기술적 지표 종합 분석',
    '매일 아침 자동 이메일 발송',
    '100% 무료',
    'AI 기반 객관적 분석',
  ],
} as const;

/**
 * 콘텐츠 차별화 포인트
 *
 * [사용 목적]
 * - 경쟁사 콘텐츠에서 부족한 부분을 채우기 위함
 * - AI가 콘텐츠 생성 시 이 포인트들을 강조하도록 함
 */
export const CONTENT_GAPS = [
  'AI 기반 자동 분석',
  '30가지 기술적 지표',
  '매일 아침 이메일 발송',
  '완전 무료 서비스',
  'KOSPI·KOSDAQ 동시 분석',
] as const;