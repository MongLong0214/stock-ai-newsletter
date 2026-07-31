import { describe, expect, it, vi } from 'vitest'

import type { KisStockPrice } from '@/app/archive/_utils/api/kis/types'
import type { StockData } from '@/lib/llm/_types/stock-data'
import {
  verifyGeneratedStockClaims,
  type StockClaimsVerifierDependencies,
  type StockIdentityEvidence,
} from '@/lib/llm/korea/stock-claims-verifier'

const stock = (ticker: string, name: string, closePrice: number): StockData => ({
  ticker,
  name,
  close_price: closePrice,
  rationale: 'RSI 70 강세이며 확인되지 않은 자유 형식 모델 설명이 충분히 길게 포함된 기존 rationale 문자열',
  signals: {
    trend_score: 80,
    momentum_score: 70,
    volume_score: 60,
    volatility_score: 50,
    pattern_score: 40,
    sentiment_score: 30,
    overall_score: 65,
  },
})

const generatedStocks = [
  stock('KOSPI:005930', '삼성전자', 70_000),
  stock('KOSPI:000660', 'SK하이닉스', 180_000),
  stock('KOSDAQ:035720', '카카오', 40_000),
]

const identities = new Map<string, StockIdentityEvidence>([
  ['005930', { symbol: '005930', name: '삼성전자', market: 'KOSPI', source: 'naver_theme_stocks' }],
  ['000660', { symbol: '000660', name: 'SK하이닉스', market: 'KOSPI', source: 'naver_theme_stocks' }],
  ['035720', { symbol: '035720', name: '카카오', market: 'KOSDAQ', source: 'naver_theme_stocks' }],
])

const previousCloseByTicker = new Map(generatedStocks.map((item) => [item.ticker, item.close_price]))

const quote = (ticker: string, previousClose: number): KisStockPrice => ({
  ticker,
  currentPrice: previousClose,
  previousClose,
  changeRate: 0,
  volume: 1,
  timestamp: 0,
})

const dependencies = (overrides: Partial<StockClaimsVerifierDependencies> = {}): StockClaimsVerifierDependencies => ({
  loadIdentities: vi.fn(async () => identities),
  loadMarket: vi.fn(async (symbol) => identities.get(symbol)?.market ?? 'KOSPI'),
  loadQuote: vi.fn(async (ticker) => quote(ticker, previousCloseByTicker.get(ticker) ?? 1)),
  now: () => new Date('2026-07-31T00:00:00.000Z'),
  ...overrides,
})

describe('generated stock claims verifier', () => {
  it('returns only independently verified identity/close facts and labelled model scores', async () => {
    const result = await verifyGeneratedStockClaims(JSON.stringify(generatedStocks), dependencies())

    expect(result.evidence).toHaveLength(3)
    expect(result.stocks[0]).toMatchObject({
      ticker: 'KOSPI:005930',
      name: '삼성전자',
      close_price: 70_000,
    })
    expect(result.stocks[0].rationale).toContain('KIS 전일 종가 70,000원 확인')
    expect(result.stocks[0].rationale).toContain('모델 산출 종합 65점')
    expect(result.stocks[0].rationale).not.toContain('RSI 70 강세')
    expect(JSON.parse(result.json)).toEqual(result.stocks)
  })

  it('rejects a generated name that differs from independent identity metadata', async () => {
    const candidate = generatedStocks.map((item, index) => index === 0 ? { ...item, name: '가짜회사' } : item)
    await expect(verifyGeneratedStockClaims(JSON.stringify(candidate), dependencies()))
      .rejects.toThrow(/Name mismatch/)
  })

  it('rejects generated and KIS market mismatches', async () => {
    await expect(verifyGeneratedStockClaims(JSON.stringify(generatedStocks), dependencies({
      loadMarket: vi.fn(async (symbol) => symbol === '005930' ? 'KOSDAQ' : identities.get(symbol)!.market),
    }))).rejects.toThrow(/KIS market mismatch/)
  })

  it('rejects any previous-close mismatch instead of applying a tolerance', async () => {
    await expect(verifyGeneratedStockClaims(JSON.stringify(generatedStocks), dependencies({
      loadQuote: vi.fn(async (ticker) => quote(ticker, ticker === 'KOSPI:005930' ? 69_999 : previousCloseByTicker.get(ticker)!)),
    }))).rejects.toThrow(/Previous-close mismatch/)
  })

  it('rejects duplicate tickers even when the base JSON shape is otherwise valid', async () => {
    const duplicate = [generatedStocks[0], { ...generatedStocks[0] }, generatedStocks[2]]
    await expect(verifyGeneratedStockClaims(JSON.stringify(duplicate), dependencies()))
      .rejects.toThrow(/duplicate tickers/)
  })

  it('rejects missing independent identity evidence', async () => {
    await expect(verifyGeneratedStockClaims(JSON.stringify(generatedStocks), dependencies({
      loadIdentities: vi.fn(async () => new Map()),
    }))).rejects.toThrow(/No independent identity evidence/)
  })
})
