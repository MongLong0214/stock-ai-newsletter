/**
 * 주식 가격 Supabase 캐시 저장/조회 서비스
 *
 * 패턴:
 * - Lazy initialization (Supabase 클라이언트)
 * - Upsert 패턴 (충돌 방지)
 * - expires_at 기반 TTL 관리
 * - Batch operations (성능 최적화)
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type {
  StockPriceCacheDatabase,
  StockPriceCache,
  StockPriceCacheRow,
  StockPriceCacheInsert,
} from './stock-price-cache-types';

// Validation constants
const CLOCK_SKEW_TOLERANCE = 60_000; // 1분 (서버-클라이언트 시간 차이 허용)

let supabaseClient: SupabaseClient<StockPriceCacheDatabase> | null = null;

/**
 * 개발 환경에서만 캐시 에러 로깅
 */
function logCacheError(message: string, error: unknown): void {
  if (process.env.NODE_ENV === 'development') {
    console.warn(`[StockPriceCache] ${message}:`, error);
  }
}

/**
 * 주식 가격 데이터 유효성 검증
 *
 * @throws {Error} 유효하지 않은 데이터 발견 시
 */
function validateStockPrice(price: StockPriceCache): void {
  const errors: string[] = [];
  const now = Date.now();

  if (!price.ticker) errors.push('Empty ticker');
  if (price.timestamp <= 0) errors.push(`Invalid timestamp: ${price.timestamp}`);
  if (price.timestamp > now + CLOCK_SKEW_TOLERANCE) errors.push('Future timestamp');
  if (price.expires_at <= price.timestamp) errors.push('Invalid expiry');
  if (price.currentPrice <= 0) errors.push('Invalid current price');
  if (price.previousClose <= 0) errors.push('Invalid previous close');
  if (price.volume < 0) errors.push('Negative volume');

  if (errors.length > 0) {
    throw new Error(`Invalid stock price for ${price.ticker}: ${errors.join(', ')}`);
  }
}

/**
 * Supabase 클라이언트 초기화 (lazy initialization)
 *
 * @throws {Error} 환경 변수 미설정 시
 */
function getSupabase(): SupabaseClient<StockPriceCacheDatabase> {
  if (!supabaseClient) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        'Supabase credentials not configured. ' +
          'Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables.'
      );
    }

    supabaseClient = createClient<StockPriceCacheDatabase>(supabaseUrl, supabaseKey);
  }
  return supabaseClient;
}

/**
 * Supabase Row를 StockPriceCache로 변환
 */
function mapRowToCache(row: StockPriceCacheRow): StockPriceCache {
  return {
    ticker: row.ticker,
    currentPrice: row.current_price,
    previousClose: row.previous_close,
    changeRate: row.change_rate,
    volume: row.volume,
    timestamp: row.timestamp,
    expires_at: row.expires_at,
  };
}

/**
 * StockPriceCache를 Supabase Insert 형식으로 변환
 */
function mapCacheToInsert(price: StockPriceCache): StockPriceCacheInsert {
  return {
    ticker: price.ticker,
    current_price: price.currentPrice,
    previous_close: price.previousClose,
    change_rate: price.changeRate,
    volume: price.volume,
    timestamp: price.timestamp,
    expires_at: price.expires_at,
    updated_at: new Date().toISOString(),
  };
}

/**
 * Supabase에서 여러 주식 가격 캐시 일괄 조회
 *
 * @param tickers - 조회할 티커 배열
 * @returns Map<ticker, StockPriceCache> (만료되지 않은 캐시만)
 */
export async function getBatchPricesFromCache(
  tickers: string[]
): Promise<Map<string, StockPriceCache>> {
  const results = new Map<string, StockPriceCache>();

  if (tickers.length === 0) {
    return results;
  }

  try {
    const supabase = getSupabase();
    const { data: cacheData, error } = await supabase
      .from('stock_price_cache')
      .select('*')
      .in('ticker', tickers);

    if (error) {
      logCacheError('Batch query failed', error);
      return results;
    }

    if (!cacheData || cacheData.length === 0) {
      return results;
    }

    const now = Date.now();

    cacheData.forEach((row) => {
      const cache = mapRowToCache(row);

      // 만료되지 않은 캐시만 반환
      if (cache.expires_at > now) {
        results.set(cache.ticker, cache);
      }
    });

    return results;
  } catch (err) {
    logCacheError('Failed to get batch prices', err);
    return results;
  }
}

/**
 * Supabase에 여러 주식 가격 캐시 일괄 저장 (upsert)
 *
 * @param prices - 저장할 가격 데이터 배열
 */
export async function saveBatchPricesToCache(prices: StockPriceCache[]): Promise<void> {
  if (prices.length === 0) {
    return;
  }

  try {
    // 모든 가격 데이터 검증
    prices.forEach((price) => validateStockPrice(price));

    const supabase = getSupabase();
    const cacheRows = prices.map((price) => mapCacheToInsert(price));

    const { error } = await supabase.from('stock_price_cache').upsert(cacheRows);

    if (error) {
      logCacheError('Failed to save batch prices', error);
    }
  } catch (err) {
    logCacheError('Failed to save batch prices', err);
  }
}