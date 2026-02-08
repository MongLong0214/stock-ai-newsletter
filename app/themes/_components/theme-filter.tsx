'use client'

import { useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Search, X } from 'lucide-react'
import { STAGE_CONFIG } from '@/lib/tli/types'
import type { DisplayStage } from '@/lib/tli/types'
import { cn } from '@/lib/utils'

/** 정렬 옵션 타입 */
export type SortOption = 'score' | 'change' | 'name'

interface ThemeFilterProps {
  onSearchChange: (query: string) => void
  onStageFilter: (stages: DisplayStage[]) => void
  onSortChange: (sort: SortOption) => void
  activeStages: DisplayStage[]
  activeSort: SortOption
}

/** 필터 가능한 단계 목록 (재점화 포함) */
const FILTERABLE_STAGES: DisplayStage[] = ['Early', 'Growth', 'Peak', 'Reigniting', 'Decay']

/** 정렬 옵션 */
const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'score', label: '점수' },
  { value: 'change', label: '변화율' },
  { value: 'name', label: '이름' },
]

/** 테마 검색/필터 컴포넌트 */
function ThemeFilter({ onSearchChange, onStageFilter, onSortChange, activeStages, activeSort }: ThemeFilterProps) {
  const [searchValue, setSearchValue] = useState('')

  const handleSearch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setSearchValue(value)
    onSearchChange(value)
  }, [onSearchChange])

  const clearSearch = useCallback(() => {
    setSearchValue('')
    onSearchChange('')
  }, [onSearchChange])

  const toggleStage = useCallback((stage: DisplayStage) => {
    const isActive = activeStages.includes(stage)
    if (isActive) {
      onStageFilter(activeStages.filter(s => s !== stage))
    } else {
      onStageFilter([...activeStages, stage])
    }
  }, [activeStages, onStageFilter])

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.2 }}
      className="mb-8"
    >
      {/* Desktop: Single Row Control Bar */}
      <div className="hidden sm:flex items-center gap-3 p-2 rounded-xl bg-slate-900/40 backdrop-blur-sm border border-slate-800/50">
        {/* Search Input - Compact */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600" />
          <input
            type="text"
            value={searchValue}
            onChange={handleSearch}
            placeholder="테마 검색..."
            className="w-full h-8 pl-9 pr-8 rounded-lg border border-slate-700/30 bg-slate-950/50 text-[13px] text-white placeholder:text-slate-600 font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500/40 focus:border-emerald-500/30 transition-all"
          />
          {searchValue && (
            <button
              onClick={clearSearch}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-md hover:bg-slate-700/50 transition-colors"
            >
              <X className="w-3 h-3 text-slate-500" />
            </button>
          )}
        </div>

        {/* Stage Filter Pills - Minimal */}
        <div className="flex items-center gap-1.5 shrink-0">
          {FILTERABLE_STAGES.map((stage) => {
            const config = STAGE_CONFIG[stage]
            const isActive = activeStages.includes(stage)

            return (
              <button
                key={stage}
                onClick={() => toggleStage(stage)}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-mono font-medium transition-all duration-150',
                  isActive
                    ? 'bg-slate-800 text-white shadow-sm ring-1 ring-slate-700/50'
                    : 'text-slate-600 hover:text-slate-400 hover:bg-slate-800/30'
                )}
              >
                <div
                  className="w-1.5 h-1.5 rounded-full shrink-0 transition-all"
                  style={{
                    backgroundColor: isActive ? config.color : '#475569',
                    boxShadow: isActive ? `0 0 8px ${config.color}70, 0 0 3px ${config.color}` : 'none',
                  }}
                />
                <span className="tracking-tight">{config.label}</span>
              </button>
            )
          })}
        </div>

        {/* Sort Pills - Far Right */}
        <div className="flex items-center gap-1 pl-2 border-l border-slate-700/50">
          {SORT_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => onSortChange(option.value)}
              className={cn(
                'px-2.5 py-1.5 rounded-lg text-[11px] font-mono font-medium transition-all duration-150',
                activeSort === option.value
                  ? 'bg-emerald-500/15 text-emerald-400 shadow-sm ring-1 ring-emerald-500/20'
                  : 'text-slate-600 hover:text-slate-400 hover:bg-slate-800/30'
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Mobile: Stacked Compact Layout */}
      <div className="flex sm:hidden flex-col gap-2">
        {/* Search - Full Width */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
          <input
            type="text"
            value={searchValue}
            onChange={handleSearch}
            placeholder="테마 검색..."
            className="w-full h-9 pl-9 pr-9 rounded-lg border border-slate-700/50 bg-slate-900/60 text-sm text-white placeholder:text-slate-600 font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500/40 focus:border-emerald-500/30 transition-all"
          />
          {searchValue && (
            <button
              onClick={clearSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-md hover:bg-slate-700/50 transition-colors"
            >
              <X className="w-3 h-3 text-slate-500" />
            </button>
          )}
        </div>

        {/* Stage Filter - Equal Width Pills */}
        <div className="flex gap-1 overflow-x-auto scrollbar-hide">
          {FILTERABLE_STAGES.map((stage) => {
            const config = STAGE_CONFIG[stage]
            const isActive = activeStages.includes(stage)

            return (
              <button
                key={stage}
                onClick={() => toggleStage(stage)}
                className={cn(
                  'flex-1 min-w-[60px] flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-[11px] font-mono font-medium transition-all duration-150',
                  isActive
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'bg-slate-900/60 border border-slate-700/50 text-slate-600 hover:text-slate-400'
                )}
              >
                <div
                  className="w-1.5 h-1.5 rounded-full shrink-0 transition-all"
                  style={{
                    backgroundColor: isActive ? config.color : '#334155',
                    boxShadow: isActive ? `0 0 6px ${config.color}60` : 'none',
                  }}
                />
                {config.label}
              </button>
            )
          })}
        </div>

        {/* Sort - Equal Width Pills */}
        <div className="flex gap-1">
          {SORT_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => onSortChange(option.value)}
              className={cn(
                'flex-1 px-3 py-2 rounded-lg text-[11px] font-mono font-medium transition-all duration-150',
                activeSort === option.value
                  ? 'bg-emerald-500/15 text-emerald-400 shadow-sm'
                  : 'bg-slate-900/60 border border-slate-700/50 text-slate-600 hover:text-slate-400'
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </motion.div>
  )
}

export default ThemeFilter
