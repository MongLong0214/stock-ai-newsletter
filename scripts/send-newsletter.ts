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
import { sendStockNewsletter } from '@/lib/sendgrid';
import { postNewsletterToTwitter } from '@/lib/twitter';

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

    // 2. DB에서 준비된 뉴스레터 가져오기
    const today = new Date().toLocaleDateString('en-CA', {
      timeZone: 'Asia/Seoul',
    });

    console.log(`📅 ${today} 뉴스레터 조회 중...`);

    const { data: newsletterContent, error: contentError } = await supabase
      .from('newsletter_content')
      .select('*')
      .eq('newsletter_date', today)
      .eq('is_sent', false)
      .single();

    if (contentError || !newsletterContent) {
      console.error('❌ Newsletter content not found:', contentError);
      throw new Error(
        `Newsletter content for ${today} not found. Please run prepare-newsletter first.`
      );
    }

    console.log('✅ 뉴스레터 콘텐츠 로드 완료\n');

    const geminiAnalysis = newsletterContent.gemini_analysis;

    // 3. 뉴스레터 데이터 생성
    const newsletterData = {
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

    // 5. DB 업데이트 (발송 완료 표시)
    const { error: updateError } = await supabase
      .from('newsletter_content')
      .update({
        is_sent: true,
        sent_at: new Date().toISOString(),
        subscriber_count: subscribers.length,
      })
      .eq('newsletter_date', today);

    if (updateError) {
      console.error('⚠️ DB 업데이트 실패 (뉴스레터는 정상 발송됨):', updateError);
    }

    // 6. X(Twitter) 자동 게시
    try {
      console.log('\n━'.repeat(80));
      console.log('🐦 X(Twitter) 자동 게시 시작...');
      console.log('━'.repeat(80) + '\n');

      // Gemini 분석 결과 파싱
      const analysisData = JSON.parse(geminiAnalysis);

      // 트윗 게시 (이미지 + 텍스트)
      await postNewsletterToTwitter(analysisData);

      console.log('✅ X(Twitter) 자동 게시 완료!\n');
    } catch (twitterError) {
      console.error('⚠️ X(Twitter) 게시 실패 (뉴스레터는 정상 발송됨):', twitterError);
      // 트위터 실패해도 프로세스는 성공으로 처리
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ 뉴스레터 발송 실패:', error);
    process.exit(1);
  }
}

sendNewsletter();