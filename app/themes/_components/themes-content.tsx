'use client'

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import AnimatedBackground from '@/components/animated-background'
import Disclaimer from '@/components/tli/disclaimer'
import ThemesHeader from './themes-header'
import StatsOverview from './stats-overview'
import ThemeFilter, { type SortOption } from './theme-filter'
import StageNav from './stage-nav'
import TodaySignals from './today-signals'
import StageSection from './stage-section'
import ThemesSkeleton from './themes-skeleton'
import { ThemesError, EmptySearchResult } from './themes-empty-states'
import { useGetRanking } from '../_services/use-get-ranking'
import { STAGE_ORDER } from '../_constants/stage-order'
import type { DisplayStage, ThemeListItem, ThemeRanking } from '@/lib/tli/types'
import { buildThemeItem, trackEvent } from '@/lib/analytics/ga'

interface ThemesContentProps {
  initialData?: ThemeRanking
}

/** 테마 목록 메인 컴포넌트 */
function ThemesContent({ initialData }: ThemesContentProps) {
  const { data: ranking, isLoading, error } = useGetRanking(initialData)

  /** 필터 상태 */
  const [searchQuery, setSearchQuery] = useState('')
  const [activeStages, setActiveStages] = useState<DisplayStage[]>(['Emerging', 'Growth', 'Peak', 'Reigniting', 'Decline'])
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
  const lastListSignatureRef = useRef('')
  const lastSearchSignatureRef = useRef('')

  const visibleThemeItems = useMemo(() => (
    filteredSections
      .flatMap((section) =>
        section.themes.map((theme, index) =>
          buildThemeItem({
            id: theme.id,
            name: theme.name,
            stage: section.stage,
            index: index + 1,
            listId: 'theme_ranking',
            listName: 'Theme ranking',
          })
        )
      )
      .slice(0, 20)
  ), [filteredSections])

  useEffect(() => {
    const signature = visibleThemeItems.map((item) => `${item.item_id}:${item.index}`).join('|')
    if (!signature || signature === lastListSignatureRef.current) return

    trackEvent('view_item_list', {
      item_list_id: 'theme_ranking',
      item_list_name: 'Theme ranking',
      items: visibleThemeItems,
    })

    lastListSignatureRef.current = signature
  }, [visibleThemeItems])

  useEffect(() => {
    const query = searchQuery.trim()
    if (query.length < 2) return

    const resultCount = filteredSections.reduce((count, section) => count + section.themes.length, 0)
    const signature = `${query}:${resultCount}`
    if (signature === lastSearchSignatureRef.current) return

    const timeoutId = window.setTimeout(() => {
      trackEvent('view_search_results', {
        search_term: query,
        result_count: resultCount,
      })
      lastSearchSignatureRef.current = signature
    }, 700)

    return () => window.clearTimeout(timeoutId)
  }, [filteredSections, searchQuery])

  return (
    <div className="min-h-screen bg-black text-white relative">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <AnimatedBackground />
      </div>

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

          {ranking?.summary && (
            <StatsOverview summary={ranking.summary} />
          )}

          {ranking && (
            <TodaySignals ranking={ranking} />
          )}

          <ThemeFilter
            onSearchChange={handleSearchChange}
            onStageFilter={handleStageFilter}
            onSortChange={handleSortChange}
            activeStages={activeStages}
            activeSort={sortOption}
          />

          {hasResults && (
            <StageNav
              sections={filteredSections.map((section) => ({
                key: section.key,
                stage: section.stage,
                title: section.title,
                count: section.themes.length,
              }))}
            />
          )}

          {hasResults ? (
            <div>
              {filteredSections.map((section) => (
                <StageSection
                  key={section.key}
                  sectionKey={section.key}
                  stage={section.stage}
                  title={section.title}
                  subtitle={section.subtitle}
                  themes={section.themes}
                />
              ))}
            </div>
          ) : isSearchActive ? (
            <EmptySearchResult query={searchQuery} />
          ) : (
            <div className="flex flex-col items-center justify-center py-20">
              <p className="text-slate-500 text-sm">선택된 단계가 없습니다. 필터를 조정해 보세요.</p>
            </div>
          )}

          <div className="mt-16">
            <Disclaimer />
          </div>
        </div>
      </main>
    </div>
  )
}

export default ThemesContent
