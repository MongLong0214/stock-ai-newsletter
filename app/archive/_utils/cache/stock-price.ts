import 'server-only';

/**
 * 주식 가격 Supabase 캐시 저장/조회 서비스 (SERVER-ONLY)
 *
 * Architecture:
 * - Both reads and writes use service_role key (server-side only)
 * - This module must NOT be imported from client-side code
 * - Cache failures are non-poisoning: read failures return empty, write failures are logged
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type {
  StockPriceCacheDatabase,
  StockPriceCache,
  StockPriceCacheRow,
  StockPriceCacheInsert,
} from './types';

/**
 * 캐시 에러 로깅 (프로덕션 관찰성 확보)
 */
function logCacheError(message: string, error: unknown): void {
  console.error(`[StockPriceCache] ${message}:`, error instanceof Error ? error.message : error);
}

/**
 * 주식 가격 데이터 기본 검증
 */
function validateStockPrice(price: StockPriceCache): boolean {
  return !!(price.ticker && price.currentPrice > 0 && price.previousClose > 0);
}

/**
 * Service-role Supabase client (server-side only).
 * Returns null if service role key is not configured.
 */
function getServiceClient(): SupabaseClient<StockPriceCacheDatabase> | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient<StockPriceCacheDatabase>(url, key, {
    auth: { persistSession: false },
  });
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
 * Supabase에서 여러 주식 가격 캐시 일괄 조회 (service-role)
 *
 * Non-poisoning: returns empty on error.
 */
export async function getBatchPricesFromCache(
  tickers: string[]
): Promise<Map<string, StockPriceCache>> {
  const results = new Map<string, StockPriceCache>();
  if (tickers.length === 0) return results;

  try {
    const client = getServiceClient();
    if (!client) return results;

    const { data: cacheData, error } = await client
      .from('stock_price_cache')
      .select('*')
      .in('ticker', tickers);

    if (error) {
      logCacheError('Batch query failed', error);
      return results;
    }

    if (!cacheData || cacheData.length === 0) return results;

    const now = Date.now();
    cacheData.forEach((row) => {
      const cache = mapRowToCache(row);
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
 * Supabase에 여러 주식 가격 캐시 일괄 저장 (upsert, service-role only)
 *
 * Non-poisoning: silently fails on error.
 */
export async function saveBatchPricesToCache(prices: StockPriceCache[]): Promise<void> {
  if (prices.length === 0) return;

  const client = getServiceClient();
  if (!client) return;

  try {
    const validPrices = prices.filter(validateStockPrice);
    if (validPrices.length === 0) return;

    const cacheRows = validPrices.map(mapCacheToInsert);
    const { error } = await client.from('stock_price_cache').upsert(cacheRows);

    if (error) {
      logCacheError('Failed to save batch prices', error);
    }
  } catch (err) {
    logCacheError('Failed to save batch prices', err);
  }
}
