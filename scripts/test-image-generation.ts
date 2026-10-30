import { config } from 'dotenv';
import { resolve } from 'path';
import { existsSync, writeFileSync } from 'fs';
import { textToImage } from '@/lib/text-to-image';
import { getLlmRecommendation } from '@/lib/llm/korea/llm-recommendation';

const envPath = resolve(process.cwd(), '.env.local');
if (existsSync(envPath)) {
  config({ path: envPath });
}

async function testImageGeneration() {
  console.log('🖼️  트위터 이미지 생성 테스트 시작...\n');

  try {
    // OpenAI API 키 확인
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OpenAI API 키가 설정되지 않았습니다.');
    }

    console.log('🤖 GPT로 주식 분석 중...\n');
    console.log('⏳ 분석에 최대 10분까지 소요될 수 있습니다...\n');

    const analysisResult = await getLlmRecommendation();

    // 에러 메시지 체크
    if (analysisResult.startsWith('⚠️')) {
      throw new Error(analysisResult);
    }

    console.log('📊 분석 결과 받음\n');

    // JSON 파싱 및 검증
    const analysisData = JSON.parse(analysisResult);
    console.log(`✅ ${analysisData.length}개 종목 분석 완료\n`);

    // 분석 결과 요약 출력
    console.log('━'.repeat(80));
    console.log('📈 분석된 종목 목록:');
    console.log('━'.repeat(80));

    interface StockAnalysis {
      name: string;
      ticker: string;
      close_price: number;
      signals: { overall_score: number };
    }

    (analysisData as StockAnalysis[]).forEach((stock, index: number) => {
      console.log(`${index + 1}. ${stock.name} (${stock.ticker})`);
      console.log(`   전일종가: ${stock.close_price.toLocaleString()}원`);
      console.log(`   종합점수: ${stock.signals.overall_score}점`);
      console.log('');
    });

    // 이미지 생성
    console.log('━'.repeat(80));
    console.log('🖼️  트위터용 이미지 생성 중...\n');
    const imageBuffer = await textToImage(analysisResult);

    // 로컬에 이미지 저장
    const imagePath = resolve(process.cwd(), 'twitter-image-test.png');
    writeFileSync(imagePath, imageBuffer);

    console.log('✅ 이미지 생성 완료!');
    console.log(`📁 저장 위치: ${imagePath}\n`);
    console.log('━'.repeat(80));
    console.log('💡 이미지 파일을 확인하세요!');
    console.log('💡 트위터 게시는 실행하지 않았습니다.');
    console.log('━'.repeat(80));

    process.exit(0);
  } catch (error) {
    console.error('━'.repeat(80));
    console.error('❌ 테스트 실패:', error);
    console.error('━'.repeat(80));
    process.exit(1);
  }
}

testImageGeneration();
