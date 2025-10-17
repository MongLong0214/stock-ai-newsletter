import { config } from 'dotenv';
import { resolve } from 'path';
import { existsSync } from 'fs';
import { postTweet, formatTweetContent } from '@/lib/twitter';
import { getParallelAnalysis } from '@/lib/llm/parallel-analysis';

const envPath = resolve(process.cwd(), '.env.local');
if (existsSync(envPath)) {
  config({ path: envPath });
}

async function testTwitter() {
  console.log('🐦 Twitter API 테스트 시작...\n');

  try {
    if (
      !process.env.TWITTER_API_KEY ||
      !process.env.TWITTER_API_SECRET ||
      !process.env.TWITTER_ACCESS_TOKEN ||
      !process.env.TWITTER_ACCESS_SECRET
    ) {
      throw new Error('Twitter API 환경변수가 설정되지 않았습니다.');
    }

    console.log('🤖 Gemini AI 분석 실행 중...\n');
    const { geminiAnalysis } = await getParallelAnalysis();
    const analysisData = JSON.parse(geminiAnalysis);

    const tweetContent = formatTweetContent(analysisData);

    console.log('생성된 트윗:');
    console.log('━'.repeat(80));
    console.log(tweetContent);
    console.log('━'.repeat(80));
    console.log(`문자 수: ${tweetContent.length}/280\n`);

    console.log('🚀 트윗 게시 중...\n');
    await postTweet(tweetContent);
    console.log('✅ 트윗 게시 완료!\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ 테스트 실패:', error);
    process.exit(1);
  }
}

testTwitter();