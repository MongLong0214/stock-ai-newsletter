import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isDisposableEmail } from 'disposable-email-domains-js';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { generateConfirmToken } from '@/lib/security/timing-safe-auth';
import { checkRateLimit, getTrustedClientIp, RATE_LIMITS } from '@/lib/security/rate-limit';
import { sendSubscriptionConfirmation } from '@/lib/sendgrid';

const subscribeSchema = z.object({
  email: z
    .string()
    .min(1, '이메일을 입력해주세요')
    .max(255, '이메일 길이 제한 초과')
    .pipe(z.email({ message: '잘못된 이메일 형식' }))
    .refine((email) => !isDisposableEmail(email), '일회용 이메일은 사용할 수 없습니다'),
  name: z.string().max(100, '이름 길이 제한 초과').optional(),
});

/**
 * Get a service-role Supabase client.
 * Fail-closed: returns null if service role key is not configured.
 */
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

  const parsed = subscribeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  // Normalize email (lowercase, trim)
  const email = parsed.data.email.toLowerCase().trim();
  const name = parsed.data.name?.trim() || null;

  const supabase = getServiceSupabase();
  if (!supabase) {
    console.error('[subscribe] SUPABASE_SERVICE_ROLE_KEY not configured');
    return NextResponse.json({ error: '시스템 설정 오류입니다.' }, { status: 500 });
  }

  try {
    // Generate a confirmation token (opaque, AEAD encrypted)
    const confirmToken = generateConfirmToken(email);
    const tokenHash = createHash('sha256').update(confirmToken).digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    // Upsert pending subscriber.
    // confirmed_at MUST be reset: a returning subscriber (previously confirmed,
    // then unsubscribed) would otherwise keep the old confirmed_at, and
    // confirm_subscription would reject the fresh token as 'already_confirmed' —
    // leaving them permanently unable to re-subscribe.
    const { error: upsertError } = await supabase
      .from('pending_subscribers')
      .upsert(
        { email, name, confirm_token_hash: tokenHash, expires_at: expiresAt, confirmed_at: null },
        { onConflict: 'email' }
      );

    if (upsertError) {
      console.error('[subscribe] pending upsert error:', upsertError.message);
      return NextResponse.json(
        { error: '시스템 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' },
        { status: 500 }
      );
    }

    // Send confirmation email
    try {
      await sendSubscriptionConfirmation(email, confirmToken);
    } catch (sendError) {
      // Clean up the pending row if sending fails.
      // Scoped to this request's own token: two concurrent subscribes for the same
      // address both upsert the single row, and without the hash predicate the one
      // whose send failed would delete the row the other had already mailed a
      // working link for.
      console.error('[subscribe] email send failed:', sendError instanceof Error ? sendError.message : 'unknown');
      await supabase
        .from('pending_subscribers')
        .delete()
        .eq('email', email)
        .eq('confirm_token_hash', tokenHash)
        .is('confirmed_at', null);

      return NextResponse.json(
        { error: '시스템 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' },
        { status: 500 }
      );
    }

    // Always return same response to prevent account enumeration
    return NextResponse.json({
      status: 'pending',
      message: '확인 이메일을 발송했습니다. 이메일을 확인해주세요.',
    });
  } catch (error) {
    console.error('[subscribe] unexpected error:', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ error: '시스템 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' }, { status: 500 });
  }
}
