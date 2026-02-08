/** 종목 리스트 유틸리티 — 정렬, 통계, 포맷 */

import type { ThemeStockItem } from '@/lib/tli/types'
import { formatPrice as sharedFormatPrice, formatVolume as sharedFormatVolume } from '@/lib/tli/format-utils'

export type Stock = ThemeStockItem

export type SortField = 'name' | 'price' | 'change' | 'volume'
export type SortDirection = 'asc' | 'desc'

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

/** 가격 포맷: 52300 → "52,300" */
export function formatPrice(price: number): string {
  return sharedFormatPrice(price)
}

/** 변동률 포맷: 3.21 → "+3.21%", -1.5 → "-1.50%" */
export function formatChange(pct: number): string {
  const sign = pct > 0 ? '+' : ''
  return `${sign}${pct.toFixed(2)}%`
}

/** 거래량 축약 */
export function formatVolume(vol: number): string {
  return sharedFormatVolume(vol)
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
