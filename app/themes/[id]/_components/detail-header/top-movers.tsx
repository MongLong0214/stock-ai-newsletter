/** 주요 변동 종목 섹션 */
'use client'

import { useMemo } from 'react'
import { useReducedMotion, motion } from 'framer-motion'
import { TrendingUp, TrendingDown, BarChart3 } from 'lucide-react'
import { formatPrice, formatVolume } from '@/lib/tli/format-utils'

const MAX_TOP_MOVERS = 4

interface TopMoversStock {
  symbol: string
  name: string
  market: string
  currentPrice: number | null
  priceChangePct: number | null
  volume: number | null
}

interface TopMoversProps {
  stocks: TopMoversStock[]
}

export default function TopMovers({ stocks }: TopMoversProps) {
  const shouldReduceMotion = useReducedMotion()

  const topMovers = useMemo(() => {
    return [...stocks]
      .filter(s => s.priceChangePct != null)
      .sort((a, b) => Math.abs(b.priceChangePct!) - Math.abs(a.priceChangePct!))
      .slice(0, MAX_TOP_MOVERS)
  }, [stocks])

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-mono text-slate-400 uppercase tracking-wider">주요 변동 종목</h3>
        {topMovers.length > 0 && (
          <span className="text-[10px] font-mono text-slate-600">등락률 기준</span>
        )}
      </div>
      {topMovers.length > 0 ? (
        <div className="space-y-2.5">
          {topMovers.map((stock, idx) => {
            const pct = stock.priceChangePct ?? 0
            const isUp = pct >= 0
            return (
              <motion.div
                key={stock.symbol}
                initial={shouldReduceMotion ? false : { opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.1, duration: 0.4 }}
                className={`rounded-xl border p-3.5 group hover:border-emerald-500/40 transition-all ${
                  isUp ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-bold text-white truncate">{stock.name}</span>
                      <span className="text-[10px] font-mono text-slate-600 shrink-0">{stock.market}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] font-mono text-slate-500">
                      <span>₩{formatPrice(stock.currentPrice)}</span>
                      <span className="text-slate-700">•</span>
                      <span>거래량 {formatVolume(stock.volume)}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <div className={`flex items-center gap-1 px-2 py-0.5 rounded-md ${isUp ? 'bg-emerald-500/20' : 'bg-red-500/20'}`}>
                      {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      <span className={`text-xs font-black ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
                        {isUp ? '+' : ''}{pct.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                </div>
              </motion.div>
            )
          })}
          {stocks.length > MAX_TOP_MOVERS && (
            <p className="text-[10px] font-mono text-slate-600 text-center pt-1">
              외 {stocks.length - MAX_TOP_MOVERS}개 종목 포함
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-32 rounded-xl bg-slate-800/20 border border-slate-700/20">
          <BarChart3 className="w-8 h-8 text-slate-700 mb-2" />
          <p className="text-xs font-mono text-slate-600">시세 데이터를 준비하고 있어요</p>
        </div>
      )}
    </div>
  )
}
