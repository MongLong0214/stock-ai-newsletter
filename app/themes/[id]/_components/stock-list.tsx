'use client'

import { useState, useMemo, useCallback } from 'react'
import { TrendingUp, ChevronUp, ChevronDown, Minus as MinusIcon } from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { sortStocks, calculateStockStats, getMaxVolume } from './stock-list-utils'
import type { SortField, SortDirection } from './stock-list-utils'
import type { ThemeStockItem } from '@/lib/tli/types'
import { StockRow } from './stock-list-row'

interface StockListProps {
  stocks: ThemeStockItem[]
}

function StockList({ stocks }: StockListProps) {
  const [activeTab, setActiveTab] = useState<'all' | 'KOSPI' | 'KOSDAQ'>('all')
  const [sortField, setSortField] = useState<SortField>('change')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  const grouped = useMemo(() => ({
    kospi: stocks.filter(s => s.market === 'KOSPI'),
    kosdaq: stocks.filter(s => s.market === 'KOSDAQ'),
  }), [stocks])

  const filteredAndSortedStocks = useMemo(() => {
    const filtered = activeTab === 'KOSPI' ? grouped.kospi : activeTab === 'KOSDAQ' ? grouped.kosdaq : stocks
    return sortStocks(filtered, sortField, sortDirection)
  }, [activeTab, stocks, grouped, sortField, sortDirection])

  const stats = useMemo(() => calculateStockStats(filteredAndSortedStocks), [filteredAndSortedStocks])
  const maxVolume = useMemo(() => getMaxVolume(filteredAndSortedStocks), [filteredAndSortedStocks])

  const handleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection(field === 'change' ? 'desc' : 'asc')
    }
  }, [sortField])

  if (stocks.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="rounded-2xl border border-emerald-500/10 bg-slate-900/40 p-12 flex flex-col items-center justify-center"
      >
        <div className="w-12 h-12 rounded-full bg-slate-800/50 border border-slate-700/30 flex items-center justify-center mb-4">
          <TrendingUp className="w-6 h-6 text-slate-600" />
        </div>
        <p className="text-sm text-slate-500 font-mono text-center">관련 종목 데이터가 아직 없어요</p>
      </motion.div>
    )
  }

  const tabs = [
    { key: 'all' as const, label: '전체', count: stocks.length },
    { key: 'KOSPI' as const, label: 'KOSPI', count: grouped.kospi.length },
    { key: 'KOSDAQ' as const, label: 'KOSDAQ', count: grouped.kosdaq.length },
  ]

  const sortOptions: { field: SortField; label: string }[] = [
    { field: 'name', label: '이름' },
    { field: 'change', label: '등락' },
    { field: 'price', label: '시세' },
    { field: 'volume', label: '거래량' },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3 }}
      className="rounded-2xl border border-emerald-500/20 bg-slate-900/60 overflow-hidden flex flex-col h-full"
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-800/50">
        <h2 className="text-lg font-bold">
          <span className="text-white">관련</span>
          <span className="text-emerald-400 ml-1">종목</span>
        </h2>
        <span className="text-xs font-mono text-emerald-400 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 tabular-nums">
          {stocks.length}
        </span>
      </div>

      {/* 탭 + 정렬 */}
      <div className="px-4 pt-3 pb-2 space-y-2">
        {/* 시장 탭 */}
        <div className="flex gap-1">
          {tabs.map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              aria-label={`${label} 종목 보기`}
              className={cn(
                'text-[11px] font-mono px-2.5 py-1 rounded-md border transition-colors',
                activeTab === key
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : 'bg-slate-800/30 border-slate-700/30 text-slate-500 hover:text-slate-300'
              )}
            >
              {label}
              <span className="ml-1 text-[9px] opacity-60 tabular-nums">{count}</span>
            </button>
          ))}
        </div>

        {/* 정렬 버튼 */}
        <div className="flex gap-1">
          {sortOptions.map(({ field, label }) => (
            <button
              key={field}
              onClick={() => handleSort(field)}
              aria-label={`${label} 기준 정렬${sortField === field ? (sortDirection === 'asc' ? ' (오름차순)' : ' (내림차순)') : ''}`}
              aria-pressed={sortField === field}
              className={cn(
                'text-[10px] font-mono px-2 py-0.5 rounded border transition-colors',
                sortField === field
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : 'border-transparent text-slate-600 hover:text-slate-400'
              )}
            >
              {label}
              {sortField === field && (
                <span className="ml-0.5">{sortDirection === 'asc' ? '↑' : '↓'}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* 통계 바 */}
      <div className="flex items-center gap-3 px-4 py-1.5 text-[10px] font-mono border-y border-slate-800/30 bg-slate-950/30">
        <div className="flex items-center gap-1">
          <ChevronUp className="w-3 h-3 text-emerald-400" />
          <span className="text-emerald-400 tabular-nums">{stats.rising}</span>
        </div>
        <div className="flex items-center gap-1">
          <ChevronDown className="w-3 h-3 text-red-400" />
          <span className="text-red-400 tabular-nums">{stats.falling}</span>
        </div>
        <div className="flex items-center gap-1">
          <MinusIcon className="w-3 h-3 text-slate-600" />
          <span className="text-slate-500 tabular-nums">{stats.flat}</span>
        </div>
        <span className="flex-1" />
        <span className="text-slate-600">avg</span>
        <span className={cn('font-semibold tabular-nums', stats.avgChange > 0 ? 'text-emerald-400' : stats.avgChange < 0 ? 'text-red-400' : 'text-slate-400')}>
          {stats.avgChange > 0 ? '+' : ''}{stats.avgChange.toFixed(2)}%
        </span>
      </div>

      {/* 종목 리스트 */}
      <div className="custom-scroll flex-1 overflow-y-auto overscroll-contain">
        {filteredAndSortedStocks.map((stock, idx) => (
          <StockRow key={stock.symbol} stock={stock} idx={idx} maxVolume={maxVolume} />
        ))}
      </div>

    </motion.div>
  )
}

export default StockList
