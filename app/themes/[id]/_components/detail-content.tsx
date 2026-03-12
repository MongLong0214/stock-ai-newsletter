/** 테마 상세 메인 컨텐츠 */
'use client'

import { useState, useMemo, useCallback } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import AnimatedBackground from '@/components/animated-background'
import LifecycleCurve from '@/components/tli/lifecycle-curve'
import ErrorBoundary from '@/components/tli/error-boundary'
import Disclaimer from '@/components/tli/disclaimer'
import { GlassCard } from '@/components/tli/glass-card'
import StockList from './stock-list'
import ComparisonList from './comparison-list'
import ThemePrediction from './theme-prediction'
import ScoreCard from './score-card'
import NewsHeadlines from './news-headlines'
import DetailHeader from './detail-header'
import { DetailLoading } from './detail-loading'
import { DetailError } from './detail-error'
import { shouldRenderPredictionPanel } from './theme-prediction/presentation'
import { useGetThemeDetail } from '../_services/use-get-theme-detail'

interface DetailContentProps {
  id: string
}

function DetailContent({ id }: DetailContentProps) {
  const shouldReduceMotion = useReducedMotion()
  const { data: theme, isLoading, error } = useGetThemeDetail(id)

  const [selectedComparisons, setSelectedComparisons] = useState<number[]>([])

  const handleToggleComparison = useCallback((index: number) => {
    setSelectedComparisons(prev =>
      prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
    )
  }, [])

  const comparisonData = useMemo(() => {
    if (!theme) return undefined
    const selected = selectedComparisons
      .filter(idx => idx >= 0 && idx < theme.comparisons.length)
      .map(idx => {
        const comp = theme.comparisons[idx]
        return {
          themeName: comp.pastTheme,
          data: comp.lifecycleCurve.map((point, dayIdx) => ({
            day: dayIdx,
            value: point.score,
          })),
          similarity: comp.similarity,
        }
      })
    return selected.length > 0 ? selected : undefined
  }, [theme, selectedComparisons])

  if (isLoading) return <DetailLoading />
  if (error || !theme) return <DetailError message={error?.message || '알 수 없는 오류가 발생했어요'} />

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      <AnimatedBackground />

      <div className="fixed inset-0 pointer-events-none z-1 opacity-[0.04]">
        <div
          className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(16,185,129,0.04)_50%)] bg-size-[100%_4px] animate-[matrix-scan_8s_linear_infinite]"
          aria-hidden="true"
        />
      </div>

      <main className="relative z-10 py-8 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-3 pt-12 pb-8 sm:px-6 sm:py-12 lg:px-8 lg:py-16">
          <motion.div
            initial={shouldReduceMotion ? false : { opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4 }}
          >
            <Link
              href="/themes"
              aria-label="테마 목록으로 돌아가기"
              className="inline-flex items-center gap-2 text-slate-400 hover:text-emerald-400 transition-colors mb-8 group"
            >
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
              <span className="text-sm font-mono">테마 목록</span>
            </Link>
          </motion.div>

          <DetailHeader theme={theme} />

          {shouldRenderPredictionPanel(theme.firstSpikeDate, theme.comparisons.length) && (
            <div className="mb-8">
              <ThemePrediction firstSpikeDate={theme.firstSpikeDate} comparisons={theme.comparisons} score={theme.score.value} stage={theme.score.stage} />
            </div>
          )}

          {/* 라이프사이클 차트 */}
          <motion.div
            initial={shouldReduceMotion ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            <GlassCard className="p-4 sm:p-6 mb-6 sm:mb-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold">
                  <span className="text-white">점수</span>
                  <span className="text-emerald-400 ml-1">추이</span>
                </h2>
                {comparisonData && (
                  <span className="text-xs font-mono text-sky-400">{comparisonData.length}개 비교 중</span>
                )}
              </div>
              {theme.lifecycleCurve.length === 0 ? (
                <div className="flex items-center justify-center h-[400px] bg-slate-900/30 rounded-lg border border-slate-800">
                  <p className="text-sm text-slate-500 font-mono">데이터를 준비하고 있어요</p>
                </div>
              ) : (
                <ErrorBoundary>
                  <LifecycleCurve
                    currentData={theme.lifecycleCurve}
                    comparisonData={comparisonData}
                    newsTimeline={theme.newsTimeline}
                    interestTimeline={theme.interestTimeline}
                    height={400}
                  />
                </ErrorBoundary>
              )}
            </GlassCard>
          </motion.div>

          {/* 관련 뉴스 */}
          <motion.div
            initial={shouldReduceMotion ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15 }}
          >
            <GlassCard className="p-4 sm:p-6 mb-6 sm:mb-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold">
                  <span className="text-white">관련</span>
                  <span className="text-emerald-400 ml-1">뉴스</span>
                </h2>
                {theme.newsCount > 0 && (
                  <span className="text-xs font-mono text-emerald-400 px-2 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                    {theme.newsCount}건
                  </span>
                )}
              </div>
              <div className="max-h-[500px] overflow-y-auto custom-scroll">
                <NewsHeadlines articles={theme.recentNews ?? []} />
              </div>
            </GlassCard>
          </motion.div>

          {/* 3열 그리드 */}
          <div className="grid grid-cols-1 lg:grid-cols-3 lg:grid-rows-[600px] gap-4 sm:gap-6">
            <ScoreCard score={theme.score} />
            <ComparisonList
              comparisons={theme.comparisons}
              selectedIndices={selectedComparisons}
              onToggleComparison={handleToggleComparison}
              isPrePeak={theme.score.stage === 'Emerging' || theme.score.stage === 'Growth'}
            />
            <StockList stocks={theme.stocks} />
          </div>

          <motion.div
            initial={shouldReduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.6 }}
            className="mt-16"
          >
            <Disclaimer />
          </motion.div>
        </div>
      </main>
    </div>
  )
}

export default DetailContent
