import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSupabaseClient } from '@/lib/supabase/server-client';

const bodySchema = z.object({
  email: z.string().min(1).max(255).pipe(z.email({ message: '잘못된 이메일 형식' })),
});

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const supabase = getServerSupabaseClient();

  try {
    const { error } = await supabase
      .from('subscribers')
      .update({ is_active: false })
      .eq('email', parsed.data.email);

    if (error) {
      console.error('Unsubscribe error:', error);
      return NextResponse.json({ error: '구독 해지 처리 중 오류가 발생했습니다.' }, { status: 500 });
    }

    return NextResponse.json({ status: 'unsubscribed' });
  } catch (error) {
    console.error('Unsubscribe error:', error);
    return NextResponse.json({ error: '시스템 오류가 발생했습니다.' }, { status: 500 });
  }
}
