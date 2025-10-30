import { supabase } from '@/lib/supabase';
import ArchiveClient from './_components/archive-client';
import type { DateString, NewsletterArchive, StockData } from './_types/archive.types';

// ISR: 60초마다 재검증 (개발/테스트용 - 프로덕션에서는 86400으로 변경)
export const revalidate = 60;

/**
 * 주식 JSON 데이터 파싱 및 검증
 */
function parseAndValidateStocks(jsonString: string): StockData[] | null {
  const MAX_JSON_SIZE = 1024 * 1024; // 1MB
  if (jsonString.length > MAX_JSON_SIZE) {
    console.error('[Archive] JSON too large:', jsonString.length);
    return null;
  }

  try {
    const stocks = JSON.parse(jsonString);

    if (!Array.isArray(stocks)) {
      console.error('[Archive] Invalid data: not an array');
      return null;
    }

    if (stocks.length === 0 || stocks.length > 100) {
      console.error('[Archive] Invalid array size:', stocks.length);
      return null;
    }

    // 각 주식 검증 (상세한 로그 포함)
    for (let i = 0; i < stocks.length; i++) {
      const stock = stocks[i];

      if (!stock || typeof stock !== 'object') {
        console.error(`[Archive] Stock ${i}: not an object`);
        return null;
      }

      if ('__proto__' in stock || 'constructor' in stock) {
        console.error(`[Archive] Stock ${i}: prototype pollution attempt`);
        return null;
      }

      if (typeof stock.ticker !== 'string' || stock.ticker.length === 0) {
        console.error(`[Archive] Stock ${i}: invalid ticker`, stock);
        return null;
      }

      if (typeof stock.name !== 'string' || stock.name.length === 0) {
        console.error(`[Archive] Stock ${i}: invalid name`, stock);
        return null;
      }

      if (typeof stock.close_price !== 'number' || stock.close_price <= 0) {
        console.error(`[Archive] Stock ${i}: invalid close_price`, stock);
        return null;
      }

      if (typeof stock.rationale !== 'string' || stock.rationale.length === 0) {
        console.error(`[Archive] Stock ${i}: invalid rationale`, stock);
        return null;
      }

      if (!stock.signals || typeof stock.signals !== 'object') {
        console.error(`[Archive] Stock ${i}: invalid signals object`, stock);
        return null;
      }

      const requiredScores = [
        'trend_score', 'momentum_score', 'volume_score',
        'volatility_score', 'pattern_score', 'sentiment_score', 'overall_score'
      ];

      for (const scoreField of requiredScores) {
        if (typeof stock.signals[scoreField] !== 'number') {
          console.error(`[Archive] Stock ${i}: invalid ${scoreField}`, stock.signals);
          return null;
        }
      }
    }

    return stocks as StockData[];
  } catch (err) {
    console.error('[Archive] JSON parse error:', err instanceof Error ? err.message : 'Unknown error');
    return null;
  }
}

/**
 * 서버 컴포넌트: 아카이브 페이지
 * - Supabase에서 직접 데이터 fetch
 * - ISR로 24시간 캐싱
 * - 클라이언트 컴포넌트에 props로 전달
 */
export default async function ArchivePage() {
  // Supabase에서 발송된 모든 뉴스레터 가져오기
  const { data, error } = await supabase
    .from('newsletter_content')
    .select('*')
    .eq('is_sent', true)
    .order('newsletter_date', { ascending: false });

  if (error) {
    console.error('[Archive] Failed to fetch newsletters:', error);
  }

  // 날짜별로 뉴스레터 매핑
  const newsletters: Record<string, NewsletterArchive> = {};
  const availableDates: DateString[] = [];

  console.log('[Archive] Fetched data:', data?.length, 'rows');

  if (data) {
    for (const row of data) {
      console.log('[Archive] Processing row:', {
        newsletter_date: row.newsletter_date,
        is_sent: row.is_sent,
        has_gemini_analysis: !!row.gemini_analysis,
        gemini_analysis_length: row.gemini_analysis?.length,
      });

      const stocks = parseAndValidateStocks(row.gemini_analysis);

      if (stocks) {
        const newsletter: NewsletterArchive = {
          date: row.newsletter_date,
          stocks,
          sentAt: row.sent_at,
          subscriberCount: row.subscriber_count ?? 0,
        };

        newsletters[row.newsletter_date] = newsletter;
        availableDates.push(row.newsletter_date as DateString);
        console.log('[Archive] Added newsletter for date:', row.newsletter_date);
      } else {
        console.error('[Archive] Failed to parse stocks for date:', row.newsletter_date);
      }
    }
  }

  console.log('[Archive] Total available dates:', availableDates.length, availableDates);

  return <ArchiveClient initialNewsletters={newsletters} availableDates={availableDates} />;
}
