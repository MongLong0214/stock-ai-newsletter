import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { supabase, type Subscriber } from '@/lib/supabase';
import { getGeminiRecommendation } from '@/lib/ai-recommendations';
import { sendStockNewsletter } from '@/lib/sendgrid';
import { validateEnv } from '@/lib/env';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function verifyBearerToken(authHeader: string | null, secret: string): boolean {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }

  const token = authHeader.slice(7); // Remove 'Bearer '

  if (token.length !== secret.length) {
    return false;
  }

  try {
    const tokenBuffer = Buffer.from(token, 'utf8');
    const secretBuffer = Buffer.from(secret, 'utf8');
    return timingSafeEqual(tokenBuffer, secretBuffer);
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    validateEnv();

    // Secure authentication check with timing-safe comparison
    const authHeader = request.headers.get('authorization');
    if (!process.env.CRON_SECRET || !verifyBearerToken(authHeader, process.env.CRON_SECRET)) {
      console.error('❌ Unauthorized access attempt');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('🚀 Starting stock recommendations job...');

    const geminiAnalysis = await getGeminiRecommendation();

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
      return NextResponse.json({
        success: true,
        message: '활성 구독자가 없습니다.',
        sent: 0,
        duration: Date.now() - startTime,
      });
    }

    const newsletterData = {
      geminiAnalysis,
      date: new Date().toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
    };

    try {
      await sendStockNewsletter(
        subscribers.map((s: Subscriber) => ({ email: s.email, name: s.name || undefined })),
        newsletterData
      );

      const successCount = subscribers.length;
      const failCount = 0;

      const { error: logError } = await supabase.from('email_logs').insert({
        subscriber_count: subscribers.length,
        success_count: successCount,
        fail_count: failCount,
        gemini_recommendation: geminiAnalysis.substring(0, 5000),
      });

      if (logError) {
        console.error('⚠️ Failed to save email log:', logError);
      }

      const duration = Date.now() - startTime;
      console.log(`✅ Job completed in ${duration}ms: ${successCount} sent`);

      return NextResponse.json({
        success: true,
        message: '메일 발송 완료',
        subscribers: subscribers.length,
        sent: successCount,
        failed: failCount,
        duration,
      });
    } catch (emailError) {
      const failCount = subscribers.length;
      console.error('❌ SendGrid email error:', emailError);

      const { error: logError } = await supabase.from('email_logs').insert({
        subscriber_count: subscribers.length,
        success_count: 0,
        fail_count: failCount,
        gemini_recommendation: geminiAnalysis.substring(0, 5000),
      });

      if (logError) {
        console.error('⚠️ Failed to save email log:', logError);
      }

      throw emailError;
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('❌ Cron job error:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
        duration,
      },
      { status: 500 }
    );
  }
}