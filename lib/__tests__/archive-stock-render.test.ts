import { load } from 'cheerio'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import NewsletterGrid from '@/app/archive/_components/layout/newsletter-grid'
import type { DateString, StockData } from '@/app/archive/_types/archive.types'
import { getStockRationaleItems } from '@/lib/newsletter/stock-selection'

const makeStocks = (): StockData[] => [24, 50, 24].map((score, index) => ({
  ticker: `KOSDAQ:00000${index + 1}`,
  name: `종목 ${index + 1}`,
  close_price: 10_000,
  rationale: `기준일 종가 10,000원|RSI 20.7 약세|ATR14 21.4%|공동 목표 모델 순위 ${index + 1}위|선정 목표 발행일 양봉·시가 대비 5거래일 내 +10% 터치|변동성 안정 순위 ${index + 1}위|선정 경로 저변동 안정`,
  signals: {
    trend_score: 19, momentum_score: 27, volume_score: 53,
    volatility_score: 0, pattern_score: 8, sentiment_score: 17, overall_score: score,
  },
  selection: {
    strategy: 'bullishTarget5d', rank: (index + 1) as 1 | 2 | 3,
    objective: 'bullishThenTouch10Within5TradingDays',
  },
}))

const renderStocks = (stocks: StockData[]) => renderToStaticMarkup(React.createElement(NewsletterGrid, {
  newsletter: { date: '2026-09-30' as DateString, stocks, sentAt: null, subscriberCount: 3 },
  stockPrices: new Map(), historicalClosePrices: new Map(), settledClosePrices: new Map(),
  isLoadingPrice: false, unavailableReason: null, isMarketClosed: false, isTrackingExpired: false,
}))

// Vitest uses the classic JSX transform for this Next.js project's preserved JSX.
beforeAll(() => vi.stubGlobal('React', React))
afterAll(() => vi.unstubAllGlobals())

describe('archive stock cards', () => {
  it('removes only the exact retired Summary items and preserves unrelated facts and rank text', () => {
    const facts = [
      ' ATR14 21.4% ', '변동성 안정 순위 4위', '변동성 안정 순위 10위',
      '변동성 안정 순위 1위 참고', '선정 경로 저변동 안정 참고',
      '거래량 순위 1위', '공동 목표 모델 순위 1위 참고',
    ]
    const rationale = [...facts, '변동성 안정 순위 1위', ' 변동성 안정 순위 2위 ',
      '변동성 안정 순위 3위', ' 선정 경로 저변동 안정 ',
      '공동 목표 모델 순위 1위', '선정 목표 발행일 양봉·시가 대비 5거래일 내 +10% 터치',
    ].join('|')
    expect(getStockRationaleItems(rationale)).toEqual(facts)
    expect(rationale).toContain(' 변동성 안정 순위 2위 ')
  })

  it('renders stored selection metadata as the original score cards without the retired copy', () => {
    const stocks = makeStocks()
    const before = structuredClone(stocks)
    const html = renderStocks(stocks)
    const $ = load(html)
    const cards = $('article')

    expect(cards.map((_, card) => $(card).find('h3').text()).get()).toEqual(['종목 2', '종목 1', '종목 3'])
    expect(cards.map((_, card) => $(card).find('.font-black').text()).get()).toEqual(['50', '24', '24'])
    for (const card of cards.toArray()) {
      expect($(card).find('.font-black').attr('class')).toContain('text-5xl sm:text-6xl')
      expect($(card).find('[class*="bg-slate-800/50"]').map((_, item) => $(item).text()).get()).toEqual([
        '기준일 종가 10,000원', 'RSI 20.7 약세', 'ATR14 21.4%',
      ])
    }
    expect(cards.eq(0).find('.font-black').attr('class')).toContain('from-amber-400 to-yellow-400')
    expect(cards.eq(1).find('.font-black').attr('class')).toContain('from-red-400 to-orange-400')
    expect(html.match(/종합 점수/g)).toHaveLength(3)
    for (const phrase of ['선정 순위', '선정 목표', '공동 목표 모델 순위', '기술 참고 점수',
      '추천일 양봉 마감', '추천일 포함 5거래일', '상승 확률이 아닙니다',
      '변동성 안정 순위', '선정 경로 저변동 안정']) {
      expect(html).not.toContain(phrase)
    }
    expect(stocks).toEqual(before)

    const legacyStocks = stocks.map((stock) => {
      const legacy = { ...stock, rationale: '기준일 종가 10,000원|RSI 20.7 약세|ATR14 21.4%' }
      delete legacy.selection
      return legacy
    })
    expect(html).toBe(renderStocks(legacyStocks))
  })
})
