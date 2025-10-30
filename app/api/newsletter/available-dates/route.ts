import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

/**
 * GET /api/newsletter/available-dates
 *
 * ISR 캐싱과 함께 사용 가능한 모든 뉴스레터 날짜 반환
 *
 * 캐시 전략:
 * - 재검증: 86400초 (24시간)
 * - 한국 시간 오전 8시 = UTC 전날 오후 11시
 * - 다음 재검증은 자정 UTC 이후 발생
 */
export async function GET() {
  try {
    const { data, error } = await supabase
      .from('newsletter_content')
      .select('newsletter_date')
      .eq('is_sent', true)
      .order('newsletter_date', { ascending: false });

    if (error) {
      console.error('[API] Failed to fetch available dates:', error);
      return NextResponse.json(
        { error: 'Failed to fetch available dates' },
        { status: 500 }
      );
    }

    const dates = data?.map((row) => row.newsletter_date) ?? [];

    return NextResponse.json(
      { dates },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=43200',
        },
      }
    );
  } catch (err) {
    console.error('[API] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// 24시간 재검증으로 ISR 활성화
export const revalidate = 86400; // 24시간 (초 단위)
