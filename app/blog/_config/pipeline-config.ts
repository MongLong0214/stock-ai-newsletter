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

// GPT API 설정은 lib/llm/_config/pipeline-config.ts에서 관리

/**
 * 키워드 후보 생성 설정
 *
 * gpt-6.1-sol high 실측(run 41363393602): 호출 3회 96·68·27초. 이전 기본값 120초는
 * 한 번만 느려도 키워드 단계 전체가 실패해 그날 발행이 0편이 됐다.
 * 예산이 남아 있을 때만 다음 시도를 시작하고, 예산이 끝나면 모은 키워드로 진행한다.
 */
export const KEYWORD_CONFIG = {
  /** 호출 1회 상한 */
  timeout: 300_000,
  /** 시도 전체 예산 — 남은 예산이 호출 1회 상한보다 작으면 새 시도를 시작하지 않는다 */
  budget: 780_000,
};

/** 콘텐츠 생성 설정 — 분량·FAQ는 guide 기준 */
export const CONTENT_CONFIG = {
  /** gpt-6.1-sol high 실측 175초 — 장문 출력에 여유를 둔다 (2026-10-30). */
  timeout: 600_000,
  minWordCount: 1500,
  maxWordCount: 3000,
  faqCount: 4,
};

/**
 * 윤문(AI 문체 제거) 설정 — Humanize KR(im-not-ai) 이식분
 *
 * 변경률 임계값(0.30 경고 / 0.50 중단)은 `_utils/change-rate.ts`에서 관리한다.
 */
export const HUMANIZE_CONFIG = {
  /** content-generator의 validateContent 하한과 동일 */
  minContentLength: 500,
  /** 품질 점수 SEO 항목이 요구하는 키워드 최소 등장 횟수 */
  minKeywordCount: 3,
  /**
   * 어절 수가 이 비율 넘게 줄면 반려
   *
   * 군더더기(결산 lexicon·형식명사·이중 완곡)를 걷어내면 한국어는 자연히 20%대까지
   * 줄어든다. 실측 샘플이 24% 감소였고 0.15에서는 정상 윤문이 전부 반려됐다.
   * 섹션 통째 유실은 헤딩 개수 가드가 먼저 잡으므로, 이 값은 섹션 내부가
   * 뭉텅이로 잘려나가는 경우만 담당한다.
   */
  maxWordLossRatio: 0.3,
  /**
   * 윤문도 본문 전체를 다시 출력하므로 콘텐츠 생성과 같은 600초를 허용한다.
   * gpt-6.1-sol은 장문 출력 시간이 병목이어서 이전 모델의 150초 예산은 부족하다.
   * 바깥 TIMEOUTS.humanize는 15초 더 기다려 안쪽 AbortSignal 취소와 실제 오류가
   * 먼저 전달되도록 한다.
   */
  timeout: 600_000,
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

