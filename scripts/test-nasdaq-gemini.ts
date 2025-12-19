import { config } from 'dotenv';
import { getNasdaqGeminiRecommendation } from '../lib/llm/nasdaq/nasdaq-gemini';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { GEMINI_API_CONFIG, PIPELINE_CONFIG } from '../lib/llm/_config/pipeline-config';

// .env.local 파일 로드
config({ path: join(process.cwd(), '.env.local') });

interface Pick {
  rank: number;
  ticker: string;
  price: number;
  signal: string;
  strength: string;
  regime: string;
  confidence: number;
  score: number;
  trigger: string;
  warnings: string[];
}

interface CompactResponse {
  timestamp: string;
  version: string;
  dataQuality: {
    source: string;
    fresh: boolean;
    verified: boolean;
  };
  picks: Pick[];
  summary: {
    totalPicks: number;
    avgConfidence: number | null;
    regimeA: number;
    regimeB: number;
  };
  noPicksReason?: string;
}

async function main() {
  console.log('🚀 NASDAQ Gemini Pipeline v2.2 테스트 시작...\n');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('⚙️  Configuration');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  MODEL: ${GEMINI_API_CONFIG.MODEL}`);
  console.log(`  LOCATION: ${PIPELINE_CONFIG.VERTEX_AI_LOCATION}`);
  console.log(`  FORMAT: Compact Trader Format v2.2`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const startTime = Date.now();

  try {
    const result = await getNasdaqGeminiRecommendation();

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    // 타임스탬프 생성
    const now = new Date();
    const timestamp = now
      .toISOString()
      .replace(/T/, '_')
      .replace(/:/g, '-')
      .split('.')[0];

    const filename = `nasdaq-result_${timestamp}.txt`;
    const filepath = join(process.cwd(), 'output', filename);

    // output 디렉토리 생성
    const outputDir = join(process.cwd(), 'output');
    try {
      mkdirSync(outputDir, { recursive: true });
    } catch {
      // ignore
    }

    // 결과 저장
    const output = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 NASDAQ Gemini Pipeline Result (v2.2)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⏱️  실행 시간: ${duration}초
📅 생성 일시: ${now.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${result}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`.trim();

    writeFileSync(filepath, output, 'utf-8');

    console.log(`\n✅ 테스트 완료! (${duration}초)`);
    console.log(`💾 저장: ${filepath}\n`);

    // JSON 파싱 및 출력
    try {
      const parsed = JSON.parse(result) as CompactResponse;

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📈 TRADING PICKS');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      if (parsed.picks.length === 0) {
        console.log('⚠️  No picks today');
        if (parsed.noPicksReason) {
          console.log(`   Reason: ${parsed.noPicksReason}`);
        }
      } else {
        parsed.picks.forEach((pick) => {
          const confidenceBar = '█'.repeat(Math.floor(pick.confidence / 10));
          const warningStr =
            pick.warnings.length > 0 ? ` ⚠️ ${pick.warnings.join(', ')}` : '';

          console.log(`  #${pick.rank} ${pick.ticker}`);
          console.log(`     💵 $${pick.price.toFixed(2)}`);
          console.log(`     📊 ${pick.signal} (${pick.strength})`);
          console.log(`     🎯 Confidence: ${pick.confidence} ${confidenceBar}`);
          console.log(`     📈 Score: ${pick.score.toFixed(1)}`);
          console.log(`     💡 ${pick.trigger}`);
          if (warningStr) console.log(`    ${warningStr}`);
          console.log('');
        });
      }

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📊 SUMMARY');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`  Total Picks: ${parsed.summary.totalPicks}`);
      console.log(`  Avg Confidence: ${parsed.summary.avgConfidence ?? 'N/A'}`);
      console.log(`  Regime A (Range): ${parsed.summary.regimeA}`);
      console.log(`  Regime B (Trend): ${parsed.summary.regimeB}`);
      console.log(
        `  Data: ${parsed.dataQuality.fresh ? '✓ Fresh' : '✗ Stale'} | ${parsed.dataQuality.verified ? '✓ Verified' : '✗ Unverified'}`
      );
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    } catch {
      console.log('⚠️  JSON 파싱 실패 - 원본 저장됨');
    }
  } catch (error) {
    console.error('❌ 테스트 실패:', error);
    process.exit(1);
  }
}

main();