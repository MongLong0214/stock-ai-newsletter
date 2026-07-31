import { NextRequest, NextResponse } from 'next/server';
import { getBatchStockPrices } from '@/app/archive/_utils/api/kis/client';
import { checkRateLimit, getTrustedClientIp, RATE_LIMITS } from '@/lib/security/rate-limit';

/**
 * 주식 현재가 조회 API
 * GET /api/stock/price?tickers=005930,035720
 *
 * Validation:
 * - Tickers must be Korean stock format (6-digit numeric) or alphanumeric up to 10 chars
 * - Max 10 tickers per request
 * - Distributed rate limiting via Supabase
 */

// Korean stock ticker: 6 digits. Also allow general alphanumeric for ETFs etc.
const KOREAN_TICKER_PATTERN = /^[0-9]{6}$/;
const GENERAL_TICKER_PATTERN = /^[A-Za-z0-9]{1,10}$/;

function isValidTicker(ticker: string): boolean {
  return KOREAN_TICKER_PATTERN.test(ticker) || GENERAL_TICKER_PATTERN.test(ticker);
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  // Distributed rate limiting (fail-closed)
  const clientIp = getTrustedClientIp(request.headers);
  const rateResult = await checkRateLimit(clientIp, RATE_LIMITS.stockPrice);
  if (rateResult.status === 'limited') {
    return NextResponse.json(
      { success: false, error: 'Rate limit exceeded. Try again later.' },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }
  if (rateResult.status === 'unavailable') {
    return NextResponse.json(
      { success: false, error: 'Service temporarily unavailable.' },
      { status: 503 }
    );
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const tickersParam = searchParams.get('tickers');

    if (!tickersParam || tickersParam.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'tickers parameter is required' },
        { status: 400 }
      );
    }

    // 티커 파싱 및 strict validation
    const tickers = tickersParam
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    if (tickers.length === 0) {
      return NextResponse.json(
        { success: false, error: 'At least one valid ticker is required' },
        { status: 400 }
      );
    }

    // 최대 10개로 제한
    if (tickers.length > 10) {
      return NextResponse.json(
        {
          success: false,
          error: 'Maximum 10 tickers allowed per request',
          requested: tickers.length,
          max: 10,
        },
        { status: 400 }
      );
    }

    // Strict ticker format validation
    const invalidTickers = tickers.filter((t) => !isValidTicker(t));
    if (invalidTickers.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid ticker format. Korean tickers must be 6 digits (e.g. 005930).',
          invalid: invalidTickers,
        },
        { status: 400 }
      );
    }

    // KIS API 호출
    const result = await getBatchStockPrices(tickers);

    const successCount = result.prices.size;
    const failedCount = result.failures.size;

    const pricesObject = Object.fromEntries(result.prices);
    const failuresObject = Object.fromEntries(result.failures);

    const duration = Date.now() - startTime;

    return NextResponse.json(
      {
        success: true,
        prices: pricesObject,
        failures: failedCount > 0 ? failuresObject : undefined,
        meta: {
          total: tickers.length,
          success: successCount,
          failed: failedCount,
          duration_ms: duration,
        },
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30',
          'X-Response-Time': `${duration}ms`,
        },
      }
    );
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    console.error('[stock/price] API error:', errorMessage);

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch stock prices',
        message: 'An error occurred while fetching stock prices. Please try again later.',
      },
      {
        status: 500,
        headers: { 'X-Response-Time': `${duration}ms` },
      }
    );
  }
}

export const runtime = 'nodejs';
