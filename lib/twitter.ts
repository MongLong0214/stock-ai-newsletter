import { TwitterApi } from 'twitter-api-v2';
import { textToImage } from './text-to-image';

// X(Twitter) API 클라이언트 초기화
function getTwitterClient() {
  const apiKey = process.env.TWITTER_API_KEY;
  const apiSecret = process.env.TWITTER_API_SECRET;
  const accessToken = process.env.TWITTER_ACCESS_TOKEN;
  const accessSecret = process.env.TWITTER_ACCESS_SECRET;

  if (!apiKey || !apiSecret || !accessToken || !accessSecret) {
    throw new Error('Twitter API credentials are not configured');
  }

  return new TwitterApi({
    appKey: apiKey,
    appSecret: apiSecret,
    accessToken: accessToken,
    accessSecret: accessSecret,
  });
}

interface StockAnalysis {
  ticker: string;
  name: string;
  close_price: number;
  rationale: string;
  signals: {
    trend_score: number;
    momentum_score: number;
    volume_score: number;
    volatility_score: number;
    pattern_score: number;
    sentiment_score: number;
    overall_score: number;
  };
}


/**
 * 이미지로 트윗 게시 (JSON 데이터를 이미지로 변환)
 */
export async function postTweetWithImage(analysis: StockAnalysis[]): Promise<string> {
  try {
    const client = getTwitterClient();
    const rwClient = client.readWrite;

    // 1. JSON 데이터를 이미지로 변환
    console.log('🖼️  분석 데이터를 이미지로 변환 중...');
    const jsonData = JSON.stringify(analysis);
    const imageBuffer = await textToImage(jsonData);

    // 2. 이미지 업로드 (v1.1 media post는 Free tier에서 허용)
    console.log('📤 이미지 업로드 중...');
    const mediaId = await rwClient.v1.uploadMedia(imageBuffer, {
      mimeType: 'image/png',
    });

    // 3. 이미지와 함께 트윗 (v2 API - Free tier 허용)
    console.log('🐦 트윗 게시 중...');

    // 한국 시간 기준 날짜 생성
    const today = new Date().toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'Asia/Seoul',
    });

    const tweet = await rwClient.v2.tweet({
      text: `📊 ${today} AI 주식 분석\n\n개장 10분 전, 3개 종목의 자세한 기술적 분석 데이터를 메일로 받아보세요(For Free)\n👉 https://stockmatrix.co.kr\n\n#주식 #코스피 #AI주식분석`,
      media: { media_ids: [mediaId] },
    });

    console.log('✅ 트윗 게시 성공:', tweet.data.id);
    return tweet.data.id;
  } catch (error) {
    console.error('❌ 트윗 게시 실패:', error);
    throw error;
  }
}

/**
 * 뉴스레터 분석 결과를 자동으로 트윗 (이미지로 게시)
 */
export async function postNewsletterToTwitter(analysis: StockAnalysis[]): Promise<void> {
  try {
    console.log('🐦 X(Twitter) 자동 게시 시작...\n');
    await postTweetWithImage(analysis);
    console.log('✅ X(Twitter) 자동 게시 완료\n');
  } catch (error) {
    console.error('❌ X(Twitter) 자동 게시 실패:', error);
    // 트위터 게시 실패해도 뉴스레터 발송은 계속 진행
  }
}