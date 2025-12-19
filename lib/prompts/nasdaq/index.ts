import { COMMON_PRINCIPLES } from './common-principles';
import { STAGE_0_COLLECT_UNIVERSE } from './stage-0-collect-200';
import { STAGE_1_HARD_FILTER } from './stage-1-filter-30';
import { STAGE_2_VERIFY_PRICE } from './stage-2-verify-price';
import { STAGE_3_CALCULATE_INDICATORS } from './stage-3-collect-indicators';
import { STAGE_4_SCORE_AND_RANK } from './stage-4-calculate-scores';
import { STAGE_5_FORMAT_OUTPUT } from './stage-5-json-output';
import { STAGE_6_FINAL_VERIFICATION } from './stage-6-final-verification';

/**
 * Williams %R 트리거 기반 나스닥 주식 분석 프롬프트
 * Enterprise Grade v3.0 - ANTI-HALLUCINATION MODE
 *
 * ═══════════════════════════════════════════════════════
 * 버전 정보
 * ═══════════════════════════════════════════════════════
 *
 * pipelineVersion: v3.0
 * strategyVersion: wpr_v1
 *
 * 변경 이력:
 * - v3.0.0 (2024-12-19): ANTI-HALLUCINATION MODE
 *   - Anti-Hallucination Framework 도입
 *     - fetchMetrics 필수 (HTTP 호출 증거)
 *     - rawDataSamples 필수 (3개 티커의 실제 CSV 원문)
 *     - Physical Reality Check (28초에 200개 OHLCV fetch 불가능)
 *   - 필드 네이밍 표준화
 *     - price (not lastClose), willr (not willr14), picks (not candidatesTop3)
 *     - 모든 Stage 간 일관된 네이밍
 *   - Entry Window Check 강화
 *     - Regime A: -80 <= willr <= -50 (추격 금지)
 *     - Regime B: -50 < willr <= -30 (추격 금지)
 *     - PLTR -82 → -18 케이스 방지
 *   - Price Integrity Check Stage 3으로 이동 (조기 탐지)
 *   - Stage 5/6 역할 명확화 (포맷팅 vs 검증)
 *   - Cross-Stage Count Reconciliation
 *   - auditTrail 필드 전 Stage 추가
 *
 * - v2.2.0 (2024-12-19): HIGH RELIABILITY MODE
 *   - Trust Framework 도입
 *   - Confidence Score 시스템
 *   - 7-Layer Final Verification
 *   - Red Flags 자동 경고 시스템
 *   - Cross-Validation 체크
 *
 * - v2.1.0 (2024-12-19): Gemini 최적화 리팩토링
 *
 * - v1.0.0 (2024-12-01): Initial Williams %R trigger system
 *
 * ═══════════════════════════════════════════════════════
 * Anti-Hallucination 시스템 (NEW in v3.0)
 * ═══════════════════════════════════════════════════════
 *
 * 문제: LLM이 "수집했다"고 말만 하고 실제로 안 함
 * 해결: 모든 Stage에 증거 필드 필수화
 *
 * Stage 0 필수 증거:
 * - fetchMetrics.ohlcvFetchAttempts: 실제 HTTP 시도 횟수
 * - fetchMetrics.totalFetchTimeMs: 소요 시간 (물리적 제약 검증)
 * - rawDataSamples: 3개 티커의 실제 CSV 마지막 2줄
 *
 * 물리적 현실 제약:
 * - 200개 OHLCV 직렬 fetch: 60-200초 소요
 * - 200개 OHLCV 병렬 fetch: 15-60초 소요
 * - < 30초: SUSPICIOUS (캐시 사용?)
 * - < 10초: IMPOSSIBLE (환각 의심)
 *
 * ═══════════════════════════════════════════════════════
 * Entry Window 시스템 (NEW in v3.0)
 * ═══════════════════════════════════════════════════════
 *
 * 문제: PLTR -82 → -18 같이 트리거만 통과하고 이미 너무 튄 종목
 * 해결: Trigger + Entry Window 둘 다 통과해야 함
 *
 * Regime A (Mean Reversion):
 * - Trigger: prev.willr < -80 AND willr >= -80
 * - Entry Window: willr <= -50
 * - 유효 범위: -80 <= willr <= -50
 *
 * Regime B (Trend Pullback):
 * - Trigger: prev.willr <= -50 AND willr > -50 AND price >= ema20
 * - Entry Window: willr <= -30
 * - 유효 범위: -50 < willr <= -30
 *
 * ═══════════════════════════════════════════════════════
 * 신뢰도 시스템
 * ═══════════════════════════════════════════════════════
 *
 * Confidence Score (60점 이상만 출력):
 * - Base: 50 (finalPass 필수 = trigger + entry window)
 * - Confirmation Bonus: +10 per confirmation (max +30)
 * - Liquidity Bonus: +0 ~ +15
 * - Volatility Penalty: -10 ~ 0
 * - Data Quality: +5 or -10
 * - Signal Strength: +0 ~ +10
 *
 * ═══════════════════════════════════════════════════════
 * 데이터 소스 (ONLY)
 * ═══════════════════════════════════════════════════════
 *
 * 1. NASDAQ Symbol Directory: nasdaqlisted.txt
 * 2. Stooq Daily OHLCV: https://stooq.com/q/d/l/?s={TICKER}.US&i=d
 *
 * ═══════════════════════════════════════════════════════
 * 파이프라인 구조
 * ═══════════════════════════════════════════════════════
 *
 * STAGE 0: Collect   → fetchMetrics + rawDataSamples 필수 → universe (200)
 * STAGE 1: Filter    → Price >= $5, addv20 >= $20M → filtered
 * STAGE 2: Verify    → Gap detection + Split detection → verified
 * STAGE 3: Calculate → Price Integrity (EARLY) + Indicators → calculated
 * STAGE 4: Score     → Trigger + Entry Window + Confidence → picks
 * STAGE 5: Format    → Compact Trader Format (formatting only)
 * STAGE 6: Verify    → Cross-stage consistency (verification only)
 *
 * ═══════════════════════════════════════════════════════
 * 핵심 원칙
 * ═══════════════════════════════════════════════════════
 *
 * "Never skip evidence. Never estimate. Never fabricate.
 *  When in doubt, EXCLUDE."
 *
 * 모든 출력은:
 * - triggerHit = true
 * - entryWindowValid = true
 * - confidenceScore >= 60
 * - 모든 Stage 검증 통과
 * 를 만족해야 함
 */
export const NASDAQ_ANALYSIS_PROMPT = `${COMMON_PRINCIPLES}

${STAGE_0_COLLECT_UNIVERSE}

${STAGE_1_HARD_FILTER}

${STAGE_2_VERIFY_PRICE}

${STAGE_3_CALCULATE_INDICATORS}

${STAGE_4_SCORE_AND_RANK}

${STAGE_5_FORMAT_OUTPUT}

${STAGE_6_FINAL_VERIFICATION}
`;