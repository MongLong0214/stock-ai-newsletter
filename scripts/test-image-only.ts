import { textToImage } from '../lib/text-to-image';
import { writeFileSync } from 'fs';
import { resolve } from 'path';

// 목 데이터
const mockData = [
  {
    ticker: 'KOSPI:000660',
    name: 'SK하이닉스',
    close_price: 231000,
    rationale: 'SMA완전정배열|EMA골든크로스|RSI 68 과열근접',
    signals: {
      trend_score: 95,
      momentum_score: 82,
      volume_score: 91,
      volatility_score: 88,
      pattern_score: 90,
      sentiment_score: 86,
      overall_score: 89,
    },
  },
  {
    ticker: 'KOSPI:105560',
    name: 'KB금융',
    close_price: 82300,
    rationale: '현재가>SMA5>SMA20|EMA 정배열|RSI 65 강세',
    signals: {
      trend_score: 94,
      momentum_score: 90,
      volume_score: 86,
      volatility_score: 81,
      pattern_score: 85,
      sentiment_score: 90,
      overall_score: 89,
    },
  },
  {
    ticker: 'KOSPI:042660',
    name: '한화오션',
    close_price: 35150,
    rationale: '현재가>SMA20>SMA60|EMA 단기>장기|RSI 62 강세',
    signals: {
      trend_score: 88,
      momentum_score: 85,
      volume_score: 94,
      volatility_score: 90,
      pattern_score: 85,
      sentiment_score: 88,
      overall_score: 88,
    },
  },
];

async function testImageGeneration() {
  console.log('🖼️  이미지 생성 중...\n');

  const jsonData = JSON.stringify(mockData);
  const imageBuffer = await textToImage(jsonData);

  const outputPath = resolve(process.cwd(), 'test-image-only.png');
  writeFileSync(outputPath, imageBuffer);

  console.log(`✅ 이미지 저장 완료: ${outputPath}\n`);
}

testImageGeneration();