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
import { sendStockNewsletter } from '../lib/sendgrid';
import { getParallelAnalysis } from '../lib/llm/parallel-analysis';

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

async function sendNewsletter() {
  console.log('🚀 뉴스레터 발송 작업 시작...\n');

  try {
    // 1. 활성 구독자 가져오기
    console.log('📊 Supabase에서 구독자 가져오는 중...');
    const { data: subscribers, error: dbError } = await supabase
      .from('subscribers')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: true });

    if (dbError) {
      console.error('❌ Database error:', dbError);
      throw new Error(`Database error: ${dbError.message}`);
    }

    if (!subscribers || subscribers.length === 0) {
      console.log('⚠️ 활성 구독자가 없습니다.');
      return;
    }

    console.log(`✅ ${subscribers.length}명의 구독자 발견\n`);

    // 2. AI 분석 실행 (Gemini만 활성화)
    const { gptAnalysis, claudeAnalysis, geminiAnalysis } = await getParallelAnalysis();

    // 3. 뉴스레터 데이터 생성
    const newsletterData = {
      gptAnalysis,
      claudeAnalysis,
      geminiAnalysis,
      date: new Date().toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'Asia/Seoul',
      }),
    };

    console.log('📧 이메일 발송 중...\n');

    // 4. SendGrid로 뉴스레터 전송
    await sendStockNewsletter(
      subscribers.map((s) => ({ email: s.email, name: s.name || undefined })),
      newsletterData
    );

    console.log('\n━'.repeat(80));
    console.log('✨ 뉴스레터 발송 완료!');
    console.log('━'.repeat(80));
    console.log(`\n📬 ${subscribers.length}명에게 뉴스레터 발송 완료`);
    console.log('\n구독자 목록:');
    subscribers.forEach((sub, index) => {
      console.log(`  ${index + 1}. ${sub.email}${sub.name ? ` (${sub.name})` : ''}`);
    });

    process.exit(0);
  } catch (error) {
    console.error('❌ 뉴스레터 발송 실패:', error);
    process.exit(1);
  }
}

sendNewsletter();