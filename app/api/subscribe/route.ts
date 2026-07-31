import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isDisposableEmail } from 'disposable-email-domains-js';
import { getServerSupabaseClient } from '@/lib/supabase/server-client';

const subscribeSchema = z.object({
  email: z
    .string()
    .min(1, '이메일을 입력해주세요')
    .max(255, '이메일 길이 제한 초과')
    .pipe(z.email({ message: '잘못된 이메일 형식' }))
    .refine((email) => !isDisposableEmail(email), '일회용 이메일은 사용할 수 없습니다'),
  name: z.string().max(100, '이름 길이 제한 초과').optional(),
});

export async function POST(request: NextRequest) {
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

  const { email, name } = parsed.data;
  const supabase = getServerSupabaseClient();

  try {
    const { data: existing } = await supabase
      .from('subscribers')
      .select('name')
      .eq('email', email)
      .maybeSingle();

    if (existing) {
      const { error: updateError } = await supabase
        .from('subscribers')
        .update({ is_active: true, name: name || existing.name })
        .eq('email', email);

      if (updateError) {
        console.error('Resubscribe error:', updateError);
        return NextResponse.json({ error: '구독 처리 중 오류가 발생했습니다. 다시 시도해주세요.' }, { status: 500 });
      }

      return NextResponse.json({ status: 'resubscribed' });
    }

    const { error: insertError } = await supabase
      .from('subscribers')
      .insert({ email, name: name || null });

    if (insertError) {
      console.error('Subscribe error:', insertError);
      return NextResponse.json({ error: '구독 처리 중 오류가 발생했습니다. 다시 시도해주세요.' }, { status: 500 });
    }

    return NextResponse.json({ status: 'subscribed' });
  } catch (error) {
    console.error('Subscribe error:', error);
    return NextResponse.json({ error: '시스템 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' }, { status: 500 });
  }
}
