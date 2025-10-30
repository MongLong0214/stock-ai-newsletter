import { config } from 'dotenv';
import { resolve } from 'path';
import { existsSync } from 'fs';

// 환경변수 로드
const envPath = resolve(process.cwd(), '.env.local');
if (existsSync(envPath)) {
  config({ path: envPath });
}

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Supabase 환경 변수가 설정되지 않았습니다.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false },
  db: { schema: 'public' },
});

async function checkArchiveData() {
  console.log('🔍 아카이브 데이터 확인 중...\n');

  try {
    // 1. 전체 뉴스레터 확인
    const { data: allData, error: allError } = await supabase
      .from('newsletter_content')
      .select('newsletter_date, is_sent, sent_at')
      .order('newsletter_date', { ascending: false });

    if (allError) {
      console.error('❌ DB 조회 실패:', allError);
      process.exit(1);
    }

    console.log('📊 전체 뉴스레터 현황:');
    console.log(`  - 총 개수: ${allData?.length || 0}개\n`);

    if (allData && allData.length > 0) {
      console.log('📋 뉴스레터 목록:');
      allData.forEach((row, idx) => {
        console.log(`  ${idx + 1}. ${row.newsletter_date} - is_sent: ${row.is_sent} ${row.sent_at ? `(발송: ${row.sent_at})` : '(미발송)'}`);
      });
      console.log('');
    }

    // 2. 발송된 뉴스레터만 확인
    const { data: sentData, error: sentError } = await supabase
      .from('newsletter_content')
      .select('newsletter_date, sent_at')
      .eq('is_sent', true)
      .order('newsletter_date', { ascending: false });

    if (sentError) {
      console.error('❌ 발송된 뉴스레터 조회 실패:', sentError);
      process.exit(1);
    }

    console.log('✅ 발송된 뉴스레터 (아카이브에 표시될 것):');
    console.log(`  - 개수: ${sentData?.length || 0}개`);

    if (sentData && sentData.length > 0) {
      sentData.forEach((row, idx) => {
        console.log(`  ${idx + 1}. ${row.newsletter_date} (${row.sent_at})`);
      });
    } else {
      console.log('\n⚠️  경고: 발송된 뉴스레터가 없습니다!');
      console.log('  아카이브 페이지에 선택 가능한 날짜가 표시되지 않습니다.');
      console.log('\n해결 방법:');
      console.log('  1. npm run send-newsletter 실행하여 뉴스레터 발송');
      console.log('  2. 또는 DB에서 수동으로 is_sent = true로 설정');
    }

    console.log('\n✅ 확인 완료');
    process.exit(0);
  } catch (error) {
    console.error('❌ 오류 발생:', error);
    process.exit(1);
  }
}

checkArchiveData();
