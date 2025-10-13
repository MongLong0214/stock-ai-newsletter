import 'dotenv/config';
import { getGeminiRecommendation } from '../lib/llm/gemini';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { config } from 'dotenv';

// .env.local 파일 로드
config({ path: '.env.local' });

async function testGemini() {
  console.log('🧪 Gemini 2.5 Flash 웹 검색 기능 테스트 시작...\n');
  console.log('⏳ 분석 중... (최대 10분 소요)\n');

  const startTime = Date.now();
  const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];

  try {
    const result = await getGeminiRecommendation();
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    console.log('✅ Gemini 분석 완료\n');
    console.log(`⏱️  소요 시간: ${duration}초\n`);
    console.log('📊 분석 결과:\n');
    console.log('━'.repeat(80));
    console.log(result);
    console.log('━'.repeat(80));

    // 결과를 타임스탬프 파일로 저장
    const filename = `test-results-gemini-${timestamp}.txt`;
    const filepath = join(process.cwd(), filename);
    const output = `Gemini 2.5 Flash 웹 검색 테스트 결과
테스트 시간: ${new Date().toLocaleString('ko-KR')}
소요 시간: ${duration}초

${'='.repeat(80)}
분석 결과:
${'='.repeat(80)}

${result}
`;

    writeFileSync(filepath, output, 'utf-8');
    console.log(`\n💾 결과 저장됨: ${filename}`);
  } catch (error) {
    console.error('❌ 테스트 실패:', error);
    process.exit(1);
  }
}

testGemini();