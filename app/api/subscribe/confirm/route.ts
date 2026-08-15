import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { validateConfirmToken } from '@/lib/security/timing-safe-auth';
import { checkRateLimit, getTrustedClientIp, RATE_LIMITS } from '@/lib/security/rate-limit';

/**
 * POST /api/subscribe/confirm
 *
 * Confirms a subscription via opaque token.
 * POST-only: confirmation must NOT mutate on GET.
 * Uses transactional confirm_subscription RPC.
 */

const confirmSchema = z.object({
  token: z.string().min(1, '토큰이 필요합니다'),
});

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(request: NextRequest) {
  // Rate limiting (fail-closed)
  const clientIp = getTrustedClientIp(request.headers);
  const rateResult = await checkRateLimit(clientIp, RATE_LIMITS.subscribe);
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

  const parsed = confirmSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: '유효하지 않은 확인 요청입니다.' }, { status: 400 });
  }

  const { token } = parsed.data;

  // Validate token (AEAD decrypt, purpose=confirm)
  const tokenResult = validateConfirmToken(token);
  if (!tokenResult.valid || !tokenResult.email) {
    // 'no_secret' is a server misconfiguration, not a bad link. Falling through to
    // the 400 below told every user their link was invalid while the real cause was
    // an unset token secret — the same class of error the SUPABASE_SERVICE_ROLE_KEY
    // check below already reports as a 5xx.
    if (tokenResult.error === 'no_secret') {
      console.error('[subscribe/confirm] token secret not configured');
      return NextResponse.json({ error: '시스템 설정 오류입니다.' }, { status: 503 });
    }
    const status = tokenResult.error === 'expired' ? 410 : 400;
    const message = tokenResult.error === 'expired'
      ? '확인 링크가 만료되었습니다. 다시 구독 신청해주세요.'
      : '유효하지 않은 확인 링크입니다.';
    return NextResponse.json({ error: message }, { status });
  }

  const supabase = getServiceSupabase();
  if (!supabase) {
    console.error('[subscribe/confirm] SUPABASE_SERVICE_ROLE_KEY not configured');
    return NextResponse.json({ error: '시스템 설정 오류입니다.' }, { status: 500 });
  }

  const tokenHash = createHash('sha256').update(token).digest('hex');

  // Use transactional RPC (locks row, verifies, activates atomically)
  const { data, error } = await supabase.rpc('confirm_subscription', {
    p_token_hash: tokenHash,
    p_email: tokenResult.email,
  });

  if (error) {
    console.error('[subscribe/confirm] RPC error:', error.message);
    return NextResponse.json({ error: '확인 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }

  const result = data as { success: boolean; error?: string } | null;
  if (!result || !result.success) {
    const rpcError = result?.error;
    if (rpcError === 'expired') {
      return NextResponse.json({ error: '확인 링크가 만료되었습니다.' }, { status: 410 });
    }
    if (rpcError === 'already_confirmed') {
      return NextResponse.json({ status: 'confirmed', message: '이미 확인된 구독입니다.' });
    }
    return NextResponse.json({ error: '유효하지 않거나 이미 확인된 요청입니다.' }, { status: 400 });
  }

  return NextResponse.json({ status: 'confirmed', message: '구독이 확인되었습니다!' });
}
