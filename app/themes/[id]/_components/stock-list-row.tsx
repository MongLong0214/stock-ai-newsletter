'use client'

import { ExternalLink, Minus, TrendingDown, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatPrice, formatVolume } from '@/lib/tli/format-utils'
import { DEFAULT_MARKET_STYLE, formatChange, getHeatBackground, MARKET_STYLE } from './stock-list-utils'
import type { Stock } from './stock-list-utils'

const NAVER_FINANCE_URL = 'https://finance.naver.com/item/main.naver?code='

interface StockRowProps {
  stock: Stock
  idx: number
  maxVolume: number
}

function ChangeIcon({ isPositive, isNegative }: { isPositive: boolean; isNegative: boolean }) {
  if (isPositive) return <TrendingUp className="h-3 w-3 shrink-0" />
  if (isNegative) return <TrendingDown className="h-3 w-3 shrink-0" />
  return <Minus className="h-3 w-3 shrink-0" />
}

function formatMarketCap(value?: number | null) {
  if (value == null || value <= 0) return '—'
  if (value >= 10_000) return `${(value / 10_000).toFixed(1)}조`
  return `${value.toLocaleString('ko-KR')}억`
}

function formatTradingValue(value?: number | null) {
  if (value == null || value <= 0) return '—'
  if (value >= 10_000) return `${(value / 10_000).toFixed(1)}억`
  return `${value.toLocaleString('ko-KR')}만`
}

