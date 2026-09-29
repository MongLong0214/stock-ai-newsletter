import { describe, expect, it } from 'vitest';
import type { StockData } from '../_types/stock-data';
import { extractAndValidateJSON, validateStockData } from './stock-json';
import { sortStocksForDisplay } from '@/lib/newsletter/stock-selection';

const makeStocks = (): StockData[] => [1, 2, 3].map((rank) => ({
  ticker: `KOSPI:${String(rank).padStart(6, '0')}`,
  name: `종목 ${rank}`,
  close_price: 10_000,
  rationale: '기준일 시세와 기술 지표로 선정한 종목의 실제 분석 근거입니다. 미래의 상승 확률을 나타내는 값이 아닙니다.',
  signals: {
    trend_score: 50, momentum_score: 50, volume_score: 50,
    volatility_score: 50, pattern_score: 50, sentiment_score: 50,
    overall_score: rank * 10,
  },
  selection: {
    strategy: 'test-five-day-target',
    rank: rank as 1 | 2 | 3,
    objective: 'bullishThenTouch10Within5TradingDays',
  },
}));

describe('stock selection JSON contract', () => {
  it('preserves metadata through JSON extraction and uses actual rank instead of technical score', () => {
    const stocks = makeStocks();
    const reversed = [...stocks].reverse();
    const json = extractAndValidateJSON(`선정 결과\n${JSON.stringify(reversed)}`);
    expect(json).not.toBeNull();
    expect(JSON.parse(json!)).toEqual(reversed);
    expect(sortStocksForDisplay<StockData>(JSON.parse(json!)).map((stock) => stock.name)).toEqual(stocks.map((stock) => stock.name));
    expect(reversed.map((stock) => stock.selection!.rank)).toEqual([3, 2, 1]);
  });

  it('accepts legacy results and preserves descending technical score ordering', () => {
    const stocks = makeStocks().map((stock) => {
      const legacy = { ...stock };
      delete legacy.selection;
      return legacy;
    });
    expect(validateStockData(stocks)).toBe(true);
    expect(sortStocksForDisplay(stocks).map((stock) => stock.signals.overall_score)).toEqual([30, 20, 10]);
    expect(stocks.map((stock) => stock.signals.overall_score)).toEqual([10, 20, 30]);
  });

  it.each([
    null,
    { strategy: 'target', rank: 0, objective: 'bullishThenTouch10Within5TradingDays' },
    { strategy: 'target', rank: 4, objective: 'bullishThenTouch10Within5TradingDays' },
    { strategy: 'target', rank: 1.5, objective: 'bullishThenTouch10Within5TradingDays' },
    { strategy: '', rank: 1, objective: 'bullishThenTouch10Within5TradingDays' },
    { strategy: 'target', rank: 1, objective: 'guaranteedProfit' },
  ])('rejects invalid selection metadata: %j', (selection) => {
    const stocks = makeStocks();
    expect(validateStockData([{ ...stocks[0], selection }, ...stocks.slice(1)])).toBe(false);
  });

  it('rejects partial metadata, duplicate ranks and mixed strategies', () => {
    const stocks = makeStocks();
    expect(validateStockData([{ ...stocks[0], selection: undefined }, ...stocks.slice(1)])).toBe(false);
    expect(validateStockData([{ ...stocks[0], selection: stocks[1].selection }, ...stocks.slice(1)])).toBe(false);
    expect(validateStockData([{ ...stocks[0], selection: { ...stocks[0].selection, strategy: 'other' } }, ...stocks.slice(1)])).toBe(false);
  });
});
