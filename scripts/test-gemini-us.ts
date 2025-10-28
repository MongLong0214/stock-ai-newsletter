import { config } from 'dotenv';
import { getGeminiRecommendationNasdaq } from '@/lib/llm/gemini-us';
import { writeFileSync } from 'fs';
import { join } from 'path';

// .env.local 파일 로드
config({ path: join(process.cwd(), '.env.local') });

async function main() {
  console.log('🚀 Gemini API 테스트 시작 (NASDAQ)...\n');

  const startTime = Date.now();

  try {
    // Gemini API 호출 (NASDAQ)
    const result = await getGeminiRecommendationNasdaq();

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    // 타임스탬프 생성 (YYYY-MM-DD_HH-mm-ss 형식)
    const now = new Date();
    const timestamp = now.toISOString()
      .replace(/T/, '_')
      .replace(/:/g, '-')
      .split('.')[0];

    // 파일명: gemini-nasdaq-result_2025-10-15_14-30-45.txt
    const filename = `gemini-nasdaq-result_${timestamp}.txt`;
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
📊 Gemini NASDAQ Stock Analysis Result
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⏱️  실행 시간: ${duration}초
📅 생성 일시: ${now.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}
🤖 모델: gemini-2.5-pro
🌎 시장: NASDAQ

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