export function StockRow({ stock, idx, maxVolume }: StockRowProps) {
  const mStyle = MARKET_STYLE[stock.market] ?? DEFAULT_MARKET_STYLE
  const hasPrice = stock.currentPrice != null
  const changePct = stock.priceChangePct ?? 0
  const isPositive = changePct > 0
  const isNegative = changePct < 0
  const href = `${NAVER_FINANCE_URL}${stock.symbol}`
  const heatBg = getHeatBackground(stock.priceChangePct)
  const volumeRatio = maxVolume > 0 && stock.volume ? stock.volume / maxVolume : 0
  const volumeWidth = stock.volume != null ? Math.max(6, Math.min(100, volumeRatio * 100)) : 0

  const changeTone = !hasPrice
    ? 'text-slate-400'
    : isPositive
      ? 'text-emerald-300'
      : isNegative
        ? 'text-red-300'
        : 'text-slate-300'

  const currentPrice = hasPrice ? formatPrice(stock.currentPrice!) : '—'
  const prevClose = stock.previousClose != null ? formatPrice(stock.previousClose) : '—'
  const openPrice = stock.openPrice != null ? formatPrice(stock.openPrice) : '—'
  const highPrice = stock.highPrice != null ? formatPrice(stock.highPrice) : '—'
  const lowPrice = stock.lowPrice != null ? formatPrice(stock.lowPrice) : '—'
  const changeValue = hasPrice ? formatChange(changePct) : '—'
  const deltaValue = stock.priceDelta != null ? formatPrice(stock.priceDelta) : '—'
  const volumeText = stock.volume != null ? formatVolume(stock.volume) : '—'
  const tradingValueText = formatTradingValue(stock.tradingValue)

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'group relative block border-b border-slate-800/30 transition-colors duration-150',
        'hover:bg-white/[0.025]',
        heatBg,
      )}
      aria-label={`${stock.name} 상세 보기`}
    >
      {/* Hover accent bar */}
      <div className="absolute left-0 top-0 h-full w-0 bg-emerald-400/80 transition-all duration-150 group-hover:w-[3px]" />

      {/* ── Mobile ── */}
      <div className="lg:hidden px-4 py-3 space-y-1.5">
        {/* Row 1: Rank + Name + Market + Change */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-[11px] font-mono text-slate-500 tabular-nums w-5 text-center shrink-0">
              {idx + 1}
            </span>
            <span className="text-[14px] font-semibold text-slate-100 truncate group-hover:text-white transition-colors">
              {stock.name}
            </span>
            <span className={cn(
              'text-[9px] font-mono px-1.5 py-0.5 rounded-full border shrink-0',
              mStyle.bg, mStyle.border, mStyle.text,
            )}>
              {stock.market}
            </span>
          </div>
          <div className={cn(
            'flex items-center gap-1 text-[13px] font-mono font-semibold tabular-nums shrink-0',
            changeTone,
          )}>
            {hasPrice && <ChangeIcon isPositive={isPositive} isNegative={isNegative} />}
            {changeValue}
          </div>
        </div>

        {/* Row 2: Symbol + MarketCap + Price */}
        <div className="flex items-center justify-between gap-2 pl-[30px]">
          <span className="text-[11px] font-mono text-slate-500">
            {stock.symbol} · 시총 {formatMarketCap(stock.marketCap)}
          </span>
          <span className="text-[13px] font-mono font-semibold text-slate-200 tabular-nums shrink-0">
            {currentPrice}
          </span>
        </div>

        {/* Row 3: Prev close + Delta + Open */}
        <div className="flex items-center justify-between gap-2 pl-[30px] text-[11px] font-mono text-slate-500 tabular-nums">
          <span>전일 {prevClose} · 변동 {deltaValue}</span>
          <span>시가 {openPrice}</span>
        </div>

        {/* Row 4: High / Low */}
        <div className="flex items-center justify-between gap-2 pl-[30px] text-[11px] font-mono text-slate-500 tabular-nums">
          <span>고 {highPrice} · 저 {lowPrice}</span>
          <span>거래대금 {tradingValueText}</span>
        </div>

        {/* Row 5: Volume bar */}
        <div className="flex items-center gap-2 pl-[30px]">
          <span className="text-[11px] font-mono text-slate-500 shrink-0">거래량</span>
          <span className="text-[11px] font-mono text-slate-300 tabular-nums shrink-0">{volumeText}</span>
          <div className="flex-1 h-[3px] bg-slate-800/60 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500/40 rounded-full transition-all duration-300"
              style={{ width: `${volumeWidth}%` }}
            />
          </div>
        </div>
      </div>

      {/* ── Desktop ── */}
      <div className="hidden lg:grid lg:grid-cols-[40px_minmax(0,1.5fr)_132px_120px_176px] gap-4 items-center px-5 h-[84px]">
        {/* Rank */}
        <span className="text-[11px] font-mono text-slate-500 text-center tabular-nums">
          {idx + 1}
        </span>

        {/* Name + Info */}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-semibold text-slate-100 truncate group-hover:text-white transition-colors">
              {stock.name}
            </span>
            <span className={cn(
              'inline-flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded-full border shrink-0',
              mStyle.bg, mStyle.border, mStyle.text,
            )}>
              <span className={cn('w-1 h-1 rounded-full', mStyle.dot)} />
              {stock.market}
            </span>
            <ExternalLink className="w-3.5 h-3.5 text-slate-700 group-hover:text-emerald-400 transition-colors shrink-0 ml-auto" />
          </div>
          <div className="mt-0.5 text-[11px] font-mono text-slate-500">
            {stock.symbol} · 시총 {formatMarketCap(stock.marketCap)}
          </div>
          <div className="mt-0.5 text-[10px] font-mono text-slate-600 tabular-nums">
            {stock.per != null || stock.pbr != null
              ? `${stock.per != null ? `PER ${stock.per.toFixed(1)}` : ''}${stock.per != null && stock.pbr != null ? ' · ' : ''}${stock.pbr != null ? `PBR ${stock.pbr.toFixed(2)}` : ''}`
              : `시가 ${openPrice}`}
          </div>
        </div>

        {/* Price */}
        <div className="text-right">
          <div className="text-[13px] font-mono font-semibold text-slate-100 tabular-nums">{currentPrice}</div>
          <div className="mt-0.5 text-[11px] font-mono text-slate-500 tabular-nums">전일 {prevClose}</div>
          <div className="mt-0.5 text-[10px] font-mono text-slate-600 tabular-nums">시가 {openPrice}</div>
        </div>

        {/* Change */}
        <div className={cn('text-right', changeTone)}>
          <div className="inline-flex items-center justify-end gap-1 text-[13px] font-mono font-semibold tabular-nums w-full">
            {hasPrice && <ChangeIcon isPositive={isPositive} isNegative={isNegative} />}
            {changeValue}
          </div>
          <div className="mt-0.5 text-[11px] font-mono text-slate-500 tabular-nums">{deltaValue}</div>
          <div className="mt-0.5 text-[10px] font-mono text-slate-600 tabular-nums whitespace-nowrap">
            <span className="text-red-400/60">고-</span>{highPrice} <span className="text-sky-400/60">저-</span>{lowPrice}
          </div>
        </div>

        {/* Volume */}
        <div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] font-mono text-slate-300 tabular-nums">{volumeText}</span>
            <span className="text-[10px] font-mono text-slate-500 tabular-nums">{tradingValueText}</span>
          </div>
          <div className="mt-1 h-[3px] bg-slate-800/60 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500/40 rounded-full transition-all duration-300"
              style={{ width: `${volumeWidth}%` }}
            />
          </div>
        </div>
      </div>
    </a>
  )
}
