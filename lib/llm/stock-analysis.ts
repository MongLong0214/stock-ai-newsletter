import { getLlmRecommendation } from './korea/llm-recommendation';
import type { MarketAssessment } from './korea/llm-pipeline';

/**
 * 주식 분석 결과
 */
export interface StockAnalysisResult {
  /** GPT 분석 결과 JSON 문자열 */
  geminiAnalysis: string;
}

export interface StockAnalysisOptions {
  /** prepare 단계에서 이미 끝낸 시장평가를 재사용해 중복 평가를 막는다. */
  readonly marketAssessment?: MarketAssessment;
}

/**
 * GPT Multi-Stage Pipeline을 사용하여 주식 분석 수행
 *
 * 실행 흐름:
 * 1. GPT Pipeline 실행 (6개 Stage 순차 처리)
 * 2. JSON 추출 및 검증 (llm-recommendation.ts에서 처리)
 * 3. 실행 시간 측정 및 로깅
 *
 * @returns 주식 분석 결과 (3개 추천 종목 JSON)
 */
export async function getStockAnalysis(options: StockAnalysisOptions = {}): Promise<StockAnalysisResult> {
  console.log('🤖 GPT 주식 분석 시작...\n');

  const startTime = Date.now();
  try {
    const geminiAnalysis = await getLlmRecommendation(options.marketAssessment);
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    console.log(`\n⏱️  총 실행 시간: ${duration}초\n`);
    console.log('━'.repeat(80));
    console.log('📊 GPT 분석: ✅ 성공');
    console.log('━'.repeat(80));
    console.log('');

    return {
      geminiAnalysis,
    };
  } catch (error) {
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    console.log(`\n⏱️  총 실행 시간: ${duration}초\n`);
    console.log('━'.repeat(80));
    console.log('📊 GPT 분석: ❌ 실패');
    console.log('━'.repeat(80));
    console.log('');

    throw error;
  }
}
