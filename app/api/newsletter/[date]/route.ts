import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import type { StockData } from '@/app/archive/_types/archive.types';
import { isValidDateFormat } from '@/app/archive/_utils/date-formatting';

/**
 * GET /api/newsletter/[date]
 *
 * ISR 캐싱과 함께 특정 날짜의 뉴스레터 콘텐츠 반환
 *
 * 캐시 전략:
 * - 재검증: 86400초 (24시간)
 * - 발행된 뉴스레터 콘텐츠는 불변
 * - 더 나은 성능을 위한 적극적인 캐싱
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ date: string }> }
) {
  const { date } = await params;

  // 보안: 날짜 형식 검증 (YYYY-MM-DD)
  if (!isValidDateFormat(date)) {
    return NextResponse.json(
      { error: 'Invalid date format. Expected YYYY-MM-DD' },
      { status: 400 }
    );
  }

  try {
    const { data, error } = await supabase
      .from('newsletter_content')
      .select('*')
      .eq('newsletter_date', date)
      .eq('is_sent', true)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Newsletter not found for this date' },
          { status: 404 }
        );
      }
      throw error;
    }

    // 보안: 검증을 통한 안전한 JSON 파싱
    const stocks = parseAndValidateStocks(data.gemini_analysis);

    if (!stocks) {
      return NextResponse.json(
        { error: 'Invalid newsletter data format' },
        { status: 500 }
      );
    }

    const newsletter = {
      date: data.newsletter_date,
      stocks,
      sentAt: data.sent_at,
      subscriberCount: data.subscriber_count ?? 0,
    };

    return NextResponse.json(
      { newsletter },
      {
        headers: {
          // 적극적인 캐싱: 24시간, 12시간 stale-while-revalidate
          'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=43200',
        },
      }
    );
  } catch (err) {
    console.error('[API] Failed to fetch newsletter:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * 주식 JSON 데이터 파싱 및 검증
 * JSON Bomb 공격 방지 및 프로토타입 오염 방어 포함
 *
 * @param jsonString - 파싱할 JSON 문자열
 * @returns 검증된 주식 데이터 배열 또는 null
 */
function parseAndValidateStocks(jsonString: string): StockData[] | null {
  // 보안: JSON Bomb 방지 - 크기 제한 체크
  const MAX_JSON_SIZE = 1024 * 1024; // 1MB
  if (jsonString.length > MAX_JSON_SIZE) {
    console.error('[API] JSON too large:', jsonString.length);
    return null;
  }

  try {
    const stocks = JSON.parse(jsonString);

    // 검증: 배열이어야 함
    if (!Array.isArray(stocks)) {
      console.error('[API] Invalid data: not an array');
      return null;
    }

    // 검증: 배열 크기 제한 (최대 100개)
    if (stocks.length === 0 || stocks.length > 100) {
      console.error('[API] Invalid array size:', stocks.length);
      return null;
    }

    // 검증: 각 주식은 필수 필드를 가져야 함
    const isValid = stocks.every((stock) => {
      return (
        stock &&
        typeof stock === 'object' &&
        !('__proto__' in stock) && // 프로토타입 오염 방지
        !('constructor' in stock) &&
        typeof stock.ticker === 'string' &&
        stock.ticker.length > 0 &&
        typeof stock.name === 'string' &&
        stock.name.length > 0 &&
        typeof stock.close_price === 'number' &&
        stock.close_price > 0 &&
        typeof stock.rationale === 'string' &&
        stock.rationale.length > 0 &&
        stock.signals &&
        typeof stock.signals === 'object' &&
        typeof stock.signals.trend_score === 'number' &&
        typeof stock.signals.momentum_score === 'number' &&
        typeof stock.signals.volume_score === 'number' &&
        typeof stock.signals.volatility_score === 'number' &&
        typeof stock.signals.pattern_score === 'number' &&
        typeof stock.signals.sentiment_score === 'number' &&
        typeof stock.signals.overall_score === 'number'
      );
    });

    if (!isValid) {
      console.error('[API] Invalid data: missing required fields');
      return null;
    }

    return stocks as StockData[];
  } catch (err) {
    console.error('[API] JSON parse error:', err instanceof Error ? err.message : 'Unknown error');
    return null;
  }
}

// 24시간 재검증으로 ISR 활성화
export const revalidate = 86400; // 24시간 (초 단위)
