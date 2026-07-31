import { NextRequest, NextResponse } from 'next/server';
import { getBatchStockPrices } from '@/app/archive/_utils/api/kis/client';
import type { KisStockPrice } from '@/app/archive/_utils/api/kis/types';
import type { StockPriceCache } from '@/app/archive/_utils/cache/types';
import { getStockPriceCacheExpiry } from '@/app/archive/_utils/market/hours';
import { getBatchPricesFromCache, saveBatchPricesToCache } from '@/app/archive/_utils/cache/stock-price';
import { checkRateLimit, getTrustedClientIp, RATE_LIMITS } from '@/lib/security/rate-limit';
import { isValidTicker, MAX_TICKERS_PER_REQUEST } from '@/lib/security/validators';

/**
 * 주식 현재가 조회 API
 * GET /api/stock/price?tickers=005930,035720
 *
 * Validation:
 * - Tickers must be Korean stock format (6-digit numeric) or alphanumeric up to 10 chars
 * - Max 10 tickers per request
 * - Distributed rate limiting via Supabase
 *
 * Caching: the Supabase price cache is read/written with the service role here.
 * The browser never touches the cache table (SEC-005), so this route is the only
 * writer that keeps it warm — without it the table stays empty and every request
 * would hit KIS directly.
 */

type PriceResponseEntry = KisStockPrice | Omit<StockPriceCache, 'expires_at'>;

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
    if (tickers.length > MAX_TICKERS_PER_REQUEST) {
      return NextResponse.json(
        {
          success: false,
          error: `Maximum ${MAX_TICKERS_PER_REQUEST} tickers allowed per request`,
          requested: tickers.length,
          max: MAX_TICKERS_PER_REQUEST,
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

    // 캐시 우선 조회 — 미스인 티커만 KIS로 넘긴다
    const cached = await getBatchPricesFromCache(tickers);
    const uncachedTickers = tickers.filter((ticker) => !cached.has(ticker));

    const fetched = uncachedTickers.length > 0
      ? await getBatchStockPrices(uncachedTickers)
      : { prices: new Map<string, KisStockPrice>(), failures: new Map<string, string>() };

    if (fetched.prices.size > 0) {
      const expiresAt = getStockPriceCacheExpiry();
      await saveBatchPricesToCache(
        [...fetched.prices.values()].map((price) => ({
          ticker: price.ticker,
          currentPrice: price.currentPrice,
          previousClose: price.previousClose,
          changeRate: price.changeRate,
          volume: price.volume,
          timestamp: price.timestamp,
          expires_at: expiresAt,
        }))
      );
    }

    // expires_at은 캐시 내부 필드이므로 응답 형태를 균일하게 유지하기 위해 제외한다
    const merged = new Map<string, PriceResponseEntry>();
    for (const [ticker, { expires_at: _expiresAt, ...price }] of cached) {
      merged.set(ticker, price);
    }
    for (const [ticker, price] of fetched.prices) {
      merged.set(ticker, price);
    }

    const successCount = merged.size;
    const failedCount = fetched.failures.size;

    const pricesObject = Object.fromEntries(merged);
    const failuresObject = Object.fromEntries(fetched.failures);

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
