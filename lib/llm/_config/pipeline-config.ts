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
   * global: Gemini 3 Pro Preview는 Global 리전 전용
   */
  VERTEX_AI_LOCATION: 'global' as const,

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
 * gemini-3-pro-preview 모델 최적 파라미터
 */
export const GEMINI_API_CONFIG = {
  /**
   * 사용 모델
   * gemini-3-pro-preview: Gemini 3.0 Pro Preview
   * - 1M 토큰 입력 컨텍스트 윈도우
   * - 최대 64K 출력 토큰
   * - Dynamic thinking 기본 활성화 (thinking_level: high가 기본값)
   * - 지식 기준: 2025년 1월
   */
  MODEL: 'gemini-3-pro-preview' as const,

  /**
   * 최대 출력 토큰 수
   * 64000: gemini-3-pro 최대값 (gemini-2.5-pro의 2배)
   */
  MAX_OUTPUT_TOKENS: 64000,

  /**
   * Temperature 설정
   * ⚠️ Gemini 3 공식 권장: 1.0 유지 (기본값)
   * - 범위: 0.0 ~ 2.0
   * - 1.0 미만 설정 시 복잡한 수학/추론 작업에서 루핑이나 성능 저하 발생 가능
   * - Dynamic thinking과 함께 최적의 추론 성능 제공
   */
  TEMPERATURE: 1.0,

  /**
   * Top-P (nucleus sampling)
   * 0.95: Gemini 3 Pro 공식 기본값
   * - 범위: 0.0 ~ 1.0
   * - 누적 확률 95%까지의 토큰만 고려
   */
  TOP_P: 0.95,

  /**
   * Top-K (top-k sampling)
   * 64: Gemini 3 Pro 고정값 (변경 불가)
   * - 상위 64개 토큰 중에서 선택
   */
  TOP_K: 64,

  /**
   * Response MIME Type
   * text/plain: Google Search tool 호환 모드
   */
  RESPONSE_MIME_TYPE: 'text/plain' as const,
} as const;