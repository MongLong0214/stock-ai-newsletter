'use client'

import { ExternalLink, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { formatPrice, formatVolume } from '@/lib/tli/format-utils'
import { MARKET_STYLE, DEFAULT_MARKET_STYLE, formatChange, getHeatBackground } from './stock-list-utils'
import type { Stock } from './stock-list-utils'

const NAVER_FINANCE_URL = 'https://finance.naver.com/item/main.naver?code='

interface StockRowProps {
  stock: Stock
  idx: number
  maxVolume: number
}

function getStockDisplay(stock: Stock) {
  const style = MARKET_STYLE[stock.market] ?? DEFAULT_MARKET_STYLE
  const hasPrice = stock.currentPrice !== null && stock.currentPrice !== undefined
  const changePct = stock.priceChangePct ?? 0
  const isPositive = changePct > 0
  const isNegative = changePct < 0
  const href = `${NAVER_FINANCE_URL}${stock.symbol}`
  const changeColor = !hasPrice ? 'text-slate-600' : isPositive ? 'text-emerald-400' : isNegative ? 'text-red-400' : 'text-slate-500'
  return { style, hasPrice, changePct, isPositive, isNegative, href, changeColor }
}

function ChangeIcon({ isPositive, isNegative }: { isPositive: boolean; isNegative: boolean }) {
  if (isPositive) return <TrendingUp className="w-3 h-3 flex-shrink-0" />
  if (isNegative) return <TrendingDown className="w-3 h-3 flex-shrink-0" />
  return <Minus className="w-3 h-3 flex-shrink-0" />
}

/**
 * 종목 행 — 좁은 컨테이너(~400px)에 최적화된 2행 레이아웃
 * Row 1: [idx] [종목명 ————————] [등락률]
 * Row 2:       [코드] [마켓]     [시세 · 거래량]
 */
export function StockRow({ stock, idx, maxVolume }: StockRowProps) {
  const { style, hasPrice, changePct, href, changeColor } = getStockDisplay(stock)
  const heatBg = getHeatBackground(stock.priceChangePct)
  const volumeRatio = maxVolume > 0 && stock.volume ? stock.volume / maxVolume : 0

  return (
    <motion.a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.12, delay: Math.min(idx * 0.01, 0.15) }}
      className={cn(
        'block px-4 py-2.5 border-b border-slate-800/20 relative',
        'hover:bg-white/[0.03] transition-all duration-150 group cursor-pointer',
        heatBg
      )}
      aria-label={`${stock.name} 상세 보기`}
    >
      {/* 호버 왼쪽 악센트 */}
      <div className="absolute left-0 top-0 h-full w-0 group-hover:w-0.5 bg-emerald-400 transition-all duration-150" />

      {/* Row 1: 종목명 + 등락률 */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono text-slate-700 w-4 text-right flex-shrink-0 tabular-nums">{idx + 1}</span>
        <span className="flex-1 text-[13px] font-medium text-slate-200 group-hover:text-white transition-colors truncate min-w-0">
          {stock.name}
        </span>
        <span className={cn('flex-shrink-0 text-[13px] font-mono font-semibold tabular-nums inline-flex items-center gap-0.5', changeColor)}>
          {!hasPrice ? '—' : (<><ChangeIcon isPositive={changePct > 0} isNegative={changePct < 0} />{formatChange(changePct)}</>)}
        </span>
        <ExternalLink className="w-3 h-3 text-slate-700 group-hover:text-emerald-400 transition-colors flex-shrink-0" />
      </div>

      {/* Row 2: 코드 + 마켓 + 시세 + 거래량 */}
      <div className="flex items-center gap-2 mt-1 ml-6">
        <span className="text-[10px] text-slate-600 font-mono">{stock.symbol}</span>
        <span className={cn('inline-flex items-center gap-0.5 text-[8px] font-mono px-1 py-px rounded border', style.bg, style.border, style.text)}>
          <span className={cn('w-1 h-1 rounded-full', style.dot)} />
          {stock.market}
        </span>
        <span className="flex-1" />
        {hasPrice && stock.currentPrice !== null && (
          <span className="text-[11px] font-mono text-slate-400 tabular-nums">{formatPrice(stock.currentPrice)}</span>
        )}
        {stock.volume != null && (
          <span className="text-[10px] font-mono text-slate-600 tabular-nums flex items-center gap-1">
            {formatVolume(stock.volume)}
            {volumeRatio > 0 && (
              <span className="inline-block w-6 h-[2px] bg-slate-800/60 rounded-full overflow-hidden">
                <span className="block h-full bg-emerald-500/40 rounded-full" style={{ width: `${volumeRatio * 100}%` }} />
              </span>
            )}
          </span>
        )}
      </div>
    </motion.a>
  )
}
