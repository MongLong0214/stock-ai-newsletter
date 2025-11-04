import { NextRequest, NextResponse } from 'next/server';
import { getBatchStockPrices } from '@/app/archive/_utils/api/kis/client';

/**
 * 주식 현재가 조회 API
 * GET /api/stock/price?tickers=AAPL,GOOGL,MSFT
 *
 * 프로덕션급 엔터프라이즈 API 엔드포인트
 * - 입력 검증 및 sanitization
 * - 에러 핸들링 및 상세 로깅
 * - Rate limiting 보호
 * - 캐싱 전략 적용
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    const searchParams = request.nextUrl.searchParams;
    const tickersParam = searchParams.get('tickers');

    // 입력 검증
    if (!tickersParam) {
      return NextResponse.json(
        {
          success: false,
          error: 'tickers parameter is required',
          message: 'Please provide tickers as comma-separated values',
        },
        { status: 400 }
      );
    }

    // 티커 파싱 및 sanitization
    const tickers = tickersParam
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    if (tickers.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'At least one valid ticker is required',
          message: 'Tickers must be non-empty strings',
        },
        { status: 400 }
      );
    }

    // 최대 10개로 제한 (API 호출 최적화 및 rate limiting 보호)
    if (tickers.length > 10) {
      return NextResponse.json(
        {
          success: false,
          error: 'Maximum 10 tickers allowed per request',
          message: 'Please split your request into multiple calls',
          requested: tickers.length,
          max: 10,
        },
        { status: 400 }
      );
    }

    // KIS API 호출
    const result = await getBatchStockPrices(tickers);

    const successCount = result.prices.size;
    const failedCount = result.failures.size;

    // Map을 객체로 변환
    const pricesObject = Object.fromEntries(result.prices);
    const failuresObject = Object.fromEntries(result.failures);

    const duration = Date.now() - startTime;

    return NextResponse.json(
      {
        success: true,
        prices: pricesObject,
        failures: failedCount > 0 ? failuresObject : undefined,
        metadata: {
          requested: tickers.length,
          success: successCount,
          failed: failedCount,
          duration_ms: duration,
          timestamp: new Date().toISOString(),
        },
      },
      {
        headers: {
          // 1분 캐싱 (Vercel Edge에서도 캐싱)
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30',
          'X-Response-Time': `${duration}ms`,
        },
      }
    );
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorName = error instanceof Error ? error.name : 'Error';

    console.error('[API] Stock price API error:', {
      name: errorName,
      message: errorMessage,
      duration_ms: duration,
      stack: error instanceof Error ? error.stack : undefined,
    });

    // 프로덕션에서는 민감한 정보 숨김
    const isProduction = process.env.NODE_ENV === 'production';

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch stock prices',
        message: isProduction
          ? 'An error occurred while fetching stock prices. Please try again later.'
          : errorMessage,
        details: !isProduction
          ? {
              name: errorName,
              message: errorMessage,
            }
          : undefined,
      },
      {
        status: 500,
        headers: {
          'X-Response-Time': `${duration}ms`,
        },
      }
    );
  }
}

// Route segment config for Vercel
export const runtime = 'nodejs'; // KIS API는 Node.js runtime 필요

// 🔧 캐싱 전략:
// - force-dynamic 제거: Cache-Control 헤더가 제대로 작동하도록 함
// - 장 중: 1분 캐싱 (실시간성 유지)
// - 장 마감 후: Supabase 캐시가 다음 영업일 09:00까지 유지됨
// - CDN 캐싱: s-maxage=60으로 Vercel Edge에서 1분간 캐시

// Rate limiting은 Vercel Pro 이상에서 자동 적용됨
// 무료 플랜에서는 애플리케이션 레벨에서 관리