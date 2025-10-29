/**
 * Gemini Multi-Stage Pipeline 설정 중앙 관리
 *
 * 3-Layer Retry Architecture:
 * 1. Outer Layer (gemini.ts): 3회 재시도 - Pipeline 전체 실패 시 재실행
 * 2. Stage Layer (gemini-pipeline.ts): 6개 Stage 순차 실행
 * 3. Inner Layer (gemini-pipeline.ts): Stage별 5회 재시도 - API 호출 실패 시
 *
 * 최대 재시도 횟수: 3 (outer) × 6 (stages) × 5 (inner) = 90회
 */
export const PIPELINE_CONFIG = {
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Outer Layer Retry (gemini.ts)
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
  // Stage Layer Configuration (gemini-pipeline.ts)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * 각 Stage별 최대 실행 시간 (밀리초)
   * 10분 - Google Search 포함 복잡한 분석에 충분한 시간
   */
  STAGE_TIMEOUT: 600000,

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
  // Vertex AI Configuration
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * Vertex AI 리전
   * us-central1: Google 공식 권장 리전
   */
  VERTEX_AI_LOCATION: 'us-central1' as const,

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Validation Configuration
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * 필수 추천 종목 수
   * 정확히 3개 종목이 아니면 Pipeline 재시도
   */
  REQUIRED_STOCK_COUNT: 3 as const,
} as const;

/**
 * Gemini API 호출 설정
 *
 * gemini-2.5-pro 모델 최적 파라미터
 */
export const GEMINI_API_CONFIG = {
  /**
   * 사용 모델
   * gemini-2.5-pro: 최신 프로덕션 모델 (2025 Q1)
   */
  MODEL: 'gemini-2.5-pro' as const,

  /**
   * 최대 출력 토큰 수
   * 32768: gemini-2.5-pro 최대값
   */
  MAX_OUTPUT_TOKENS: 32768,

  /**
   * Temperature 설정
   * 0.15: S grade - 최대 일관성 및 JSON 형식 안정성 확보 (Production 최적화)
   */
  TEMPERATURE: 0.15,

  /**
   * Top-P (nucleus sampling)
   * 0.9: Google 공식 권장값
   */
  TOP_P: 0.9,

  /**
   * Top-K (top-k sampling)
   */
  TOP_K: 35,

  /**
   * Response MIME Type
   * text/plain: Google Search tool 호환 모드
   */
  RESPONSE_MIME_TYPE: 'text/plain' as const,

  /**
   * Thinking Budget (Extended Thinking)
   */
  THINKING_BUDGET: 31000,
} as const;