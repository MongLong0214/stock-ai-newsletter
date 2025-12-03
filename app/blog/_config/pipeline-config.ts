import type { PipelineConfig } from '../_types/blog';
import { siteConfig } from '@/lib/constants/seo/config';

export const PIPELINE_CONFIG: PipelineConfig = {
  maxCompetitors: 5,
  minWordCount: 1500,
  maxWordCount: 3000,
  requestTimeout: 30000,
  retryAttempts: 3,
  retryDelay: 2000,
} as const;

export const SERP_API_CONFIG = {
  baseUrl: 'https://serpapi.com/search.json',
  engine: 'google',
  location: 'South Korea',
  hl: 'ko',
  gl: 'kr',
  googleDomain: 'google.co.kr',
  num: 10,
} as const;

// Gemini API configuration is centrally managed in lib/llm/_config/pipeline-config.ts

export const CONTENT_TYPE_CONFIG = {
  guide: {
    minWordCount: 1500,
    maxWordCount: 3000,
    faqCount: 4,
  },
} as const;

export const SITE_INFO = {
  name: siteConfig.serviceName,
  nameKo: siteConfig.serviceNameKo,
  domain: siteConfig.domain,
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

export const CONTENT_GAPS = [
  'AI 기반 자동 분석',
  '30가지 기술적 지표',
  '매일 아침 이메일 발송',
  '완전 무료 서비스',
  'KOSPI·KOSDAQ 동시 분석',
] as const;