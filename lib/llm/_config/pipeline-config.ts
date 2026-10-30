/**
 * OpenAI Multi-Stage Pipeline 설정 중앙 관리
 *
 * 3-Layer Retry Architecture:
 * 1. Outer Layer (llm-recommendation.ts): 3회 재시도 - Pipeline 전체 실패 시 재실행
 * 2. Stage Layer (llm-pipeline.ts): 6개 Stage 순차 실행
 * 3. Inner Layer (llm-pipeline.ts): Stage별 5회 재시도 - API 호출 실패 시
 *
 * 최대 재시도 횟수: 3 (outer) × 6 (stages) × 5 (inner) = 90회
 */
export const PIPELINE_CONFIG = {
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Outer Layer Retry (llm-recommendation.ts)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * Pipeline 전체 재시도 최대 횟수
   * JSON 검증 실패 또는 Pipeline 전체 오류 시 재시도
   */
  OUTER_MAX_RETRY: 3,

  /**
   * 초기 재시도 대기 시간 (밀리초)
   * Exponential Backoff: 2s → 4s → 8s
   */
  OUTER_BASE_RETRY_DELAY: 2000,

  /**
   * 최대 재시도 대기 시간 (밀리초)
   * Backoff 상한선 제한
   */
  OUTER_MAX_RETRY_DELAY: 32000,

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Stage Layer Configuration (llm-pipeline.ts)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * 각 Stage별 최대 실행 시간 (밀리초)
   * 20분 - GPT + 웹 검색 포함 복잡한 분석에 충분한 시간
   */
  STAGE_TIMEOUT: 1200000,

  /**
   * Stage 실패 시 최대 재시도 횟수
   * Exponential Backoff: 5s → 10s → 20s → 40s → 80s
   * 429 Rate Limit 시: 10s → 20s → 40s → 80s → 160s
   */
  STAGE_MAX_RETRY: 5,

  /**
   * Stage 재시도 초기 대기 시간 (밀리초)
   * 일반 오류: 5초
   * 429 Rate Limit: 10초 (2배)
   */
  STAGE_INITIAL_RETRY_DELAY: 5000,

  /**
   * Stage 간 대기 시간 (밀리초)
   * Rate Limit 방지를 위한 쿨다운
   */
  STAGE_DELAY: 3000,

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Validation Configuration
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * 필수 추천 종목 수
   * 정확히 3개 종목이 아니면 Pipeline 재시도
   */
  REQUIRED_STOCK_COUNT: 3 as const,

  /**
   * Stage 출력 최소 길이 (문자)
   * 빈 응답/거부 응답이 다음 Stage로 흘러가는 것을 차단하는 하한선
   * (정상 Stage 출력은 최소 수 KB — 200자는 명백한 비정상만 걸러냄)
   */
  MIN_STAGE_OUTPUT_CHARS: 200,
} as const;

/**
 * OpenAI Responses API 호출 설정
 */
export const OPENAI_API_CONFIG = {
  /** 사용 모델 */
  MODEL: 'gpt-6.1-sol' as const,

  /** 최대 출력 토큰 수 */
  MAX_OUTPUT_TOKENS: 65536,

  /** 추론 수준 (low | medium | high | xhigh) */
  REASONING_EFFORT: 'high' as const,
} as const;
