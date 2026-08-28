import { describe, expect, it } from 'vitest'

import {
  LookaheadError,
  StockDataHandler,
  buildKeysetCondition,
  buildPriceBook,
} from '@/scripts/stock-picks/data-handler'
import { TradingDayIndex } from '@/scripts/stock-picks/trading-days'

describe('StockDataHandler Clock guard', () => {
  it('throws when a strategy asks for a date after simDate', () => {
    const tradingDays = new TradingDayIndex(['2026-01-02', '2026-01-05'])
    const prices = buildPriceBook([{
      symbol: 'KOSPI:005930',
      trade_date: '2026-01-02',
      open: 100,
      high: 105,
      low: 95,
      close: 102,
      volume: 1000,
      source: 'kis',
    }])
    const handler = new StockDataHandler(prices, tradingDays).at('2026-01-02')

    expect(handler.get('KOSPI:005930', '2026-01-02')?.close).toBe(102)
    expect(() => handler.get('KOSPI:005930', '2026-01-05')).toThrow(LookaheadError)
  })
})

describe('buildKeysetCondition', () => {
  it('심볼 콜론을 인용하고 복합 PK 시크 조건을 만든다', () => {
    expect(buildKeysetCondition({ symbol: 'KOSPI:005930', tradeDate: '2026-08-27' })).toBe(
      'symbol.gt."KOSPI:005930",and(symbol.eq."KOSPI:005930",trade_date.gt.2026-08-27)',
    )
  })
})
