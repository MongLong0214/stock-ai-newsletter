'use client'

import { useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Search, ArrowUpDown, X } from 'lucide-react'
import { STAGE_CONFIG, type Stage } from '@/lib/tli/types'
import { cn } from '@/lib/utils'

/** 정렬 옵션 타입 */
export type SortOption = 'score' | 'change' | 'name'

interface ThemeFilterProps {
  onSearchChange: (query: string) => void
  onStageFilter: (stages: Stage[]) => void
  onSortChange: (sort: SortOption) => void
  activeStages: Stage[]
  activeSort: SortOption
}

/** 필터 가능한 단계 목록 */
const FILTERABLE_STAGES: Stage[] = ['Early', 'Growth', 'Peak', 'Decay']

/** 정렬 옵션 */
const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'score', label: '점수순' },
  { value: 'change', label: '변화율순' },
  { value: 'name', label: '이름순' },
]

/** 테마 검색/필터 컴포넌트 */
function ThemeFilter({ onSearchChange, onStageFilter, onSortChange, activeStages, activeSort }: ThemeFilterProps) {
  const [searchValue, setSearchValue] = useState('')

  /** 검색어 변경 핸들러 */
  const handleSearch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setSearchValue(value)
    onSearchChange(value)
  }, [onSearchChange])

  /** 검색어 초기화 */
  const clearSearch = useCallback(() => {
    setSearchValue('')
    onSearchChange('')
  }, [onSearchChange])

  /** 단계 토글 핸들러 */
  const toggleStage = useCallback((stage: Stage) => {
    const isActive = activeStages.includes(stage)
    if (isActive) {
      onStageFilter(activeStages.filter(s => s !== stage))
    } else {
      onStageFilter([...activeStages, stage])
    }
  }, [activeStages, onStageFilter])

  /** 정렬 변경 핸들러 */
  const handleSort = useCallback((sort: SortOption) => {
    onSortChange(sort)
  }, [onSortChange])

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.2 }}
      className="mb-8"
    >
      <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-4 shadow-[0_4px_30px_rgba(0,0,0,0.3)]">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
          {/* 검색 입력 */}
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={searchValue}
              onChange={handleSearch}
              placeholder="테마명, 키워드 검색..."
              className="w-full h-10 pl-10 pr-10 rounded-xl border border-white/10 bg-white/5 text-sm text-white placeholder:text-slate-500 font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/30 transition-all"
            />
            {searchValue && (
              <button
                onClick={clearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors"
              >
                <X className="w-3 h-3 text-slate-400" />
              </button>
            )}
          </div>

          {/* 구분선 */}
          <div className="hidden sm:block h-8 w-px bg-white/10" />

          {/* 단계 필터 토글 */}
          <div className="flex items-center gap-2 flex-wrap">
            {FILTERABLE_STAGES.map((stage) => {
              const config = STAGE_CONFIG[stage]
              const isActive = activeStages.includes(stage)

              return (
                <button
                  key={stage}
                  onClick={() => toggleStage(stage)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all duration-200',
                    isActive
                      ? cn(config.bg, config.border, config.text)
                      : 'bg-white/5 border-white/10 text-slate-500 hover:bg-white/10 hover:text-slate-300'
                  )}
                  style={isActive ? { boxShadow: `0 0 10px ${config.color}20` } : undefined}
                >
                  <div
                    className="w-1.5 h-1.5 rounded-full transition-colors"
                    style={{ backgroundColor: isActive ? config.color : '#64748B' }}
                  />
                  {config.label}
                </button>
              )
            })}
          </div>

          {/* 구분선 */}
          <div className="hidden sm:block h-8 w-px bg-white/10" />

          {/* 정렬 옵션 */}
          <div className="flex items-center gap-1.5">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-500 mr-1" />
            {SORT_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => handleSort(option.value)}
                className={cn(
                  'px-2.5 py-1 rounded-lg text-xs font-medium transition-all duration-200',
                  activeSort === option.value
                    ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-400'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export default ThemeFilter
