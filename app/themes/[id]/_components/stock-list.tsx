'use client'

import { useState, useMemo, useCallback } from 'react'
import { TrendingUp } from 'lucide-react'
import {
  sortStocks,
  calculateStockStats,
  DEFAULT_STOCK_SORT_DIRECTION,
  DEFAULT_STOCK_SORT_FIELD,
  getMaxVolume,
  getTopGainer,
  getTopLoser,
  getVolumeLeader,
  type SortField,
  type SortDirection,
  type Stock,
} from './stock-list-utils'
import { StockRow } from './stock-list-row'
import StockListOverview from './stock-list-overview'

interface StockListProps {
  stocks: Stock[]
  liveStatus?: 'idle' | 'loading' | 'success' | 'error'
}

function StockList({ stocks, liveStatus = 'idle' }: StockListProps) {
  const [activeTab, setActiveTab] = useState<'all' | 'KOSPI' | 'KOSDAQ'>('all')
  const [sortField, setSortField] = useState<SortField>(DEFAULT_STOCK_SORT_FIELD)
  const [sortDirection, setSortDirection] = useState<SortDirection>(DEFAULT_STOCK_SORT_DIRECTION)

  const grouped = useMemo(() => ({
    kospi: stocks.filter((stock) => stock.market === 'KOSPI'),
    kosdaq: stocks.filter((stock) => stock.market === 'KOSDAQ'),
  }), [stocks])

  const filteredAndSortedStocks = useMemo(() => {
    const filtered = activeTab === 'KOSPI'
      ? grouped.kospi
      : activeTab === 'KOSDAQ'
        ? grouped.kosdaq
        : stocks

    return sortStocks(filtered, sortField, sortDirection)
  }, [activeTab, grouped, sortDirection, sortField, stocks])

  const stats = useMemo(() => calculateStockStats(filteredAndSortedStocks), [filteredAndSortedStocks])
  const maxVolume = useMemo(() => getMaxVolume(filteredAndSortedStocks), [filteredAndSortedStocks])
  const volumeLeader = useMemo(() => getVolumeLeader(filteredAndSortedStocks), [filteredAndSortedStocks])
  const topGainer = useMemo(() => getTopGainer(filteredAndSortedStocks), [filteredAndSortedStocks])
  const topLoser = useMemo(() => getTopLoser(filteredAndSortedStocks), [filteredAndSortedStocks])
  const marketMix = useMemo(() => {
    const total = filteredAndSortedStocks.length || 1
    return {
      kospiCount: grouped.kospi.length,
      kosdaqCount: grouped.kosdaq.length,
      kospiPct: Math.round((grouped.kospi.length / total) * 100),
      kosdaqPct: Math.round((grouped.kosdaq.length / total) * 100),
    }
  }, [filteredAndSortedStocks.length, grouped.kosdaq.length, grouped.kospi.length])

  const handleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection(field === 'change' ? 'desc' : 'asc')
    }
  }, [sortField])

  if (stocks.length === 0) {
    return (
      <div className="rounded-2xl border border-emerald-500/10 bg-slate-900/40 p-12 flex flex-col items-center justify-center">
        <div className="w-12 h-12 rounded-full bg-slate-800/50 border border-slate-700/30 flex items-center justify-center mb-4">
          <TrendingUp className="w-6 h-6 text-slate-600" />
        </div>
        <p className="text-sm text-slate-500 font-mono text-center">관련 종목 데이터가 아직 없어요</p>
      </div>
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

  const liveCount = stocks.filter((stock) => stock.dataSource === 'kis').length
  const liveCoverage = `${liveCount}/${stocks.length}`
  const latestSnapshotAt = filteredAndSortedStocks.find((stock) => stock.lastUpdatedAt)?.lastUpdatedAt
    ?? stocks.find((stock) => stock.lastUpdatedAt)?.lastUpdatedAt
    ?? null

  return (
    <div className="rounded-[28px] border border-emerald-500/18 bg-[linear-gradient(180deg,rgba(15,23,42,0.94),rgba(2,6,23,0.9))] overflow-hidden flex flex-col shadow-[0_28px_80px_rgba(2,6,23,0.28)]">
      <StockListOverview
        totalCount={stocks.length}
        filteredCount={filteredAndSortedStocks.length}
        liveStatus={liveStatus}
        liveCoverage={liveCoverage}
        stats={stats}
        topGainer={topGainer}
        topLoser={topLoser}
        volumeLeader={volumeLeader}
        latestSnapshotAt={latestSnapshotAt}
        marketMix={marketMix}
        tabs={tabs}
        activeTab={activeTab}
        sortOptions={sortOptions}
        sortField={sortField}
        sortDirection={sortDirection}
        onTabChange={setActiveTab}
        onSortChange={handleSort}
      />

      <div className="hidden lg:block px-5 py-2 border-b border-slate-800/40 bg-slate-950/50">
        <div className="grid grid-cols-[40px_minmax(0,1.5fr)_132px_120px_176px] gap-4 text-[10px] font-mono uppercase tracking-[0.16em] text-slate-500">
          <span className="text-center">#</span>
          <span>종목</span>
          <span className="text-right">현재가</span>
          <span className="text-right">등락률</span>
          <span>거래량</span>
        </div>
      </div>

      <div className="custom-scroll flex-1 overflow-y-auto overscroll-contain">
        {filteredAndSortedStocks.map((stock, idx) => (
          <StockRow key={stock.symbol} stock={stock} idx={idx} maxVolume={maxVolume} />
        ))}
      </div>
    </div>
  )
}

export default StockList
