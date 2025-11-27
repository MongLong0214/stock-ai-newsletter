import { config } from 'dotenv';
import { resolve } from 'path';
import { existsSync, writeFileSync } from 'fs';
import { textToImage } from '@/lib/text-to-image';
import { getGeminiRecommendation } from '@/lib/llm/korea/gemini';
import { postTweetWithImage } from '@/lib/twitter';

const envPath = resolve(process.cwd(), '.env.local');
if (existsSync(envPath)) {
  config({ path: envPath });
}

async function testTwitter() {
  console.log('🐦 Twitter 게시 테스트 시작...\n');

  try {
    // API 환경변수 확인
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('Gemini API 키가 설정되지 않았습니다.');
    }

    if (
      !process.env.TWITTER_API_KEY ||
      !process.env.TWITTER_API_SECRET ||
      !process.env.TWITTER_ACCESS_TOKEN ||
      !process.env.TWITTER_ACCESS_SECRET
    ) {
      throw new Error('Twitter API 환경변수가 설정되지 않았습니다.');
    }

    console.log('🤖 Gemini AI로 주식 분석 중...\n');
    const analysisResult = await getGeminiRecommendation();

    // 에러 메시지 체크
    if (analysisResult.startsWith('⚠️')) {
      throw new Error(analysisResult);
    }

    console.log('📊 분석 결과 받음\n');
    const analysisData = JSON.parse(analysisResult);

    // 로컬에 이미지 저장
    console.log('🖼️  이미지 생성 중...\n');
    const imageBuffer = await textToImage(analysisResult);
    const imagePath = resolve(process.cwd(), 'test-tweet-image.png');
    writeFileSync(imagePath, imageBuffer);
    console.log('✅ 이미지 저장 완료:', imagePath, '\n');

    // 실제 트위터 게시
    console.log('🚀 트위터에 게시 중...\n');
    const tweetId = await postTweetWithImage(analysisData);
    console.log(`\n✅ 트윗 게시 완료!`);
    console.log(`🔗 https://twitter.com/user/status/${tweetId}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ 테스트 실패:', error);
    process.exit(1);
  }
}

testTwitter();