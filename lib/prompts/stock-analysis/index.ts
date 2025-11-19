import { COMMON_PRINCIPLES } from './common-principles';
import { STAGE_0_COLLECT_200 } from './stage-0-collect-200';
import { STAGE_1_FILTER_30 } from './stage-1-filter-30';
import { STAGE_2_VERIFY_PRICE } from './stage-2-verify-price';
import { STAGE_3_COLLECT_INDICATORS } from './stage-3-collect-indicators';
import { STAGE_4_CALCULATE_SCORES } from './stage-4-calculate-scores';
import { STAGE_5_JSON_OUTPUT } from './stage-5-json-output';
import { STAGE_6_FINAL_VERIFICATION } from './stage-6-final-verification';
import { STAGE_7_FINAL_CONFIRMATION } from './stage-7-final-confirmation';

/**
 * 전체 주식 분석 프롬프트
 *
 * 구조:
 * - 공통 원칙 (절대 원칙, 최종 목표)
 * - STAGE 0: 200개 종목 수집
 * - STAGE 1: 200개 → 30개 필터링
 * - STAGE 2: 전일종가 초정밀 검증
 * - STAGE 3: 30개 지표 수집
 * - STAGE 4: 7-카테고리 점수 산정
 * - STAGE 5: JSON 출력 + 최종 검증
 * - STAGE 6: 사실관계 재검증 및 JSON 정제
 * - STAGE 7: 상위 0.1% 트레이더 최종 컨펌 (1주일 10% 목표 실전 검증)
 */
export const STOCK_ANALYSIS_PROMPT = `${COMMON_PRINCIPLES}

${STAGE_0_COLLECT_200}

${STAGE_1_FILTER_30}

${STAGE_2_VERIFY_PRICE}

${STAGE_3_COLLECT_INDICATORS}

${STAGE_4_CALCULATE_SCORES}

${STAGE_5_JSON_OUTPUT}

${STAGE_6_FINAL_VERIFICATION}

${STAGE_7_FINAL_CONFIRMATION}
`;