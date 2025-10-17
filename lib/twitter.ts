import { TwitterApi } from 'twitter-api-v2';

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
 * 뉴스레터 데이터를 트윗 형식으로 포맷팅
 */
export function formatTweetContent(analysis: StockAnalysis[]): string {
  const today = new Date().toLocaleDateString('ko-KR', {
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Seoul',
  });

  // 트윗 헤더
  let tweet = `📊 STOCK MATRIX - ${today}\n\n`;
  tweet += `AI 30개 지표 분석\n`;
  tweet += `오늘의 시그널\n\n`;

  // 상위 3개 종목
  const topStocks = analysis.slice(0, 3);

  topStocks.forEach((stock, index) => {
    tweet += `${index + 1}. ${stock.name} ${stock.signals.overall_score}점\n`;

    // 주요 지표 3개 표시
    const indicators = stock.rationale
      .split('|')
      .slice(0, 3)
      .map(ind => ind.trim())
      .join(', ');
    tweet += `${indicators}\n\n`;
  });

  // CTA
  tweet += `📧 매일 개장 10분 전\n`;
  tweet += `5종목 전체분석 (무료)\n`;
  tweet += `stockmatrix.co.kr`;

  return tweet;
}

/**
 * 스레드 형식으로 트윗 생성 (프로페셔널 & 후킹 최적화)
 */
export function formatTweetThread(analysis: StockAnalysis[]): string[] {
  const today = new Date().toLocaleDateString('ko-KR', {
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Seoul',
  });

  const tweets: string[] = [];

  // 코스피/코스닥 개수 계산
  const kospiCount = analysis.filter((s) => s.ticker.startsWith('KOSPI')).length;
  const kosdaqCount = analysis.filter((s) => s.ticker.startsWith('KOSDAQ')).length;

  // 첫 번째 트윗 (헤더)
  const topStock = analysis[0];
  const topMarket = topStock.ticker.startsWith('KOSPI') ? 'KOSPI' : 'KOSDAQ';
  tweets.push(
    `📊 ${today} 기술적 분석\n\n` +
      `코스피 ${kospiCount}개, 코스닥 ${kosdaqCount}개\n` +
      `30개 기술 지표 분석\n\n` +
      `1위: ${topMarket} ${topStock.name}\n` +
      `종합 점수: ${topStock.signals.overall_score}점\n\n` +
      `투자 참고용 데이터입니다.`
  );

  // 각 종목별 트윗 (2-6번째)
  analysis.forEach((stock, index) => {
    const rank = index + 1;
    const market = stock.ticker.startsWith('KOSPI') ? 'KOSPI' : 'KOSDAQ';

    let stockTweet = `${rank}. ${stock.name} (${market})\n`;
    stockTweet += `전일 종가: ${stock.close_price.toLocaleString()}원\n\n`;

    // 모든 지표 점수 표시
    stockTweet += `종합 ${stock.signals.overall_score}점\n`;
    stockTweet += `추세 ${stock.signals.trend_score} | 모멘텀 ${stock.signals.momentum_score}\n`;
    stockTweet += `거래량 ${stock.signals.volume_score} | 변동성 ${stock.signals.volatility_score}\n`;
    stockTweet += `패턴 ${stock.signals.pattern_score} | 심리 ${stock.signals.sentiment_score}\n\n`;

    // 주요 지표 (더 많이 표시)
    const indicators = stock.rationale
      .split('|')
      .slice(0, 5)
      .map((ind) => `• ${ind.trim()}`)
      .join('\n');
    stockTweet += indicators;

    tweets.push(stockTweet);
  });

  // 마지막 트윗 (CTA)
  tweets.push(
    `매일 오전 7:50 (개장 10분전)\n` +
      `이메일로 전체 분석을 받아보실 수 있습니다.\n\n` +
      `30개 기술 지표 분석\n` +
      `코스피·코스닥 종목\n` +
      `무료 구독\n\n` +
      `stockmatrix.co.kr\n\n` +
      `#기술적분석 #주식분석`
  );

  return tweets;
}

/**
 * 단일 트윗 게시
 */
export async function postTweet(content: string): Promise<string> {
  try {
    const client = getTwitterClient();
    const rwClient = client.readWrite;

    const tweet = await rwClient.v2.tweet(content);
    console.log('✅ 트윗 게시 성공:', tweet.data.id);

    return tweet.data.id;
  } catch (error) {
    console.error('❌ 트윗 게시 실패:', error);
    throw error;
  }
}

/**
 * 스레드 형식으로 여러 트윗 게시
 */
export async function postTweetThread(tweets: string[]): Promise<string[]> {
  try {
    const client = getTwitterClient();
    const rwClient = client.readWrite;

    const tweetIds: string[] = [];
    let previousTweetId: string | undefined;

    for (const tweetContent of tweets) {
      const tweetOptions: {
        text: string;
        reply?: { in_reply_to_tweet_id: string };
      } = { text: tweetContent };

      // 이전 트윗에 대한 답글로 게시 (스레드 형성)
      if (previousTweetId) {
        tweetOptions.reply = {
          in_reply_to_tweet_id: previousTweetId,
        };
      }

      const tweet = await rwClient.v2.tweet(tweetOptions);
      tweetIds.push(tweet.data.id);
      previousTweetId = tweet.data.id;

      console.log(`✅ 트윗 ${tweetIds.length}/${tweets.length} 게시 완료`);

      // Rate limit 방지를 위한 딜레이
      if (tweetIds.length < tweets.length) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    console.log('✅ 스레드 게시 완료:', tweetIds.length, '개 트윗');
    return tweetIds;
  } catch (error) {
    console.error('❌ 스레드 게시 실패:', error);
    throw error;
  }
}

/**
 * 뉴스레터 분석 결과를 자동으로 트윗
 */
export async function postNewsletterToTwitter(
  analysis: StockAnalysis[],
  useThread = true
): Promise<void> {
  try {
    console.log('🐦 X(Twitter) 자동 게시 시작...\n');

    if (useThread) {
      // 스레드 형식으로 게시 (권장)
      const tweets = formatTweetThread(analysis);
      await postTweetThread(tweets);
    } else {
      // 단일 트윗으로 게시
      const tweetContent = formatTweetContent(analysis);
      await postTweet(tweetContent);
    }

    console.log('✅ X(Twitter) 자동 게시 완료\n');
  } catch (error) {
    console.error('❌ X(Twitter) 자동 게시 실패:', error);
    // 트위터 게시 실패해도 뉴스레터 발송은 계속 진행
  }
}