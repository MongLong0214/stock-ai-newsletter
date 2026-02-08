'use client'

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import AnimatedBackground from '@/components/animated-background'
import Disclaimer from '@/components/tli/disclaimer'
import ThemesHeader from './themes-header'
import StatsOverview from './stats-overview'
import ThemeFilter, { type SortOption } from './theme-filter'
import StageSection from './stage-section'
import ThemesSkeleton from './themes-skeleton'
import { ThemesError, EmptySearchResult } from './themes-empty-states'
import { useGetRanking } from '../_services/use-get-ranking'
import { STAGE_ORDER } from '../_constants/stage-order'
import type { DisplayStage, ThemeListItem } from '@/lib/tli/types'

/** 테마 목록 메인 컴포넌트 */
function ThemesContent() {
  const { data: ranking, isLoading, error } = useGetRanking()

  /** 필터 상태 */
  const [searchQuery, setSearchQuery] = useState('')
  const [activeStages, setActiveStages] = useState<DisplayStage[]>(['Early', 'Growth', 'Peak', 'Reigniting', 'Decay'])
  const [sortOption, setSortOption] = useState<SortOption>('score')

  /** 검색어 변경 핸들러 */
  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query)
  }, [])

  /** 단계 필터 변경 핸들러 */
  const handleStageFilter = useCallback((stages: DisplayStage[]) => {
    setActiveStages(stages)
  }, [])

  /** 정렬 변경 핸들러 */
  const handleSortChange = useCallback((sort: SortOption) => {
    setSortOption(sort)
  }, [])

  /** 테마 필터링 함수 */
  const filterThemes = useCallback((themes: ThemeListItem[]): ThemeListItem[] => {
    let filtered = themes

    // 검색어 필터
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      filtered = filtered.filter(
        (t) =>
          t.name.toLowerCase().includes(query) ||
          (t.nameEn && t.nameEn.toLowerCase().includes(query))
      )
    }

    // 정렬
    filtered = [...filtered].sort((a, b) => {
      switch (sortOption) {
        case 'score':
          return b.score - a.score
        case 'change':
          return b.change7d - a.change7d
        case 'name':
          return a.name.localeCompare(b.name, 'ko')
        default:
          return 0
      }
    })

    return filtered
  }, [searchQuery, sortOption])

  if (isLoading) return <ThemesSkeleton />
  if (error) return <ThemesError message={error.message} />

  /** 전체 필터 적용된 섹션 계산 */
  const filteredSections = STAGE_ORDER.map(({ key, stage, title, subtitle }) => {
    const themes = ranking?.[key]
    if (!themes || themes.length === 0) return null

    // 단계 필터: reigniting은 독립 필터로 처리
    const stageMatch = key === 'reigniting'
      ? activeStages.includes('Reigniting')
      : activeStages.includes(stage)
    if (!stageMatch) return null

    const filtered = filterThemes(themes)
    if (filtered.length === 0) return null

    return { key, stage, title, subtitle, themes: filtered }
  }).filter((section): section is NonNullable<typeof section> => Boolean(section))

  /** 검색 중인데 결과가 없는 경우 */
  const isSearchActive = searchQuery.trim().length > 0
  const hasResults = filteredSections.length > 0

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      <AnimatedBackground />

      {/* Scanline effect */}
      <div className="fixed inset-0 pointer-events-none z-1 opacity-[0.04]">
        <div
          className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(16,185,129,0.04)_50%)] bg-size-[100%_4px] animate-[matrix-scan_8s_linear_infinite]"
          aria-hidden="true"
        />
      </div>

      <main className="relative z-10 py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <ThemesHeader summary={ranking?.summary ?? null} />

          {/* 통계 요약 바 */}
          {ranking?.summary && (
            <StatsOverview summary={ranking.summary} />
          )}

          {/* 검색/필터 */}
          <ThemeFilter
            onSearchChange={handleSearchChange}
            onStageFilter={handleStageFilter}
            onSortChange={handleSortChange}
            activeStages={activeStages}
            activeSort={sortOption}
          />

          {/* 단계별 섹션 */}
          <AnimatePresence mode="wait">
            {hasResults ? (
              <motion.div
                key="results"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
              >
                {filteredSections.map((section, sectionIdx) => {
                  return (
                    <StageSection
                      key={section.key}
                      stage={section.stage}
                      title={section.title}
                      subtitle={section.subtitle}
                      themes={section.themes}
                      index={sectionIdx}
                    />
                  )
                })}
              </motion.div>
            ) : isSearchActive ? (
              <EmptySearchResult key="empty" query={searchQuery} />
            ) : (
              <motion.div
                key="no-filter"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-20"
              >
                <p className="text-slate-500 text-sm">선택된 단계가 없습니다. 필터를 조정해 보세요.</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 면책 조항 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="mt-16"
          >
            <Disclaimer />
          </motion.div>
        </div>
      </main>
    </div>
  )
}

export default ThemesContent
