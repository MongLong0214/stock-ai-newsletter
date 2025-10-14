import { getGPTRecommendation } from './gpt';
import { getClaudeRecommendation } from './claude';
import { getGeminiRecommendation } from './gemini';

export interface ParallelAnalysisResult {
  gptAnalysis: string;
  claudeAnalysis: string;
  geminiAnalysis: string;
}

/**
 * 3개 LLM을 병렬로 실행하여 주식 분석 결과를 가져옵니다.
 * 각 LLM은 독립적으로 실행되며, 하나의 실패가 다른 LLM에 영향을 주지 않습니다.
 */
export async function getParallelAnalysis(): Promise<ParallelAnalysisResult> {
  console.log('🤖 AI 분석 시작 (Gemini만 활성화)...\n');

  const startTime = Date.now();

  // Gemini만 실행 (GPT, Claude는 주석처리)
  const [geminiResult] = await Promise.allSettled([
    // getGPTRecommendation(),  // TODO: 나중에 활성화
    // getClaudeRecommendation(),  // TODO: 나중에 활성화
    getGeminiRecommendation(),
  ]);

  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);

  console.log(`\n⏱️  총 실행 시간: ${duration}초\n`);

  // 결과 처리
  const gptAnalysis = ''; // 빈 문자열 -> "서비스 준비 중입니다" 표시
  const claudeAnalysis = ''; // 빈 문자열 -> "서비스 준비 중입니다" 표시

  const geminiAnalysis =
    geminiResult.status === 'fulfilled'
      ? extractJSON(geminiResult.value)
      : `⚠️ Gemini 분석 실패: ${geminiResult.reason}`;

  // 결과 로깅
  console.log('━'.repeat(80));
  console.log('📊 GPT 분석: ⏸️  비활성화 (서비스 준비 중)');
  console.log('📊 Claude 분석: ⏸️  비활성화 (서비스 준비 중)');
  console.log('📊 Gemini 분석:', geminiAnalysis.startsWith('⚠️') ? '❌ 실패' : '✅ 성공');
  console.log('━'.repeat(80));
  console.log('');

  return {
    gptAnalysis,
    claudeAnalysis,
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