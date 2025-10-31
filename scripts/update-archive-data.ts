// 환경변수를 가장 먼저 로드
import { config } from 'dotenv';
import { resolve } from 'path';
import { existsSync, writeFileSync, mkdirSync } from 'fs';

// 로컬 환경에서만 .env.local 로드 (GitHub Actions는 환경변수 직접 사용)
const envPath = resolve(process.cwd(), '.env.local');
if (existsSync(envPath)) {
  config({ path: envPath });
}

import { createClient } from '@supabase/supabase-js';
import type { NewsletterArchive, StockData, DateString, ISODateTime } from '@/app/archive/_types/archive.types';

// 환경변수 검증
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
}
if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is not set');
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  {
    auth: { persistSession: false },
    db: { schema: 'public' },
  }
);

/**
 * Supabase에서 전체 아카이브 데이터 조회 및 JSON 파일 생성
 *
 * 실행 흐름:
 * 1. Supabase에서 is_sent=true인 모든 뉴스레터 조회
 * 2. 데이터 검증 및 변환
 * 3. app/data/archives.json 파일로 저장
 */
async function updateArchiveData() {
  console.log('━'.repeat(80));
  console.log('🗄️  아카이브 데이터 업데이트 시작');
  console.log('━'.repeat(80) + '\n');

  try {
    // 1. Supabase에서 발송 완료된 뉴스레터 전체 조회
    console.log('📊 Supabase에서 뉴스레터 데이터 조회 중...');

    const { data: newsletters, error } = await supabase
      .from('newsletter_content')
      .select('*')
      .eq('is_sent', true)
      .order('newsletter_date', { ascending: false });

    if (error) {
      console.error('❌ Database error:', error);
      throw new Error(`Database error: ${error.message}`);
    }

    if (!newsletters || newsletters.length === 0) {
      console.log('⚠️  발송된 뉴스레터가 없습니다. 빈 배열로 저장합니다.');
      const emptyData = { newsletters: [], lastUpdated: new Date().toISOString() };
      saveToFile(emptyData);
      return;
    }

    console.log(`✅ ${newsletters.length}개의 뉴스레터 조회 완료\n`);

    // 2. 데이터 검증 및 변환
    console.log('🔍 데이터 검증 및 변환 중...');

    const archiveData: NewsletterArchive[] = [];
    let validCount = 0;
    let invalidCount = 0;

    for (const newsletter of newsletters) {
      try {
        const stocks = parseAndValidateStocks(newsletter.gemini_analysis);

        if (!stocks) {
          console.warn(`⚠️  ${newsletter.newsletter_date}: 유효하지 않은 데이터 - 건너뜀`);
          invalidCount++;
          continue;
        }

        archiveData.push({
          date: newsletter.newsletter_date as DateString,
          stocks,
          sentAt: newsletter.sent_at as ISODateTime | null,
          subscriberCount: newsletter.subscriber_count ?? 0,
        });

        validCount++;
      } catch (parseError) {
        console.error(`❌ ${newsletter.newsletter_date} 파싱 실패:`, parseError);
        invalidCount++;
      }
    }

    console.log(`✅ 검증 완료: ${validCount}개 유효, ${invalidCount}개 무효\n`);

    // 3. JSON 파일로 저장
    const outputData = {
      newsletters: archiveData,
      lastUpdated: new Date().toISOString(),
    };

    saveToFile(outputData);

    console.log('\n━'.repeat(80));
    console.log('✨ 아카이브 데이터 업데이트 완료!');
    console.log('━'.repeat(80));
    console.log(`\n📦 저장된 뉴스레터: ${validCount}개`);
    console.log(`📅 날짜 범위: ${archiveData[archiveData.length - 1]?.date} ~ ${archiveData[0]?.date}`);
    console.log(`🕐 업데이트 시각: ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}\n`);

    process.exit(0);
  } catch (error) {
    console.error('❌ 아카이브 데이터 업데이트 실패:', error);
    process.exit(1);
  }
}

/**
 * 주식 JSON 데이터 파싱 및 검증
 *
 * @param jsonString - 파싱할 JSON 문자열
 * @returns 검증된 주식 데이터 배열 또는 null
 */
function parseAndValidateStocks(jsonString: string): StockData[] | null {
  // 보안: JSON Bomb 방지 - 크기 제한 체크
  const MAX_JSON_SIZE = 1024 * 1024; // 1MB
  if (jsonString.length > MAX_JSON_SIZE) {
    console.error('[Update] JSON too large:', jsonString.length);
    return null;
  }

  try {
    const stocks = JSON.parse(jsonString);

    // 검증: 배열이어야 함
    if (!Array.isArray(stocks)) {
      console.error('[Update] Invalid data: not an array');
      return null;
    }

    // 검증: 배열 크기 제한 (최대 100개)
    if (stocks.length === 0 || stocks.length > 100) {
      console.error('[Update] Invalid array size:', stocks.length);
      return null;
    }

    // 검증: 각 주식은 필수 필드를 가져야 함
    const isValid = stocks.every((stock) => {
      // 프로토타입 오염 공격 방지: 직접 프로퍼티만 확인
      const hasOwnProto = Object.prototype.hasOwnProperty.call(stock, '__proto__');
      const hasOwnConstructor = Object.prototype.hasOwnProperty.call(stock, 'constructor');

      const checks = {
        isObject: stock && typeof stock === 'object',
        noProto: !hasOwnProto, // 직접 프로퍼티로 __proto__가 없어야 함
        noConstructor: !hasOwnConstructor, // 직접 프로퍼티로 constructor가 없어야 함
        hasTicker: typeof stock.ticker === 'string' && stock.ticker.length > 0,
        hasName: typeof stock.name === 'string' && stock.name.length > 0,
        hasPrice: typeof stock.close_price === 'number' && stock.close_price > 0,
        hasRationale: typeof stock.rationale === 'string' && stock.rationale.length > 0,
        hasSignals: stock.signals && typeof stock.signals === 'object',
        hasTrendScore: typeof stock.signals?.trend_score === 'number',
        hasMomentumScore: typeof stock.signals?.momentum_score === 'number',
        hasVolumeScore: typeof stock.signals?.volume_score === 'number',
        hasVolatilityScore: typeof stock.signals?.volatility_score === 'number',
        hasPatternScore: typeof stock.signals?.pattern_score === 'number',
        hasSentimentScore: typeof stock.signals?.sentiment_score === 'number',
        hasOverallScore: typeof stock.signals?.overall_score === 'number',
      };

      return Object.values(checks).every((check) => check);
    });

    if (!isValid) {
      console.error('[Update] Invalid data: missing required fields');
      return null;
    }

    return stocks as StockData[];
  } catch (err) {
    console.error('[Update] JSON parse error:', err instanceof Error ? err.message : 'Unknown error');
    return null;
  }
}

/**
 * 데이터를 JSON 파일로 저장
 *
 * @param data - 저장할 데이터
 */
function saveToFile(data: unknown) {
  const outputDir = resolve(process.cwd(), 'app/data');
  const outputPath = resolve(outputDir, 'archives.json');

  // 디렉토리가 없으면 생성
  if (!existsSync(outputDir)) {
    console.log('📁 app/data 디렉토리 생성 중...');
    mkdirSync(outputDir, { recursive: true });
  }

  console.log('💾 JSON 파일 저장 중...');
  writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf-8');

  console.log(`✅ 파일 저장 완료: ${outputPath}`);
}

updateArchiveData();