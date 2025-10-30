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
    const { stocks, error: validationError } = parseAndValidateStocks(data.gemini_analysis);

    if (!stocks || validationError) {
      console.error('[API] Newsletter data validation failed:', validationError);
      return NextResponse.json(
        { error: `Invalid newsletter data format: ${validationError}` },
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
 * @returns 검증된 주식 데이터 배열 또는 에러 정보
 */
function parseAndValidateStocks(jsonString: string): { stocks: StockData[] | null; error: string | null } {
  // 보안: JSON Bomb 방지 - 크기 제한 체크
  const MAX_JSON_SIZE = 1024 * 1024; // 1MB
  if (jsonString.length > MAX_JSON_SIZE) {
    const errorMsg = `JSON 크기가 너무 큽니다: ${jsonString.length} bytes (최대: ${MAX_JSON_SIZE} bytes)`;
    console.error('[API]', errorMsg);
    return { stocks: null, error: errorMsg };
  }

  try {
    const stocks = JSON.parse(jsonString);

    // 검증: 배열이어야 함
    if (!Array.isArray(stocks)) {
      const errorMsg = `데이터가 배열이 아닙니다. 타입: ${typeof stocks}, 값: ${JSON.stringify(stocks).substring(0, 200)}`;
      console.error('[API]', errorMsg);
      return { stocks: null, error: errorMsg };
    }

    // 검증: 배열 크기 제한 (최대 100개)
    if (stocks.length === 0 || stocks.length > 100) {
      const errorMsg = `배열 크기가 잘못되었습니다: ${stocks.length} (허용 범위: 1-100)`;
      console.error('[API]', errorMsg);
      return { stocks: null, error: errorMsg };
    }

    // 검증: 각 주식은 필수 필드를 가져야 함
    for (let i = 0; i < stocks.length; i++) {
      const stock = stocks[i];

      if (!stock || typeof stock !== 'object') {
        const errorMsg = `stocks[${i}]이(가) 객체가 아닙니다: ${JSON.stringify(stock)}`;
        console.error('[API]', errorMsg);
        return { stocks: null, error: errorMsg };
      }

      if ('__proto__' in stock || 'constructor' in stock) {
        const errorMsg = `stocks[${i}]에 위험한 프로토타입 속성이 있습니다`;
        console.error('[API]', errorMsg);
        return { stocks: null, error: errorMsg };
      }

      const missingFields: string[] = [];

      if (typeof stock.ticker !== 'string' || stock.ticker.length === 0) missingFields.push('ticker');
      if (typeof stock.name !== 'string' || stock.name.length === 0) missingFields.push('name');
      if (typeof stock.close_price !== 'number' || stock.close_price <= 0) missingFields.push('close_price');
      if (typeof stock.rationale !== 'string' || stock.rationale.length === 0) missingFields.push('rationale');

      if (!stock.signals || typeof stock.signals !== 'object') {
        missingFields.push('signals');
      } else {
        if (typeof stock.signals.trend_score !== 'number') missingFields.push('signals.trend_score');
        if (typeof stock.signals.momentum_score !== 'number') missingFields.push('signals.momentum_score');
        if (typeof stock.signals.volume_score !== 'number') missingFields.push('signals.volume_score');
        if (typeof stock.signals.volatility_score !== 'number') missingFields.push('signals.volatility_score');
        if (typeof stock.signals.pattern_score !== 'number') missingFields.push('signals.pattern_score');
        if (typeof stock.signals.sentiment_score !== 'number') missingFields.push('signals.sentiment_score');
        if (typeof stock.signals.overall_score !== 'number') missingFields.push('signals.overall_score');
      }

      if (missingFields.length > 0) {
        const errorMsg = `stocks[${i}] (ticker: ${stock.ticker || 'unknown'})에 필수 필드가 없거나 잘못되었습니다: ${missingFields.join(', ')}\n데이터: ${JSON.stringify(stock).substring(0, 300)}`;
        console.error('[API]', errorMsg);
        return { stocks: null, error: errorMsg };
      }
    }

    return { stocks: stocks as StockData[], error: null };
  } catch (err) {
    const errorMsg = `JSON 파싱 오류: ${err instanceof Error ? err.message : String(err)}\nJSON 샘플: ${jsonString.substring(0, 200)}...`;
    console.error('[API]', errorMsg);
    return { stocks: null, error: errorMsg };
  }
}

// 24시간 재검증으로 ISR 활성화
export const revalidate = 86400; // 24시간 (초 단위)
