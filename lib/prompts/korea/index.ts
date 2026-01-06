/**
 * 한국 주식 분석 프롬프트 모듈
 *
 * 환각 방지를 위한 동적 날짜 주입 시스템 적용
 *
 * @example
 * ```typescript
 * // 기본 사용 (현재 시간 기준)
 * const prompt = createStockAnalysisPrompt();
 *
 * // 특정 시점 기준
 * const prompt = createStockAnalysisPrompt(new Date('2026-01-06T09:00:00+09:00'));
 * ```
 */

import { createDateContext, validateDateContext } from './date-context-factory';
import { getCommonPrinciples } from './common-principles';
import { STAGE_0_COLLECT_200 } from './stage-0-collect-200';
import { STAGE_1_FILTER_30 } from './stage-1-filter-30';
import { getStage2VerifyPrice } from './stage-2-verify-price';
import { getStage3CollectIndicators } from './stage-3-collect-indicators';
import { STAGE_4_CALCULATE_SCORES } from './stage-4-calculate-scores';
import { STAGE_5_JSON_OUTPUT } from './stage-5-json-output';
import { getStage6FinalVerification } from './stage-6-final-verification';

// Type exports
export type { DateContext, DateInfo, TargetDateInfo, SearchFormats } from './types';

// Utility re-exports
export { createDateContext, validateDateContext };

// Stage re-exports (for testing or selective use)
export {
  getCommonPrinciples,
  STAGE_0_COLLECT_200,
  STAGE_1_FILTER_30,
  getStage2VerifyPrice,
  getStage3CollectIndicators,
  STAGE_4_CALCULATE_SCORES,
  STAGE_5_JSON_OUTPUT,
  getStage6FinalVerification,
};

/**
 * 전체 주식 분석 프롬프트 생성
 *
 * 환각 방지를 위해 실행 시점에 정확한 날짜가 동적으로 주입됩니다.
 *
 * 구조:
 * - 공통 원칙 (절대 원칙, 최종 목표, 환각 방지 체크리스트)
 * - STAGE 0: 200개 종목 수집
 * - STAGE 1: 200개 → 30개 필터링
 * - STAGE 2: 전일 종가 초정밀 검증 (날짜 동적 주입)
 * - STAGE 3: 30개 지표 수집 (날짜 동적 주입)
 * - STAGE 4: 7-카테고리 점수 산정
 * - STAGE 5: JSON 출력 + 최종 검증
 * - STAGE 6: 사실관계 재검증 및 JSON 정제 (날짜 동적 주입)
 *
 * @param executionDate - 프롬프트 실행 시점 (기본값: 현재 시간)
 * @returns 전체 주식 분석 프롬프트 문자열
 */
export function createStockAnalysisPrompt(executionDate: Date = new Date()): string {
  const context = createDateContext(executionDate);

  return `${getCommonPrinciples(context)}

${STAGE_0_COLLECT_200}

${STAGE_1_FILTER_30}

${getStage2VerifyPrice(context)}

${getStage3CollectIndicators(context)}

${STAGE_4_CALCULATE_SCORES}

${STAGE_5_JSON_OUTPUT}

${getStage6FinalVerification(context)}`;
}
