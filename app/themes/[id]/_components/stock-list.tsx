'use client'

import { useState, useMemo } from 'react'
import { ExternalLink, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'

interface Stock {
  symbol: string
  name: string
  market: string
  currentPrice: number | null
  priceChangePct: number | null
  volume: number | null
}

interface StockListProps {
  stocks: Stock[]
}

/** 가격 포맷: 52300 → "52,300" */
function formatPrice(price: number): string {
  return price.toLocaleString('ko-KR')
}

/** 변동률 포맷: 3.21 → "+3.21%", -1.5 → "-1.50%" */
function formatChange(pct: number): string {
  const sign = pct > 0 ? '+' : ''
  return `${sign}${pct.toFixed(2)}%`
}

/** 거래량 축약: 1234567 → "123만", 12345 → "1.2만" */
function formatVolume(vol: number): string {
  if (vol >= 100_000_000) {
    return `${(vol / 100_000_000).toFixed(1)}억`
  }
  if (vol >= 10_000) {
    return `${(vol / 10_000).toFixed(vol >= 100_000 ? 0 : 1)}만`
  }
  return vol.toLocaleString('ko-KR')
}

/** 시장별 스타일 */
const MARKET_STYLE: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  KOSPI: {
    bg: 'bg-sky-500/10',
    border: 'border-sky-500/20',
    text: 'text-sky-400',
    dot: 'bg-sky-400',
  },
  KOSDAQ: {
    bg: 'bg-violet-500/10',
    border: 'border-violet-500/20',
    text: 'text-violet-400',
    dot: 'bg-violet-400',
  },
}

/** 관련 종목 리스트 컴포넌트 */
function StockList({ stocks }: StockListProps) {
  const [activeTab, setActiveTab] = useState<'all' | 'KOSPI' | 'KOSDAQ'>('all')

  const grouped = useMemo(() => {
    const kospi = stocks.filter(s => s.market === 'KOSPI')
    const kosdaq = stocks.filter(s => s.market === 'KOSDAQ')
    return { kospi, kosdaq }
  }, [stocks])

  const filteredStocks = useMemo(() => {
    if (activeTab === 'KOSPI') return grouped.kospi
    if (activeTab === 'KOSDAQ') return grouped.kosdaq
    return stocks
  }, [activeTab, stocks, grouped])

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.3 }}
      className="rounded-2xl border border-emerald-500/20 bg-slate-900/60 backdrop-blur-xl p-6 flex flex-col"
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold">
          <span className="text-white">관련</span>
          <span className="text-emerald-400 ml-1">종목</span>
        </h2>
        <span className="text-xs font-mono text-emerald-400 px-2 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
          {stocks.length}개
        </span>
      </div>

      {/* 탭 */}
      <div className="flex gap-1.5 mb-4">
        {(['all', 'KOSPI', 'KOSDAQ'] as const).map((tab) => {
          const count =
            tab === 'all'
              ? stocks.length
              : tab === 'KOSPI'
                ? grouped.kospi.length
                : grouped.kosdaq.length
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'text-xs font-mono px-3 py-1.5 rounded-lg border transition-all',
                activeTab === tab
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : 'bg-slate-800/30 border-slate-700/30 text-slate-500 hover:text-slate-300'
              )}
            >
              {tab === 'all' ? '전체' : tab}
              <span className="ml-1 text-[10px] opacity-60">{count}</span>
            </button>
          )
        })}
      </div>

      {/* 테이블 헤더 */}
      <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-slate-600 border-b border-slate-700/30 mb-1">
        <span>종목명</span>
        <span className="text-right w-16">시세</span>
        <span className="text-right w-16">등락</span>
        <span className="text-right w-14">거래량</span>
        <span className="text-right w-4" />
      </div>

      {/* 종목 리스트 - 커스텀 스크롤바 */}
      <div
        className="flex-1 overflow-y-auto overscroll-contain"
        style={{ maxHeight: '480px' }}
      >
        <style jsx>{`
          div::-webkit-scrollbar {
            width: 4px;
          }
          div::-webkit-scrollbar-track {
            background: transparent;
          }
          div::-webkit-scrollbar-thumb {
            background: rgba(16, 185, 129, 0.2);
            border-radius: 4px;
          }
          div::-webkit-scrollbar-thumb:hover {
            background: rgba(16, 185, 129, 0.4);
          }
        `}</style>
        <AnimatePresence mode="popLayout">
          {filteredStocks.map((stock, idx) => {
            const style = MARKET_STYLE[stock.market] ?? {
              bg: 'bg-slate-800',
              border: 'border-slate-700/50',
              text: 'text-slate-500',
              dot: 'bg-slate-500',
            }

            const hasPrice = stock.currentPrice != null
            const changePct = stock.priceChangePct ?? 0
            const isPositive = changePct > 0
            const isNegative = changePct < 0

            return (
              <motion.a
                key={stock.symbol}
                href={`https://finance.naver.com/item/main.naver?code=${stock.symbol}`}
                target="_blank"
                rel="noopener noreferrer"
                layout
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.2, delay: Math.min(idx * 0.015, 0.5) }}
                className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 items-center px-3 py-2.5 rounded-lg border border-transparent hover:bg-white/[0.03] hover:border-emerald-500/20 transition-all duration-200 group cursor-pointer"
              >
                {/* 종목명 + 코드 + 마켓 */}
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[10px] font-mono text-slate-600 w-5 text-right flex-shrink-0">
                    {idx + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-slate-200 group-hover:text-white transition-colors truncate">
                        {stock.name}
                      </span>
                      <span
                        className={cn(
                          'inline-flex items-center gap-0.5 text-[9px] font-mono px-1.5 py-0 rounded border flex-shrink-0',
                          style.bg, style.border, style.text
                        )}
                      >
                        <span className={cn('w-1 h-1 rounded-full', style.dot)} />
                        {stock.market}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-600 font-mono">{stock.symbol}</div>
                  </div>
                </div>

                {/* 현재가 */}
                <span className="text-right w-16 text-sm font-mono text-slate-300 tabular-nums">
                  {hasPrice ? formatPrice(stock.currentPrice!) : '—'}
                </span>

                {/* 등락률 */}
                <span className={cn(
                  'text-right w-16 text-xs font-mono tabular-nums inline-flex items-center justify-end gap-0.5',
                  !hasPrice ? 'text-slate-600' :
                  isPositive ? 'text-emerald-400' :
                  isNegative ? 'text-red-400' :
                  'text-slate-500'
                )}>
                  {!hasPrice ? '—' : (
                    <>
                      {isPositive ? <TrendingUp className="w-3 h-3 flex-shrink-0" /> :
                       isNegative ? <TrendingDown className="w-3 h-3 flex-shrink-0" /> :
                       <Minus className="w-3 h-3 flex-shrink-0" />}
                      {formatChange(changePct)}
                    </>
                  )}
                </span>

                {/* 거래량 */}
                <span className="text-right w-14 text-[11px] font-mono text-slate-500 tabular-nums">
                  {stock.volume != null ? formatVolume(stock.volume) : '—'}
                </span>

                {/* 외부 링크 아이콘 */}
                <ExternalLink className="w-3.5 h-3.5 text-slate-700 group-hover:text-emerald-400 transition-colors flex-shrink-0" />
              </motion.a>
            )
          })}
        </AnimatePresence>

        {stocks.length === 0 && (
          <div className="flex items-center justify-center py-12">
            <p className="text-sm text-slate-500">관련 종목 데이터가 아직 수집되지 않았습니다</p>
          </div>
        )}
      </div>
    </motion.div>
  )
}

export default StockList
