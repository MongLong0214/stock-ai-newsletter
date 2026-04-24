import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendStockNewsletter } from '@/lib/sendgrid';
import { getStockAnalysis } from '@/lib/llm/stock-analysis';
import { verifyBearerToken } from '@/lib/auth/verify-bearer';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key',
  {
    auth: { persistSession: false },
    db: { schema: 'public' },
  }
);

export async function POST(request: NextRequest) {
  try {
    if (!verifyBearerToken(request, process.env.CRON_SECRET, process.env.CRON_SECRET_OLD)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('🚀 뉴스레터 발송 작업 시작...\n');

    // 1. 활성 구독자 가져오기
    const { data: subscribers, error: dbError } = await supabase
      .from('subscribers')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: true });

    if (dbError) {
      console.error('❌ Database error:', dbError);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    if (!subscribers || subscribers.length === 0) {
      return NextResponse.json(
        { message: '활성 구독자가 없습니다.', count: 0 },
        { status: 200 }
      );
    }

    // 2. Gemini 분석 실행
    const { geminiAnalysis } = await getStockAnalysis();

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

    // 4. SendGrid로 뉴스레터 전송
    await sendStockNewsletter(
      subscribers.map((s) => ({ email: s.email, name: s.name || undefined })),
      newsletterData
    );

    console.log(`Job completed: ${subscribers.length} subscribers`);

    return NextResponse.json(
      {
        success: true,
        message: '뉴스레터 발송 완료',
        subscriberCount: subscribers.length,
        results: {
          gemini: geminiAnalysis.startsWith('⚠️') ? 'failed' : 'success',
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('❌ 뉴스레터 발송 실패:', error);

    return NextResponse.json(
      {
        success: false,
        error: '뉴스레터 발송 실패',
      },
      { status: 500 }
    );
  }
}