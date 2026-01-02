/**
 * 뉴스레터 그리드
 *
 * 선택된 날짜의 뉴스레터 종목 카드들을 반응형 그리드로 표시합니다.
 * 종목들은 overall_score 내림차순으로 정렬됩니다.
 */

import { motion } from 'framer-motion';
import NewsletterCard from '../cards/newsletter-card';
import type { Newsletter } from '../../_types/archive.types';
import type { StockPrice } from '../cards/newsletter-card/types';
import type { PriceUnavailableReason } from '../../_hooks/use-stock-prices';
import { createFadeInUpVariant, calculateCardDelay } from '../../_constants/animations';

interface NewsletterGridProps {
  /** 표시할 뉴스레터 */
  newsletter: Newsletter;
  /** 각 종목의 현재가 정보 (티커 → 가격 정보) */
  stockPrices: Map<string, StockPrice>;
  /** 추천일 전일 종가 (티커 → 종가) */
  historicalClosePrices: Map<string, number>;
  /** 가격 로딩 상태 */
  isLoadingPrice: boolean;
  /** 현재가 조회 불가 사유 */
  unavailableReason: PriceUnavailableReason | null;
}

function NewsletterGrid({
  newsletter,
  stockPrices,
  historicalClosePrices,
  isLoadingPrice,
  unavailableReason,
}: NewsletterGridProps) {
  // rationale 항목 최대 개수 계산 (카드 높이 균일화용)
  const maxRationaleItems = Math.max(
    ...newsletter.stocks.map((stock) => stock.rationale.split('|').length)
  );

  // overall_score 내림차순 정렬
  const sortedStocks = [...newsletter.stocks].sort(
    (a, b) => b.signals.overall_score - a.signals.overall_score
  );

  return (
    <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
      {sortedStocks.map((stock, index) => (
        <motion.div
          key={stock.ticker}
          {...createFadeInUpVariant(calculateCardDelay(index))}
        >
          <NewsletterCard
            stock={stock}
            maxRationaleItems={maxRationaleItems}
            newsletterDate={newsletter.date}
            currentPrice={stockPrices.get(stock.ticker)}
            historicalClosePrice={historicalClosePrices.get(stock.ticker)}
            isLoadingPrice={isLoadingPrice}
            unavailableReason={unavailableReason}
          />
        </motion.div>
      ))}
    </div>
  );
}

export default NewsletterGrid;