/**
 * send-newsletter.ts — CLI entry point for newsletter delivery.
 *
 * Delegates to the canonical delivery service.
 * Requires an already-prepared, unsent newsletter for today's date.
 *
 * Exit codes:
 *   0 = all recipients terminal (completed)
 *   1 = failure, retryable remain, or ambiguous remain
 *
 * Safety:
 * - Requires SUPABASE_SERVICE_ROLE_KEY (never anon fallback)
 * - Uses process.exitCode instead of process.exit to allow cleanup
 * - Fails immediately for retryable/ambiguous/in-progress (does not endlessly retry permanent bounces)
 */

// Load env before any other imports
import { config } from 'dotenv';
import { resolve } from 'path';
import { existsSync } from 'fs';

const envPath = resolve(process.cwd(), '.env.local');
if (existsSync(envPath)) {
  config({ path: envPath });
}

import { createClient } from '@supabase/supabase-js';
import { executeDelivery } from '@/lib/delivery/service';
import { parseCrashAlert } from '@/lib/sendgrid';
import { postNewsletterToTwitter, postCrashAlertToTwitter } from '@/lib/twitter';

// Env validation — fail-closed: require service role key, never anon
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  console.error('FATAL: NEXT_PUBLIC_SUPABASE_URL is not set');
  process.exitCode = 1;
  throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('FATAL: SUPABASE_SERVICE_ROLE_KEY is required (anon key not accepted)');
  process.exitCode = 1;
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false },
    db: { schema: 'public' },
  },
);

async function sendNewsletter() {
  console.log('🚀 뉴스레터 발송 작업 시작...\n');

  const today = new Date().toLocaleDateString('en-CA', {
    timeZone: 'Asia/Seoul',
  });

  console.log(`📅 발송 대상 날짜: ${today}`);

  // Compose abort: 10 minute CLI timeout
  const controller = new AbortController();
  const processTimeout = setTimeout(() => {
    console.error('[delivery] Process timeout reached (10 min)');
    controller.abort();
  }, 10 * 60 * 1000);

  try {
    const result = await executeDelivery({
      supabase,
      newsletterDate: today,
      signal: controller.signal,
      timeoutMs: 9 * 60 * 1000, // inner timeout slightly shorter
    });

    clearTimeout(processTimeout);

    console.log('\n━'.repeat(80));
    console.log('✨ 뉴스레터 발송 완료!');
    console.log('━'.repeat(80));
    console.log(`\n📬 결과 요약:`);
    console.log(`  전체: ${result.total}`);
    console.log(`  수락됨: ${result.accepted}`);
    console.log(`  실패: ${result.failed}`);
    console.log(`  재시도 가능: ${result.retryable}`);
    console.log(`  모호: ${result.ambiguous}`);
    console.log(`  건너뜀: ${result.skipped}`);
    console.log(`  Run ID: ${result.runId}`);

    if (!result.success) {
      console.error('\n⚠️ 일부 수신자 전달 실패 또는 모호한 상태가 있습니다.');
      console.error('   retryable/ambiguous 는 수동 확인 후 재실행 또는 수동 처리가 필요합니다.');
    }

    // Twitter posting (best-effort, non-blocking for exit code).
    // `alreadySent` means executeDelivery short-circuited on a run that had already
    // completed, so no mail went out this invocation. Posting on that path made every
    // idempotent rerun publish the same alert to X again — the email side is
    // idempotent, the social side was not.
    if (result.success && !result.alreadySent) {
      try {
        const { data: content } = await supabase
          .from('newsletter_content')
          .select('gemini_analysis')
          .eq('newsletter_date', today)
          .single();

        if (content?.gemini_analysis) {
          console.log('\n🐦 X(Twitter) 자동 게시 시작...');
          const crashAlertData = parseCrashAlert(content.gemini_analysis);
          if (crashAlertData) {
            await postCrashAlertToTwitter(crashAlertData);
          } else {
            const analysisData = JSON.parse(content.gemini_analysis);
            await postNewsletterToTwitter(analysisData);
          }
          console.log('✅ X(Twitter) 자동 게시 완료!');
        }
      } catch (twitterError) {
        console.error('⚠️ X(Twitter) 게시 실패 (뉴스레터는 정상 발송됨):', twitterError);
      }
    }

    // Exit 1 if any non-terminal outcomes remain
    if (result.ambiguous > 0 || result.retryable > 0 || !result.success) {
      process.exitCode = 1;
    } else {
      process.exitCode = 0;
    }
  } catch (error) {
    clearTimeout(processTimeout);
    console.error('❌ 뉴스레터 발송 실패:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

sendNewsletter();
