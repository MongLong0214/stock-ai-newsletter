import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { generateUnsubscribeToken } from '@/lib/security/timing-safe-auth';
import { checkRateLimit, getTrustedClientIp, RATE_LIMITS } from '@/lib/security/rate-limit';
import { sendUnsubscribeLink } from '@/lib/sendgrid';

/**
 * POST /api/unsubscribe/request
 *
 * Mails a fresh opaque unsubscribe token to the address supplied by the user.
 *
 * This is the recovery path for links that predate opaque tokens (`?email=`) and
 * for tokens that have expired. It never unsubscribes on its own — the mailed
 * link still goes through the normal confirm step — so an unauthenticated caller
 * cannot opt someone else out.
 *
 * The response is identical whether or not the address is subscribed, so this
 * endpoint cannot be used to enumerate subscribers.
 */

const requestSchema = z.object({
  email: z
    .string()
    .min(1, '이메일을 입력해주세요')
    .max(255, '이메일 길이 제한 초과')
    .pipe(z.email({ message: '잘못된 이메일 형식' })),
});

const GENERIC_RESPONSE = {
  status: 'requested',
  message: '해당 주소가 구독 중이라면 구독 취소 링크를 발송했습니다. 이메일을 확인해주세요.',
} as const;

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(request: NextRequest) {
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

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase().trim();

  const supabase = getServiceSupabase();
  if (!supabase) {
    console.error('[unsubscribe/request] SUPABASE_SERVICE_ROLE_KEY not configured');
    return NextResponse.json({ error: '시스템 설정 오류입니다.' }, { status: 500 });
  }

  try {
    // Only mail addresses that are actually subscribed — otherwise this endpoint
    // becomes an open relay for sending mail to arbitrary addresses.
    const { data: subscriber, error } = await supabase
      .from('subscribers')
      .select('email')
      .eq('email', email)
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      console.error('[unsubscribe/request] db error');
      return NextResponse.json({ error: '요청 처리 중 오류가 발생했습니다.' }, { status: 500 });
    }

    if (subscriber) {
      await sendUnsubscribeLink(email, generateUnsubscribeToken(email));
    }

    return NextResponse.json(GENERIC_RESPONSE);
  } catch (err) {
    console.error(
      '[unsubscribe/request] unexpected error:',
      err instanceof Error ? err.message : 'unknown'
    );
    return NextResponse.json({ error: '시스템 오류가 발생했습니다.' }, { status: 500 });
  }
}
