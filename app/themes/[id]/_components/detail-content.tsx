/** 테마 상세 메인 컨텐츠 */
'use client'

import { useState, useMemo, useCallback } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import Link from 'next/link'
import { ArrowLeft, MessageCircle } from 'lucide-react'
import AnimatedBackground from '@/components/animated-background'
import LifecycleCurve from '@/components/tli/lifecycle-curve'
import { LifecycleCurveHeader } from '@/components/tli/lifecycle-curve-header'
import { LifecycleCurveTimeRange, type TimeRange } from '@/components/tli/lifecycle-curve-time-range'
import { LifecycleCurveControls } from '@/components/tli/lifecycle-curve-controls'
import type { LayerKey } from '@/components/tli/lifecycle-curve-data'
import ErrorBoundary from '@/components/tli/error-boundary'
import Disclaimer from '@/components/tli/disclaimer'
import { GlassCard } from '@/components/tli/glass-card'
import StockList from './stock-list'
import ComparisonList from './comparison-list'
import ThemePrediction from './theme-prediction'
import ScoreCard from './score-card'
import NewsHeadlines from './news-headlines'
import { CommunityBuzz } from './community-buzz'
import DetailHeader from './detail-header'
import { DetailLoading } from './detail-loading'
import { DetailError } from './detail-error'
import { useGetThemeDetail } from '../_services/use-get-theme-detail'
import { useSlicedTimelines } from '../_hooks/use-sliced-timelines'

const DEFAULT_LAYERS: Set<LayerKey> = new Set(['news', 'interest', 'comparison', 'zones', 'community'])

