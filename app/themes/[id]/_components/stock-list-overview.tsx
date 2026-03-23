'use client'

import type { ReactNode } from 'react'
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatVolume } from '@/lib/tli/format-utils'
import { formatSnapshotTime } from './stock-list-kis'
import { formatChange, type SortDirection, type SortField, type Stock } from './stock-list-utils'

interface StockListOverviewProps {
  totalCount: number
  filteredCount: number
  liveStatus: 'idle' | 'loading' | 'success' | 'error'
  liveCoverage: string
  stats: { rising: number; falling: number; flat: number; avgChange: number }
  topGainer: Stock | null
  topLoser: Stock | null
  volumeLeader: Stock | null
  latestSnapshotAt: number | null
  marketMix: { kospiCount: number; kosdaqCount: number; kospiPct: number; kosdaqPct: number }
  tabs: Array<{ key: 'all' | 'KOSPI' | 'KOSDAQ'; label: string; count: number }>
  activeTab: 'all' | 'KOSPI' | 'KOSDAQ'
  sortOptions: Array<{ field: SortField; label: string }>
  sortField: SortField
  sortDirection: SortDirection
  onTabChange: (tab: 'all' | 'KOSPI' | 'KOSDAQ') => void
  onSortChange: (field: SortField) => void
}

export default function StockListOverview({
  totalCount,
  filteredCount,
  liveStatus,
  liveCoverage,
  stats,
  topGainer,
  topLoser,
  volumeLeader,
  latestSnapshotAt,
  marketMix,
  tabs,
  activeTab,
  sortOptions,
  sortField,
  sortDirection,
  onTabChange,
  onSortChange,
}: StockListOverviewProps) {
  return (
    <>
      {/* ── Header ── */}
      <div className="px-5 py-3.5 border-b border-slate-800/60">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-base font-bold text-white">
            관련<span className="text-emerald-400 ml-1">종목</span>
          </h2>
          <div className="flex items-center gap-2 text-[11px] font-mono tabular-nums">
            <span className="text-emerald-400 px-2 py-0.5 rounded-full bg-emerald-500/8 border border-emerald-500/15">
              전체 {totalCount}
            </span>
            <span className="text-slate-300 px-2 py-0.5 rounded-full bg-slate-900/60 border border-slate-700/50">
              필터 {filteredCount}
            </span>
            <span className={cn(
              'px-2 py-0.5 rounded-full border',
              liveStatus === 'success'
                ? 'text-sky-300 bg-sky-500/8 border-sky-500/15'
                : liveStatus === 'loading'
                  ? 'text-amber-300 bg-amber-500/8 border-amber-500/15'
                  : 'text-slate-400 bg-slate-900/60 border-slate-700/50',
            )}>
              KIS {liveCoverage}
              {latestSnapshotAt ? ` · ${formatSnapshotTime(latestSnapshotAt)}` : ''}
            </span>
          </div>
        </div>
      </div>

      {/* ── Stats + Market + Controls ── */}
      <div className="px-5 py-4 border-b border-slate-800/40 space-y-4">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCell
            icon={<Activity className="w-3.5 h-3.5" />}
            label="시장 평균"
            value={`${stats.avgChange > 0 ? '+' : ''}${stats.avgChange.toFixed(2)}%`}
            detail={`▲${stats.rising}  ▼${stats.falling}  —${stats.flat}`}
            accent={stats.avgChange > 0 ? 'emerald' : stats.avgChange < 0 ? 'red' : 'slate'}
          />
          <StatCell
            icon={<ArrowUpRight className="w-3.5 h-3.5" />}
            label="최대 상승"
            value={topGainer?.name ?? '—'}
            detail={topGainer?.priceChangePct != null ? formatChange(topGainer.priceChangePct) : '데이터 없음'}
            accent="emerald"
          />
          <StatCell
            icon={<ArrowDownRight className="w-3.5 h-3.5" />}
            label="최대 하락"
            value={topLoser?.name ?? '—'}
            detail={topLoser?.priceChangePct != null ? formatChange(topLoser.priceChangePct) : '데이터 없음'}
            accent="red"
          />
          <StatCell
            icon={<BarChart3 className="w-3.5 h-3.5" />}
            label="거래 주도"
            value={volumeLeader?.name ?? '—'}
            detail={volumeLeader?.volume != null ? formatVolume(volumeLeader.volume) : '거래량 데이터 없음'}
            accent="sky"
          />
        </div>

        {/* Market Distribution */}
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-mono text-sky-400 tabular-nums shrink-0">
            KOSPI {marketMix.kospiCount}
          </span>
          <div className="flex-1 h-1.5 rounded-full bg-slate-800/70 overflow-hidden flex">
            <span
              className="h-full bg-sky-500/50 transition-all duration-300"
              style={{ width: `${marketMix.kospiPct}%` }}
            />
            <span
              className="h-full bg-violet-500/50 transition-all duration-300"
              style={{ width: `${marketMix.kosdaqPct}%` }}
            />
          </div>
          <span className="text-[11px] font-mono text-violet-400 tabular-nums shrink-0">
            KOSDAQ {marketMix.kosdaqCount}
          </span>
        </div>

        {/* Filter Tabs + Sort Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1.5 flex-wrap">
            {tabs.map(({ key, label, count }) => (
              <button
                key={key}
                onClick={() => onTabChange(key)}
                aria-label={`${label} 종목 보기`}
                className={cn(
                  'text-[11px] font-mono px-3 py-1.5 rounded-full border transition-colors',
                  activeTab === key
                    ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
                    : 'bg-slate-900/50 border-slate-700/50 text-slate-500 hover:text-slate-300',
                )}
              >
                {label}
                <span className="ml-1 text-[10px] opacity-60 tabular-nums">{count}</span>
              </button>
            ))}
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {sortOptions.map(({ field, label }) => (
              <button
                key={field}
                onClick={() => onSortChange(field)}
                aria-label={`${label} 기준 정렬${sortField === field ? (sortDirection === 'asc' ? ' (오름차순)' : ' (내림차순)') : ''}`}
                aria-pressed={sortField === field}
                className={cn(
                  'text-[11px] font-mono px-3 py-1.5 rounded-full border transition-colors',
                  sortField === field
                    ? 'bg-slate-100 text-slate-900 border-slate-200'
                    : 'bg-slate-900/50 border-slate-700/50 text-slate-500 hover:text-slate-300',
                )}
              >
                {label}
                {sortField === field && (
                  <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

type StatAccent = 'emerald' | 'red' | 'slate' | 'sky'

function StatCell({
  icon,
  label,
  value,
  detail,
  accent,
}: {
  icon: ReactNode
  label: string
  value: string
  detail: string
  accent: StatAccent
}) {
  const iconTone = accent === 'emerald'
    ? 'text-emerald-400 bg-emerald-500/10'
    : accent === 'red'
      ? 'text-red-400 bg-red-500/10'
      : accent === 'sky'
        ? 'text-sky-400 bg-sky-500/10'
        : 'text-slate-400 bg-slate-800/50'

  const valueTone = accent === 'emerald'
    ? 'text-emerald-300'
    : accent === 'red'
      ? 'text-red-300'
      : accent === 'sky'
        ? 'text-sky-300'
        : 'text-slate-200'

  return (
    <div className="rounded-xl border border-slate-800/50 bg-slate-950/40 p-3 h-[88px] flex flex-col justify-between">
      <div className="flex items-center gap-2">
        <span className={cn('p-1 rounded-md', iconTone)}>{icon}</span>
        <span className="text-[11px] font-mono text-slate-500 uppercase tracking-wider">{label}</span>
      </div>
      <div className={cn('text-[15px] font-semibold truncate', valueTone)}>{value}</div>
      <div className="text-[11px] font-mono text-slate-500 truncate">{detail}</div>
    </div>
  )
}