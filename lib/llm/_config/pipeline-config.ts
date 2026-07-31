/** Gemini recommendation generation limits. All retries share one run-scoped budget. */
export const PIPELINE_CONFIG = {
  /** Vercel maxDuration=300s보다 30초 앞서 종료해 persistence/reconciliation 시간을 남긴다. */
  GLOBAL_DEADLINE_MS: 270_000,
  /** Market fallback + seven stock stages + crash branch를 포함한 hard API-call ceiling. */
  GLOBAL_MAX_CALLS: 12,
  /** 각 call의 최대 출력 예약 합. 12 × 8,192보다 작은 추가 호출은 budget에서 거부된다. */
  GLOBAL_MAX_RESERVED_OUTPUT_TOKENS: 98_304,

  /** 전체 pipeline 재실행은 correlated duplicate 비용을 만들므로 금지한다. */
  OUTER_MAX_RETRY: 1,
  OUTER_BASE_RETRY_DELAY: 1_000,
  OUTER_MAX_RETRY_DELAY: 4_000,

  /** 개별 call은 global deadline 안에서 최대 45초만 사용한다. */
  STAGE_TIMEOUT: 45_000,
  /** transient stage retry 한 번만 허용하며 모두 global call budget을 소비한다. */
  STAGE_MAX_RETRY: 2,
  STAGE_INITIAL_RETRY_DELAY: 1_000,
  STAGE_DELAY: 500,

  VERTEX_AI_LOCATION: 'global' as const,
  REQUIRED_STOCK_COUNT: 3 as const,
  MIN_STAGE_OUTPUT_CHARS: 200,
} as const

/** Stable production model and deterministic low-variance generation settings. */
export const GEMINI_API_CONFIG = {
  MODEL: 'gemini-2.5-flash' as const,
  MAX_OUTPUT_TOKENS: 8_192,
  TEMPERATURE: 0.2,
  TOP_P: 0.9,
  TOP_K: 40,
  RESPONSE_MIME_TYPE: 'text/plain' as const,
} as const
