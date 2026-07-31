/**
 * POST /api/cron/send-newsletter
 *
 * Cron endpoint for newsletter delivery.
 * Requires Bearer CRON_SECRET authorization (timing-safe, fail-closed).
 * Delegates to the canonical delivery service — no separate generate-and-blast.
 * Requires an already-prepared, unsent newsletter for today's date.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateCronSecret } from '@/lib/security/timing-safe-auth';
import { executeDelivery } from '@/lib/delivery/service';

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false },
    db: { schema: 'public' },
  });
}

export async function POST(request: NextRequest) {
  try {
    // Fail-closed CRON_SECRET validation.
    const authHeader = request.headers.get('authorization');
    if (!validateCronSecret(authHeader)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[newsletter] send job started');

    // Require service_role — fail closed if not configured
    const supabase = getServiceSupabase();
    if (!supabase) {
      console.error('[newsletter] SUPABASE_SERVICE_ROLE_KEY not configured');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    // Determine today's date (KST)
    const today = new Date().toLocaleDateString('en-CA', {
      timeZone: 'Asia/Seoul',
    });

    // Execute delivery via canonical service
    // 5-minute timeout for Vercel serverless (max 60s on hobby, 300s on pro)
    const result = await executeDelivery({
      supabase,
      newsletterDate: today,
      timeoutMs: 5 * 60 * 1000,
    });

    // Log count only, no PII
    console.log(
      `[newsletter] job completed: ${result.accepted}/${result.total} accepted, ${result.failed} failed, ${result.ambiguous} ambiguous`,
    );

    if (!result.success) {
      // Partial delivery or ambiguous outcomes — report as 500 so monitors alert
      return NextResponse.json(
        {
          success: false,
          message: '뉴스레터 부분 발송 (일부 실패/모호)',
          runId: result.runId,
          accepted: result.accepted,
          failed: result.failed,
          ambiguous: result.ambiguous,
          total: result.total,
        },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: '뉴스레터 발송 완료',
        runId: result.runId,
        subscriberCount: result.accepted,
        total: result.total,
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[newsletter] send failed:', message);

    return NextResponse.json(
      {
        success: false,
        error: '뉴스레터 발송 실패',
        // Do not expose internal details to external callers
      },
      { status: 500 },
    );
  }
}
