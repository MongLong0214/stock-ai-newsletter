/**
 * SEO 키워드 전략
 * 카테고리별로 체계적으로 관리
 */

import type { KeywordCategory } from './types';
import { siteConfig } from './config';

const { serviceName, serviceNameKo, indicatorCount, deliveryTime } =
  siteConfig;

/**
 * 카테고리별 키워드 관리
 * 각 카테고리는 독립적으로 수정 가능
 */
export const keywordsByCategory: KeywordCategory = {
  // 브랜드 키워드 (3개)
  brand: [serviceName, serviceNameKo, 'Stock Matrix'],

  // AI 관련 키워드 (10개)
  ai: [
    'AI 주식 분석',
    'GPT 주식',
    'Claude AI 주식',
    'Gemini AI',
    'AI 주식 추천',
    'AI 투자',
    '주식 자동 분석',
    'ChatGPT 주식',
    'AI 주식 리포트',
    '인공지능 주식',
  ],

  // 서비스 키워드 - 뉴스레터 중심 강화 (15개)
  service: [
    '주식 뉴스레터',
    '무료 투자 뉴스레터',
    '한국 주식 뉴스레터',
    '증권 뉴스레터',
    '투자 레터',
    '경제 뉴스레터',
    '리서치 리포트 뉴스레터',
    '무료 주식 뉴스레터',
    '주식 이메일 뉴스레터',
    '투자 인사이트 이메일',
    '종목 추천 뉴스레터',
    '주식 이메일 구독',
    '주식 투자 뉴스레터',
    '주식 구독 서비스',
    '투자 정보 뉴스레터',
  ],

  // 시장 관련 키워드 (7개)
  market: [
    'KOSPI 분석',
    'KOSDAQ 추천',
    '한국 주식',
    '코스피 종목',
    '코스닥 종목',
    '국내 주식',
    '한국거래소',
  ],

  // 기술 지표 키워드 (12개)
  indicator: [
    'RSI 지표',
    'MACD 분석',
    '볼린저밴드',
    '이동평균선',
    '스토캐스틱',
    'CCI 지표',
    `${indicatorCount}개 기술지표`,
    'RSI 30 이하',
    'MACD 골든크로스',
    '볼린저밴드 상단',
    '이동평균선 정배열',
    '스토캐스틱 과매도',
  ],

  // 분석 관련 키워드 (8개)
  analysis: [
    '기술적 분석',
    '주식 기술지표',
    '기술적 지표',
    '차트 분석',
    '주식 분석 서비스',
    '기술적 분석 뉴스레터',
    '주식 차트',
    '기술적 분석 교육',
  ],

  // 무료 관련 키워드 (6개)
  free: [
    '무료 주식 정보',
    '무료 투자 정보',
    '주식 정보 무료',
    '무료 주식 리포트',
    '무료 주식 분석',
    '무료 투자 뉴스레터',
  ],

  // 시간 관련 키워드 (5개)
  time: [
    '주식 매일 분석',
    '아침 주식 정보',
    '매일 주식 분석',
    deliveryTime,
    '장 시작 전',
  ],

  // 롱테일 키워드 (11개)
  longTail: [
    '주식 투자 초보',
    '주식 기술적 분석 배우기',
    '주식 매수 타이밍',
    '주식 매도 시점',
    '단타 주식',
    '중장기 투자',
    '주식 손절',
    '주식 익절',
    '주식 시그널 알림',
    '주식 종목 발굴',
    '저평가 주식',
  ],
} as const;

/**
 * 모든 키워드를 단일 배열로 통합
 * Next.js metadata에서 사용
 */
export const allKeywords: string[] = [
  ...keywordsByCategory.brand,
  ...keywordsByCategory.ai,
  ...keywordsByCategory.service,
  ...keywordsByCategory.market,
  ...keywordsByCategory.indicator,
  ...keywordsByCategory.analysis,
  ...keywordsByCategory.free,
  ...keywordsByCategory.time,
  ...keywordsByCategory.longTail,
];