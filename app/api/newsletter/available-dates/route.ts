import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

/**
 * GET /api/newsletter/available-dates
 *
 * ISR 캐싱과 함께 사용 가능한 모든 뉴스레터 날짜 반환
 *
 * 캐시 전략:
 * - 재검증: 3600초 (1시간)
 * - 오전 8시 발송 후 최대 1시간 이내 아카이브 반영
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
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=1800',
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

// 1시간 재검증으로 ISR 활성화
export const revalidate = 3600; // 1시간 (초 단위)
