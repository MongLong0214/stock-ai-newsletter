/** 종목 리스트 유틸리티 — 정렬, 통계, 포맷 */

import type { ThemeStockItem } from '@/lib/tli/types'

export type Stock = ThemeStockItem & {
  previousClose?: number | null
  priceDelta?: number | null
  lastUpdatedAt?: number | null
  dataSource?: 'kis' | 'stored'
  openPrice?: number | null
  highPrice?: number | null
  lowPrice?: number | null
  week52High?: number | null
  week52Low?: number | null
  tradingValue?: number | null
  marketCap?: number | null
  per?: number | null
  pbr?: number | null
  eps?: number | null
  bps?: number | null
  sharesOutstanding?: number | null
}

export type SortField = 'name' | 'price' | 'change' | 'volume'
export type SortDirection = 'asc' | 'desc'

export const DEFAULT_STOCK_SORT_FIELD: SortField = 'change'
export const DEFAULT_STOCK_SORT_DIRECTION: SortDirection = 'desc'

export interface MarketStyle {
  bg: string
  border: string
  text: string
  dot: string
}

export const MARKET_STYLE: Record<string, MarketStyle> = {
  KOSPI: { bg: 'bg-sky-500/10', border: 'border-sky-500/20', text: 'text-sky-400', dot: 'bg-sky-400' },
  KOSDAQ: { bg: 'bg-violet-500/10', border: 'border-violet-500/20', text: 'text-violet-400', dot: 'bg-violet-400' },
}

export const DEFAULT_MARKET_STYLE: MarketStyle = {
  bg: 'bg-slate-800/30', border: 'border-slate-700/30', text: 'text-slate-500', dot: 'bg-slate-500',
}

/** 변동률 포맷: 3.21 → "+3.21%", -1.5 → "-1.50%" */
export function formatChange(pct: number): string {
  const sign = pct > 0 ? '+' : ''
  return `${sign}${pct.toFixed(2)}%`
}

/** 종목 통계 계산 */
export function calculateStockStats(stocks: Stock[]) {
  const validChanges = stocks.filter(s => s.priceChangePct != null)
  const rising = validChanges.filter(s => s.priceChangePct! > 0).length
  const falling = validChanges.filter(s => s.priceChangePct! < 0).length
  const flat = validChanges.filter(s => s.priceChangePct === 0).length
  const avgChange = validChanges.length > 0
    ? validChanges.reduce((sum, s) => sum + s.priceChangePct!, 0) / validChanges.length
    : 0

  return { rising, falling, flat, avgChange }
}

export function getTopMover(stocks: Stock[]): Stock | null {
  if (stocks.length === 0) return null

  return [...stocks].sort((a, b) => {
    const aChange = Math.abs(a.priceChangePct ?? -Infinity)
    const bChange = Math.abs(b.priceChangePct ?? -Infinity)
    return bChange - aChange
  })[0] ?? null
}

export function getTopGainer(stocks: Stock[]): Stock | null {
  return [...stocks]
    .filter((stock) => stock.priceChangePct != null)
    .sort((a, b) => (b.priceChangePct ?? -Infinity) - (a.priceChangePct ?? -Infinity))[0] ?? null
}

export function getTopLoser(stocks: Stock[]): Stock | null {
  return [...stocks]
    .filter((stock) => stock.priceChangePct != null)
    .sort((a, b) => (a.priceChangePct ?? Infinity) - (b.priceChangePct ?? Infinity))[0] ?? null
}

export function getVolumeLeader(stocks: Stock[]): Stock | null {
  if (stocks.length === 0) return null

  return [...stocks].sort((a, b) => (b.volume ?? -Infinity) - (a.volume ?? -Infinity))[0] ?? null
}

export function getAveragePrice(stocks: Stock[]): number | null {
  const valid = stocks.filter((stock) => stock.currentPrice != null)
  if (valid.length === 0) return null

  return valid.reduce((sum, stock) => sum + (stock.currentPrice ?? 0), 0) / valid.length
}

/** 최대 거래량 찾기 */
export function getMaxVolume(stocks: Stock[]): number {
  return stocks.reduce((max, s) => {
    if (s.volume !== null && s.volume !== undefined && s.volume > max) {
      return s.volume
    }
    return max
  }, 0)
}

/** 변동률 기반 배경 그라데이션 클래스 */
export function getHeatBackground(changePct: number | null): string {
  if (changePct == null) return ''
  if (changePct >= 5) return 'bg-gradient-to-r from-emerald-500/[0.04] via-emerald-500/[0.02] to-transparent'
  if (changePct > 0) return 'bg-gradient-to-r from-emerald-500/[0.02] via-emerald-500/[0.01] to-transparent'
  if (changePct <= -5) return 'bg-gradient-to-r from-red-500/[0.04] via-red-500/[0.02] to-transparent'
  if (changePct < 0) return 'bg-gradient-to-r from-red-500/[0.02] via-red-500/[0.01] to-transparent'
  return ''
}

/** 종목 정렬 */
export function sortStocks(stocks: Stock[], field: SortField, direction: SortDirection): Stock[] {
  return [...stocks].sort((a, b) => {
    if (field === 'name') {
      return direction === 'asc'
        ? a.name.localeCompare(b.name, 'ko-KR')
        : b.name.localeCompare(a.name, 'ko-KR')
    }

    const valMap: Record<Exclude<SortField, 'name'>, (s: Stock) => number> = {
      price: (s) => s.currentPrice ?? -Infinity,
      change: (s) => s.priceChangePct ?? -Infinity,
      volume: (s) => s.volume ?? -Infinity,
    }

    const aVal = valMap[field](a)
    const bVal = valMap[field](b)
    return direction === 'asc' ? aVal - bVal : bVal - aVal
  })
}

export function getLeadLabel(sortField: SortField, sortDirection: SortDirection) {
  if (sortField === 'name') return sortDirection === 'asc' ? '이름순 선두' : '이름순 후행'
  if (sortField === 'price') return sortDirection === 'asc' ? '최저가 기준 선두' : '최고가 기준 선두'
  if (sortField === 'volume') return sortDirection === 'asc' ? '최저 거래량 기준 선두' : '최고 거래량 기준 선두'
  return sortDirection === 'asc' ? '하락률 기준 선두' : '상승률 기준 선두'
}
