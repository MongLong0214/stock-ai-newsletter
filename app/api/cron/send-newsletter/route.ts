import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendStockNewsletter } from '@/lib/sendgrid';
import { getParallelAnalysis } from '@/lib/llm/parallel-analysis';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: { persistSession: false },
    db: { schema: 'public' },
  }
);

export async function POST(request: NextRequest) {
  try {
    // CRON_SECRET 검증 (선택사항, 보안을 위해 설정 권장)
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
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
      return NextResponse.json(
        { error: 'Database error', details: dbError.message },
        { status: 500 }
      );
    }

    if (!subscribers || subscribers.length === 0) {
      console.log('⚠️ 활성 구독자가 없습니다.');
      return NextResponse.json(
        { message: '활성 구독자가 없습니다.', count: 0 },
        { status: 200 }
      );
    }

    console.log(`✅ ${subscribers.length}명의 구독자 발견\n`);

    // 2. 3개 LLM 병렬 분석 실행
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

    console.log(`✅ ${subscribers.length}명에게 뉴스레터 발송 완료\n`);

    return NextResponse.json(
      {
        success: true,
        message: '뉴스레터 발송 완료',
        subscriberCount: subscribers.length,
        results: {
          gpt: gptAnalysis.startsWith('⚠️') ? 'failed' : 'success',
          claude: claudeAnalysis.startsWith('⚠️') ? 'failed' : 'success',
          gemini: geminiAnalysis.startsWith('⚠️') ? 'failed' : 'success',
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('❌ 뉴스레터 발송 실패:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return NextResponse.json(
      {
        success: false,
        error: '뉴스레터 발송 실패',
        details: errorMessage,
      },
      { status: 500 }
    );
  }
}