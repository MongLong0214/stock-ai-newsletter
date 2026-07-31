/**
 * prepare-newsletter.ts — Prepare newsletter content (AI analysis).
 *
 * Safety:
 * - Requires SUPABASE_SERVICE_ROLE_KEY (never anon fallback)
 * - A same-date rerun NEVER resets an already-sent newsletter to unsent or overwrites immutable sent content
 * - Conditional update/insert verifies a row was affected
 * - Uses process.exitCode instead of process.exit to allow cleanup
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
import { getStockAnalysis } from '@/lib/llm/stock-analysis';

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

async function prepareNewsletter() {
  console.log('🚀 뉴스레터 준비 작업 시작...\n');

  // Set process timeout (55 minutes — workflow has 60)
  const processTimeout = setTimeout(() => {
    console.error('[prepare] Process timeout reached (55 min)');
    process.exitCode = 1;
  }, 55 * 60 * 1000);

  try {
    // 1. Determine today's date (KST)
    const today = new Date().toLocaleDateString('en-CA', {
      timeZone: 'Asia/Seoul',
    });

    console.log(`📅 뉴스레터 날짜: ${today}`);

    // 2. Check existing content — refuse to overwrite sent content
    const { data: existing, error: checkError } = await supabase
      .from('newsletter_content')
      .select('id, is_sent, sent_at')
      .eq('newsletter_date', today)
      .maybeSingle();

    if (checkError) {
      throw new Error(`Database check failed: ${checkError.message}`);
    }

    if (existing?.is_sent) {
      console.log(`\n⚠️ ${today}의 뉴스레터는 이미 발송 완료됨 (sent_at: ${existing.sent_at}).`);
      console.log('발송된 콘텐츠는 불변(immutable)입니다. 재준비를 건너뜁니다.');
      clearTimeout(processTimeout);
      process.exitCode = 0;
      return;
    }

    // 3. AI 분석 실행 (Gemini)
    console.log('🤖 Gemini AI 분석 시작...');
    const { geminiAnalysis, generationManifest } = await getStockAnalysis();
    console.log('✅ AI 분석 완료\n');

    // 4. DB에 저장 — generation manifest와 content를 단일 transaction에서 결합한다.
    const { data: stored, error: storeError } = await supabase.rpc('store_newsletter_generation', {
      p_run_id: generationManifest.runId,
      p_newsletter_date: today,
      p_gemini_analysis: geminiAnalysis,
      p_generation_kind: generationManifest.generationKind,
      p_model_provider: generationManifest.modelProvider,
      p_model_version: generationManifest.modelVersion,
      p_prompt_version: generationManifest.promptVersion,
      p_prompt_sha256: generationManifest.promptSha256,
      p_grounding_evidence: generationManifest.groundingEvidence,
      p_content_sha256: generationManifest.contentSha256,
      p_started_at: generationManifest.startedAt,
      p_completed_at: generationManifest.completedAt,
    });

    if (storeError) {
      throw new Error(`Generation persistence failed: ${storeError.message}`);
    }
    if (!Array.isArray(stored) || stored.length !== 1) {
      throw new Error('Generation persistence returned an invalid receipt');
    }

    console.log('\n━'.repeat(80));
    console.log('✨ 뉴스레터 준비 완료!');
    console.log('━'.repeat(80));
    console.log(`\n📝 저장된 데이터:`);
    console.log(`  날짜: ${today}`);
    console.log(`  분석 길이: ${geminiAnalysis.length} characters`);
    console.log(`  Generation run: ${generationManifest.runId}`);
    console.log(`  Content SHA-256: ${generationManifest.contentSha256}`);
    console.log(`  발송 예정: 07:30 KST\n`);

    clearTimeout(processTimeout);
    process.exitCode = 0;
  } catch (error) {
    clearTimeout(processTimeout);
    console.error('❌ 뉴스레터 준비 실패:', error);
    process.exitCode = 1;
  }
}

prepareNewsletter();
