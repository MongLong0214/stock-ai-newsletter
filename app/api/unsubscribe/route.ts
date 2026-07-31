import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { validateUnsubscribeToken } from '@/lib/security/timing-safe-auth';
import { checkRateLimit, getTrustedClientIp, RATE_LIMITS } from '@/lib/security/rate-limit';

/**
 * Unsubscribe API — POST only (no GET side-effects).
 *
 * Requires an opaque AEAD token. No email-based fallback.
 * Missing or invalid tokens are rejected (fail-closed).
 */

const tokenBodySchema = z.object({
  token: z.string().min(1),
});

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(request: NextRequest) {
  // Distributed rate limiting (fail-closed)
  const clientIp = getTrustedClientIp(request.headers);
  const rateResult = await checkRateLimit(clientIp, RATE_LIMITS.unsubscribe);
  if (rateResult.status === 'limited') {
    return NextResponse.json(
      { error: '너무 많은 요청입니다. 잠시 후 다시 시도해주세요.' },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }
  if (rateResult.status === 'unavailable') {
    return NextResponse.json(
      { error: '서비스를 일시적으로 사용할 수 없습니다.' },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식' }, { status: 400 });
  }

  // Token is required — no email fallback
  const parsed = tokenBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: '유효하지 않은 구독 취소 요청입니다.' }, { status: 400 });
  }

  const result = validateUnsubscribeToken(parsed.data.token);

  if (!result.valid || !result.email) {
    if (result.error === 'expired') {
      return NextResponse.json(
        { error: '구독 취소 링크가 만료되었습니다. 최신 뉴스레터의 링크를 사용해주세요.' },
        { status: 410 }
      );
    }
    if (result.error === 'no_secret') {
      console.error('[unsubscribe] UNSUBSCRIBE_TOKEN_SECRET not configured');
      return NextResponse.json({ error: '시스템 설정 오류입니다.' }, { status: 500 });
    }
    return NextResponse.json({ error: '유효하지 않은 구독 취소 링크입니다.' }, { status: 400 });
  }

  return await performUnsubscribe(result.email);
}

async function performUnsubscribe(email: string): Promise<NextResponse> {
  const supabase = getServiceSupabase();
  if (!supabase) {
    console.error('[unsubscribe] SUPABASE_SERVICE_ROLE_KEY not configured');
    return NextResponse.json({ error: '시스템 설정 오류입니다.' }, { status: 500 });
  }

  try {
    const { error } = await supabase
      .from('subscribers')
      .update({ is_active: false })
      .eq('email', email);

    if (error) {
      console.error('[unsubscribe] db error');
      return NextResponse.json({ error: '구독 해지 처리 중 오류가 발생했습니다.' }, { status: 500 });
    }

    return NextResponse.json({ status: 'unsubscribed' });
  } catch (error) {
    console.error('[unsubscribe] unexpected error:', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ error: '시스템 오류가 발생했습니다.' }, { status: 500 });
  }
}
