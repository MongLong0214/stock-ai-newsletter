import type { PipelineConfig } from '../_types/blog';
import { siteConfig } from '@/lib/constants/seo/config';

export const PIPELINE_CONFIG: PipelineConfig = {
  maxCompetitors: 5,
  minWordCount: 1500,
  maxWordCount: 3000,
  requestTimeout: 30000,
  retryAttempts: 3,
  retryDelay: 2000,
};

export const SERP_API_CONFIG = {
  baseUrl: 'https://serpapi.com/search.json',
  engine: 'google',
  location: 'South Korea',
  hl: 'ko',
  gl: 'kr',
  googleDomain: 'google.co.kr',
  num: 10,
};

// Gemini API 설정은 lib/llm/_config/pipeline-config.ts에서 관리

/** guide 전용 — 다른 콘텐츠 타입 추가 시 분리 */
export const CONTENT_CONFIG = {
  minWordCount: 1500,
  maxWordCount: 3000,
  faqCount: 4,
};

export const SITE_INFO = {
  name: siteConfig.serviceName,
  nameKo: siteConfig.serviceNameKo,
  domain: siteConfig.domain,
  /** 서비스 핵심 기능 + 차별점 (프롬프트에서 참조) */
  highlights: [
    'AI 기반 기술적 분석',
    '30가지 지표 분석 (RSI, MACD, 볼린저밴드 등)',
    'KOSPI·KOSDAQ 종목 분석',
    '매일 오전 7:30 이메일 발송',
    '완전 무료 서비스',
  ],
};

/** 프롬프트에서 경쟁사 콘텐츠 대비 강조할 차별점 */
export const CONTENT_GAPS = [
  'AI 기반 자동 분석',
  '30가지 기술적 지표',
  '매일 아침 이메일 발송',
  '완전 무료 서비스',
  'KOSPI·KOSDAQ 동시 분석',
];
