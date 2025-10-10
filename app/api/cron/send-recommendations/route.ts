import { NextRequest, NextResponse } from 'next/server';
import { supabase, type Subscriber } from '@/lib/supabase';
import {
  getGPTRecommendation,
  getClaudeRecommendation,
  getGeminiRecommendation,
} from '@/lib/ai-recommendations';
import { sendStockEmail } from '@/lib/email';
import { validateEnv } from '@/lib/env';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    validateEnv();

    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      console.error('❌ Unauthorized access attempt');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('🚀 Starting stock recommendations job...');

    const [gptRec, claudeRec, geminiRec] = await Promise.allSettled([
      getGPTRecommendation(),
      getClaudeRecommendation(),
      getGeminiRecommendation(),
    ]);

    const recommendations = {
      gpt: gptRec.status === 'fulfilled' ? gptRec.value : '⚠️ 추천을 가져올 수 없습니다.',
      claude: claudeRec.status === 'fulfilled' ? claudeRec.value : '⚠️ 추천을 가져올 수 없습니다.',
      gemini: geminiRec.status === 'fulfilled' ? geminiRec.value : '⚠️ 추천을 가져올 수 없습니다.',
    };

    console.log('✅ AI recommendations fetched');

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
      console.log('ℹ️ No active subscribers');
      return NextResponse.json({
        success: true,
        message: '활성 구독자가 없습니다.',
        sent: 0,
        duration: Date.now() - startTime,
      });
    }

    console.log(`📧 Sending to ${subscribers.length} subscribers...`);

    const batchSize = 50;
    let successCount = 0;
    let failCount = 0;
    const failedEmails: string[] = [];

    for (let i = 0; i < subscribers.length; i += batchSize) {
      const batch = subscribers.slice(i, i + batchSize);

      const results = await Promise.allSettled(
        batch.map((subscriber: Subscriber) =>
          sendStockEmail(subscriber.email, subscriber.name, recommendations)
        )
      );

      results.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value.success) {
          successCount++;
        } else {
          failCount++;
          failedEmails.push(batch[index].email);
        }
      });

      if (i + batchSize < subscribers.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    const { error: logError } = await supabase.from('email_logs').insert({
      subscriber_count: subscribers.length,
      success_count: successCount,
      fail_count: failCount,
      gpt_recommendation: recommendations.gpt.substring(0, 5000),
      claude_recommendation: recommendations.claude.substring(0, 5000),
      gemini_recommendation: recommendations.gemini.substring(0, 5000),
    });

    if (logError) {
      console.error('⚠️ Failed to save email log:', logError);
    }

    const duration = Date.now() - startTime;
    console.log(`✅ Job completed in ${duration}ms: ${successCount} sent, ${failCount} failed`);

    if (failedEmails.length > 0) {
      console.error('❌ Failed emails:', failedEmails);
    }

    return NextResponse.json({
      success: true,
      message: '메일 발송 완료',
      subscribers: subscribers.length,
      sent: successCount,
      failed: failCount,
      duration,
    });
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