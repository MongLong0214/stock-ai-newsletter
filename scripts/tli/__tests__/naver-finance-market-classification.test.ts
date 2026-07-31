import { describe, expect, it } from 'vitest'

import { classifyKisRepresentativeMarketName } from '@/app/archive/_utils/api/kis/client'
import {
  classifyExplicitNaverMarket,
} from '@/scripts/tli/collectors/naver-finance-themes'
import {
  NaverFinanceThemeGateError,
  validateNaverFinanceThemeStocks,
} from '@/scripts/tli/collectors/naver-finance-theme-gates'

const validRow = {
  themeId: 'theme-ai',
  symbol: '005930',
  name: '삼성전자',
  market: 'KOSPI',
  currentPrice: 70_000,
  priceChangePct: 1.2,
  volume: 1_000_000,
} as const

describe('Naver Finance authoritative market classification', () => {
  it('accepts only explicit Naver sosok=0/1 exchange markers', () => {
    expect(classifyExplicitNaverMarket('/item/main.naver?code=105560&sosok=0')).toBe('KOSPI')
    expect(classifyExplicitNaverMarket('/item/main.naver?code=000250&sosok=1')).toBe('KOSDAQ')
    expect(classifyExplicitNaverMarket('/item/main.naver?sosok=1&code=000250')).toBe('KOSDAQ')
  })

  it('does not infer market from known stock-code counterexamples', () => {
    expect(classifyExplicitNaverMarket('/item/main.naver?code=000250')).toBe('UNKNOWN')
    expect(classifyExplicitNaverMarket('/item/main.naver?code=105560')).toBe('UNKNOWN')
    expect(classifyExplicitNaverMarket('/item/main.naver?code=000250&sosok=9')).toBe('UNKNOWN')
  })

  it('strictly maps recognized KIS representative-market names', () => {
    expect(classifyKisRepresentativeMarketName('KOSPI')).toBe('KOSPI')
    expect(classifyKisRepresentativeMarketName('KOSPI200')).toBe('KOSPI')
    expect(classifyKisRepresentativeMarketName('코스닥')).toBe('KOSDAQ')
    expect(classifyKisRepresentativeMarketName('KONEX')).toBeNull()
    expect(classifyKisRepresentativeMarketName(undefined)).toBeNull()
  })

  it('rejects UNKNOWN before a row can be persisted as valid collection data', () => {
    expect(() => validateNaverFinanceThemeStocks(
      [{ ...validRow, market: 'UNKNOWN' }],
      { expectedRows: 1 },
    )).toThrow(NaverFinanceThemeGateError)
  })
})
