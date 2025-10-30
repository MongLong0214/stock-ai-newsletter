import { supabase } from '@/lib/supabase';
import ArchiveClient from './_components/archive-client';
import type { DateString, NewsletterArchive, StockData } from './_types/archive.types';

// ISR: 24시간마다 재검증
export const revalidate = 86400;

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

    const isValid = stocks.every((stock) => {
      return (
        stock &&
        typeof stock === 'object' &&
        !('__proto__' in stock) &&
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
      console.error('[Archive] Invalid data: missing required fields');
      return null;
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

  if (data) {
    for (const row of data) {
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
      }
    }
  }

  return <ArchiveClient initialNewsletters={newsletters} availableDates={availableDates} />;
}
