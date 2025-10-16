import { getGeminiRecommendation } from './gemini';

export interface ParallelAnalysisResult {
  geminiAnalysis: string;
}

/**
 * Gemini를 사용하여 주식 분석 결과를 가져옵니다.
 */
export async function getParallelAnalysis(): Promise<ParallelAnalysisResult> {
  console.log('🤖 AI 분석 시작 (Gemini)...\n');

  const startTime = Date.now();

  const [geminiResult] = await Promise.allSettled([
    getGeminiRecommendation(),
  ]);

  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);

  console.log(`\n⏱️  총 실행 시간: ${duration}초\n`);

  const geminiAnalysis =
    geminiResult.status === 'fulfilled'
      ? extractJSON(geminiResult.value)
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

/**
 * 응답 텍스트에서 JSON 배열만 추출합니다.
 * JSON이 없으면 원본 텍스트를 반환합니다.
 */
function extractJSON(text: string): string {
  // 이미 에러 메시지인 경우 그대로 반환
  if (text.startsWith('⚠️')) {
    return text;
  }

  // JSON 배열 추출 시도
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    try {
      // JSON 파싱 테스트
      JSON.parse(jsonMatch[0]);
      return jsonMatch[0];
    } catch (error) {
      console.warn('JSON 파싱 실패, 원본 텍스트 반환:', error);
      return text;
    }
  }

  return text;
}