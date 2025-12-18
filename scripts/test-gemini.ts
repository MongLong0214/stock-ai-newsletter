import { config } from 'dotenv';
import { getGeminiRecommendation } from '../lib/llm/korea/gemini';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { GEMINI_API_CONFIG, PIPELINE_CONFIG } from '../lib/llm/_config/pipeline-config';

// .env.local 파일 로드
config({ path: join(process.cwd(), '.env.local') });

async function main() {
  console.log('🚀 Gemini API 테스트 시작...\n');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('⚙️  Model Configuration');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  MODEL: ${GEMINI_API_CONFIG.MODEL}`);
  console.log(`  MAX_OUTPUT_TOKENS: ${GEMINI_API_CONFIG.MAX_OUTPUT_TOKENS}`);
  console.log(`  TEMPERATURE: ${GEMINI_API_CONFIG.TEMPERATURE}`);
  console.log(`  TOP_P: ${GEMINI_API_CONFIG.TOP_P}`);
  console.log(`  TOP_K: ${GEMINI_API_CONFIG.TOP_K}`);
  console.log(`  LOCATION: ${PIPELINE_CONFIG.VERTEX_AI_LOCATION}`);
  console.log(`  THINKING_LEVEL: HIGH`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const startTime = Date.now();

  try {
    // Gemini API 호출
    const result = await getGeminiRecommendation();

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    // 타임스탬프 생성 (YYYY-MM-DD_HH-mm-ss 형식)
    const now = new Date();
    const timestamp = now.toISOString()
      .replace(/T/, '_')
      .replace(/:/g, '-')
      .split('.')[0];

    // 파일명: gemini-result_2025-10-15_14-30-45.txt
    const filename = `gemini-result_${timestamp}.txt`;
    const filepath = join(process.cwd(), 'output', filename);

    // output 디렉토리 생성 (없으면)
    const { mkdirSync } = await import('fs');
    const outputDir = join(process.cwd(), 'output');
    try {
      mkdirSync(outputDir, { recursive: true });
    } catch {
      // 디렉토리가 이미 존재하는 경우 무시
    }

    // 결과 저장
    const output = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Gemini Stock Analysis Result
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⏱️  실행 시간: ${duration}초
📅 생성 일시: ${now.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}
🤖 모델: ${GEMINI_API_CONFIG.MODEL}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${result}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`.trim();

    writeFileSync(filepath, output, 'utf-8');

    console.log(`\n✅ 테스트 완료!`);
    console.log(`⏱️  실행 시간: ${duration}초`);
    console.log(`💾 결과 저장: ${filepath}\n`);

    // JSON 파싱 시도
    try {
      const parsed = JSON.parse(result) as Array<{ name: string; ticker: string }>;
      console.log(`📦 추천 종목 수: ${parsed.length}개`);
      parsed.forEach((stock, idx: number) => {
        console.log(`  ${idx + 1}. ${stock.name} (${stock.ticker})`);
      });
    } catch {
      console.log('⚠️  JSON 파싱 실패 - 원본 텍스트로 저장됨');
    }

  } catch (error) {
    console.error('❌ 테스트 실패:', error);
    process.exit(1);
  }
}

main();