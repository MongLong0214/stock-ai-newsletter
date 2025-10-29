import { getGeminiRecommendation } from './gemini';

/**
 * 주식 분석 결과
 */
export interface StockAnalysisResult {
  /** Gemini 분석 결과 (JSON 문자열 또는 에러 메시지) */
  geminiAnalysis: string;
}

/**
 * Gemini Multi-Stage Pipeline을 사용하여 주식 분석 수행
 *
 * 실행 흐름:
 * 1. Gemini Pipeline 실행 (6개 Stage 순차 처리)
 * 2. JSON 추출 및 검증 (gemini.ts에서 처리)
 * 3. 실행 시간 측정 및 로깅
 *
 * @returns 주식 분석 결과 (3개 추천 종목 JSON)
 */
export async function getStockAnalysis(): Promise<StockAnalysisResult> {
  console.log('🤖 Gemini 주식 분석 시작...\n');

  const startTime = Date.now();

  // Gemini Pipeline 실행 (Promise.allSettled로 에러 처리)
  const [geminiResult] = await Promise.allSettled([getGeminiRecommendation()]);

  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);

  console.log(`\n⏱️  총 실행 시간: ${duration}초\n`);

  // 결과 추출 (gemini.ts에서 이미 검증된 JSON 또는 에러 메시지)
  const geminiAnalysis =
    geminiResult.status === 'fulfilled'
      ? geminiResult.value
      : `⚠️ Gemini 분석 실패: ${geminiResult.reason}`;

  // 결과 로깅
  console.log('━'.repeat(80));
  console.log('📊 Gemini 분석:', geminiAnalysis.startsWith('⚠️') ? '❌ 실패' : '✅ 성공');
  console.log('━'.repeat(80));
  console.log('');

  return {
    geminiAnalysis,
  };
}