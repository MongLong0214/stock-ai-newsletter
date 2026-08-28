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
  /** 창작이 아니라 교정이므로 생성보다 낮게 */
  temperature: 0.4,
  /**
   * 파이프라인 외부 타이머(TIMEOUTS.humanize=165초)보다 낮게 둔다.
   *
   * 예전에는 안쪽 180초 > 바깥 60초라 바깥이 먼저 터졌고, 그러면 오류가 늘
   * "Humanize 타임아웃"으로만 남아 실제 사유(빈 응답·반려·SDK 오류)가 묻혔다.
   * 안쪽이 먼저 끊기면 AbortSignal로 요청도 실제로 취소된다.
   *
   * 값은 90초였다가 150초로 되돌렸다. 90초는 실측 분포를 과소평가한 값이다 —
   * 과거 run 로그의 성공 호출은 20.5s ~ **108.4s**로 퍼져 있고(p50 ~31s, p95 ~64s),
   * 90초 컷은 그 꼬리의 정상 호출을 시스템 장애로 집계한다. 실제로 첫 적용일에
   * 90초 컷 2건이 서킷브레이커를 열어 그날 발행이 0편이 됐다(run 33142081554).
   * 150초는 관측 최대 성공(108s)의 1.4배다. 그 위는 진짜 행이므로 끊는 게 맞다.
   */
  timeout: 150_000,
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