function DetailContent({ id }: { id: string }) {
  const shouldReduceMotion = useReducedMotion()
  const { data: theme, isLoading, error } = useGetThemeDetail(id)

  const [selectedComparisons, setSelectedComparisons] = useState<number[]>([])
  const [timeRange, setTimeRange] = useState<TimeRange>('30d')
  const [visibleLayers, setVisibleLayers] = useState<Set<LayerKey>>(DEFAULT_LAYERS)
  const [hoveredLayer, setHoveredLayer] = useState<LayerKey | null>(null)

  const handleToggleComparison = useCallback((index: number) => {
    setSelectedComparisons(prev =>
      prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
    )
  }, [])

  const handleToggleLayer = useCallback((layer: LayerKey) => {
    setVisibleLayers(prev => {
      const next = new Set(prev)
      if (next.has(layer)) next.delete(layer)
      else next.add(layer)
      return next
    })
  }, [])

  const comparisonData = useMemo(() => {
    if (!theme) return undefined
    const selected = selectedComparisons
      .filter(idx => idx >= 0 && idx < theme.comparisons.length)
      .map(idx => ({
        themeName: theme.comparisons[idx].pastTheme,
        data: theme.comparisons[idx].lifecycleCurve.map((point, dayIdx) => ({ day: dayIdx, value: point.score })),
        similarity: theme.comparisons[idx].similarity,
      }))
    return selected.length > 0 ? selected : undefined
  }, [theme, selectedComparisons])

  const { slicedCurve, slicedNews, slicedInterest, slicedCommunity, rangeDelta } = useSlicedTimelines(theme, timeRange)

  if (isLoading) return <DetailLoading />
  if (error || !theme) return <DetailError message={error?.message || 'Unknown error'} />

  const hasCommunity = !!theme.communityTimeline?.length

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      <AnimatedBackground />
      <div className="fixed inset-0 pointer-events-none z-1 opacity-[0.04]">
        <div className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(16,185,129,0.04)_50%)] bg-size-[100%_4px] animate-[matrix-scan_8s_linear_infinite]" aria-hidden="true" />
      </div>

      <main className="relative z-10 py-8 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-3 pt-12 pb-8 sm:px-6 sm:py-12 lg:px-8 lg:py-16">
          <motion.div initial={shouldReduceMotion ? false : { opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }}>
            <Link href="/themes" aria-label="테마 목록으로 돌아가기"
              className="inline-flex items-center gap-2 text-slate-400 hover:text-emerald-400 transition-colors mb-8 group">
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
              <span className="text-sm font-mono">테마 목록</span>
            </Link>
          </motion.div>

          <DetailHeader theme={theme} />

          {theme.comparisons.length > 0 && (
            <div className="mb-8">
              <ThemePrediction firstSpikeDate={theme.firstSpikeDate} comparisons={theme.comparisons} score={theme.score.value} stage={theme.score.stage} />
            </div>
          )}

          {/* 라이프사이클 차트 */}
          <motion.div initial={shouldReduceMotion ? false : { opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }}>
            <GlassCard className="p-4 sm:p-6 mb-6 sm:mb-8">
              <LifecycleCurveHeader score={theme.score.value} stage={theme.score.stage}
                change24h={theme.score.change24h} change7d={theme.score.change7d}
                confidence={theme.score.confidence} comparisonCount={comparisonData?.length ?? 0} rangeDelta={rangeDelta} />
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <LifecycleCurveControls visibleLayers={visibleLayers} onToggleLayer={handleToggleLayer}
                  hoveredLayer={hoveredLayer} onHoverLayer={setHoveredLayer}
                  hasCommunity={hasCommunity} hasComparison={theme.comparisons.length > 0} />
                <LifecycleCurveTimeRange value={timeRange} onChange={setTimeRange} />
              </div>
              {slicedCurve.length === 0 ? (
                <div className="flex items-center justify-center h-[400px] bg-slate-900/30 rounded-lg border border-slate-800">
                  <p className="text-sm text-slate-500 font-mono">데이터를 준비하고 있어요</p>
                </div>
              ) : (
                <ErrorBoundary>
                  <LifecycleCurve currentData={slicedCurve} comparisonData={comparisonData}
                    newsTimeline={slicedNews} interestTimeline={slicedInterest}
                    communityTimeline={slicedCommunity} height={400}
                    visibleLayers={visibleLayers} hoveredLayer={hoveredLayer}
                    reduceMotion={shouldReduceMotion ?? false} />
                </ErrorBoundary>
              )}
            </GlassCard>
          </motion.div>

          {/* 관련 뉴스 */}
          <motion.div initial={shouldReduceMotion ? false : { opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.15 }}>
            <GlassCard className="p-4 sm:p-6 mb-6 sm:mb-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold">
                  <span className="text-white">관련</span><span className="text-emerald-400 ml-1">뉴스</span>
                </h2>
                {theme.newsCount > 0 && (
                  <span className="text-xs font-mono text-emerald-400 px-2 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">{theme.newsCount}건</span>
                )}
              </div>
              <div className="max-h-[500px] overflow-y-auto custom-scroll">
                <NewsHeadlines articles={theme.recentNews ?? []} />
              </div>
            </GlassCard>
          </motion.div>

          {/* 커뮤니티 버즈 */}
          {hasCommunity && (
            <motion.div initial={shouldReduceMotion ? false : { opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.2 }}>
              <GlassCard className="p-4 sm:p-6 mb-6 sm:mb-8">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <MessageCircle className="w-5 h-5 text-pink-500" />
                    <span className="text-white">커뮤니티</span><span className="text-pink-400">버즈</span>
                  </h2>
                </div>
                <CommunityBuzz timeline={theme.communityTimeline!} />
              </GlassCard>
            </motion.div>
          )}

          {/* 3열 그리드 */}
          <div className="grid grid-cols-1 lg:grid-cols-3 lg:grid-rows-[600px] gap-4 sm:gap-6">
            <ScoreCard score={theme.score} />
            <ComparisonList comparisons={theme.comparisons} selectedIndices={selectedComparisons}
              onToggleComparison={handleToggleComparison}
              isPrePeak={theme.score.stage === 'Emerging' || theme.score.stage === 'Growth'} />
            <StockList stocks={theme.stocks} />
          </div>

          <motion.div initial={shouldReduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.6 }} className="mt-16">
            <Disclaimer />
          </motion.div>
        </div>
      </main>
    </div>
  )
}

export default DetailContent
