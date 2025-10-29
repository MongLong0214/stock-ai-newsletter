// 환경변수를 가장 먼저 로드
import { config } from 'dotenv';
import { resolve } from 'path';
import { existsSync } from 'fs';

// 로컬 환경에서만 .env.local 로드 (GitHub Actions는 환경변수 직접 사용)
const envPath = resolve(process.cwd(), '.env.local');
if (existsSync(envPath)) {
  config({ path: envPath });
}

import { createClient } from '@supabase/supabase-js';
import { getStockAnalysis } from '@/lib/llm/stock-analysis';

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

async function prepareNewsletter() {
  console.log('🚀 뉴스레터 준비 작업 시작...\n');

  try {
    // 1. AI 분석 실행 (Gemini)
    console.log('🤖 Gemini AI 분석 시작...');
    const { geminiAnalysis } = await getStockAnalysis();

    if (geminiAnalysis.startsWith('⚠️')) {
      throw new Error('Gemini analysis failed: ' + geminiAnalysis);
    }

    console.log('✅ AI 분석 완료\n');

    // 2. 오늘 날짜 가져오기 (KST 기준)
    const today = new Date().toLocaleDateString('en-CA', {
      timeZone: 'Asia/Seoul',
    });

    console.log(`📅 뉴스레터 날짜: ${today}`);

    // 3. DB에 저장 (이미 존재하면 업데이트)
    const { data, error } = await supabase
      .from('newsletter_content')
      .upsert(
        {
          newsletter_date: today,
          gemini_analysis: geminiAnalysis,
          is_sent: false,
          created_at: new Date().toISOString(),
        },
        {
          onConflict: 'newsletter_date',
        }
      )
      .select();

    if (error) {
      console.error('❌ Database error:', error);
      throw new Error(`Database error: ${error.message}`);
    }

    console.log('\n━'.repeat(80));
    console.log('✨ 뉴스레터 준비 완료!');
    console.log('━'.repeat(80));
    console.log(`\n📝 저장된 데이터:`);
    console.log(`  날짜: ${today}`);
    console.log(`  분석 길이: ${geminiAnalysis.length} characters`);
    console.log(`  발송 예정: 07:50 KST\n`);

    process.exit(0);
  } catch (error) {
    console.error('❌ 뉴스레터 준비 실패:', error);
    process.exit(1);
  }
}

prepareNewsletter();