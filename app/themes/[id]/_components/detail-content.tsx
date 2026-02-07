'use client'

import { use, useState, useMemo, useCallback } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import Link from 'next/link'
import { ArrowLeft, Zap } from 'lucide-react'
import AnimatedBackground from '@/components/animated-background'
import LifecycleScore from '@/components/tli/lifecycle-score'
import StageBadge from '@/components/tli/stage-badge'
import LifecycleCurve from '@/components/tli/lifecycle-curve'
import ErrorBoundary from '@/components/tli/error-boundary'
import Disclaimer from '@/components/tli/disclaimer'
import StockList from './stock-list'
import ComparisonList from './comparison-list'
import KeywordTags from './keyword-tags'
import ThemePrediction from './theme-prediction'
import ScoreCard from './score-card'
import NewsHeadlines from './news-headlines'
import { DetailLoading, DetailError } from './detail-states'
import { useGetThemeDetail } from '../_services/use-get-theme-detail'

interface DetailContentProps {
  params: Promise<{ id: string }>
}

/** 테마 상세 메인 컴포넌트 */
function DetailContent({ params }: DetailContentProps) {
  const { id } = use(params)
  const shouldReduceMotion = useReducedMotion()
  const { data: theme, isLoading, error } = useGetThemeDetail(id)

  // 비교 테마 선택 상태
  const [selectedComparisons, setSelectedComparisons] = useState<number[]>([])

  // 비교 곡선 토글
  const handleToggleComparison = useCallback((index: number) => {
    setSelectedComparisons(prev =>
      prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
    )
  }, [])

  // 선택된 비교 테마의 lifecycleCurve를 LifecycleCurve.comparisonData 형식으로 변환
  const comparisonData = useMemo(() => {
    if (!theme) return undefined
    const selected = selectedComparisons
      .filter(idx => idx < theme.comparisons.length)
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
  if (error || !theme) return <DetailError message={error?.message || 'Unknown error'} />

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      <AnimatedBackground />

      {/* Scanline */}
      <div className="fixed inset-0 pointer-events-none z-1 opacity-[0.04]">
        <div
          className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(16,185,129,0.04)_50%)] bg-size-[100%_4px] animate-[matrix-scan_8s_linear_infinite]"
          aria-hidden="true"
        />
      </div>

      <main className="relative z-10 py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          {/* [뒤로가기] [테마명] [Stage Badge] [Score Gauge] */}
          <motion.div
            initial={shouldReduceMotion ? false : { opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4 }}
          >
            <Link
              href="/themes"
              className="inline-flex items-center gap-2 text-slate-400 hover:text-emerald-400 transition-colors mb-8 group"
            >
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
              <span className="text-sm font-mono">테마 목록</span>
            </Link>
          </motion.div>

          {/* 헤더 영역 */}
          <motion.div
            initial={shouldReduceMotion ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="rounded-2xl border border-emerald-500/20 bg-slate-900/60 backdrop-blur-xl p-6 mb-8"
          >
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
              <div className="flex-1 min-w-0">
                {/* 타이틀 + 뱃지 */}
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-3xl sm:text-4xl font-black">{theme.name}</h1>
                  <StageBadge stage={theme.score.stage} showIcon size="md" />
                  {theme.score.isReigniting && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-mono">
                      <Zap className="w-3 h-3" />
                      재점화
                    </span>
                  )}
                </div>
                {theme.nameEn && (
                  <p className="text-slate-500 text-lg">{theme.nameEn}</p>
                )}
                {theme.description && (
                  <p className="text-slate-400 mt-2 max-w-2xl">{theme.description}</p>
                )}

                {/* 요약 지표 */}
                <div className="flex items-center gap-4 mt-3 text-sm font-mono">
                  <span className={theme.score.change24h >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                    24H {theme.score.change24h === 0 && theme.lifecycleCurve.length < 2 ? '—' : `${theme.score.change24h >= 0 ? '+' : ''}${theme.score.change24h.toFixed(1)}`}
                  </span>
                  <span className="text-slate-600">|</span>
                  <span className="text-slate-400">
                    종목 <span className="text-white font-medium">{theme.stocks.length}</span>개
                  </span>
                  <span className="text-slate-600">|</span>
                  <span className="text-slate-400">
                    유사 패턴 <span className="text-white font-medium">{theme.comparisons.length}</span>개
                  </span>
                  {(theme.recentNews?.length ?? 0) > 0 && (
                    <>
                      <span className="text-slate-600">|</span>
                      <span className="text-slate-400">
                        뉴스 <span className="text-white font-medium">{theme.recentNews.length}</span>건
                        {(() => {
                          const scores = theme.recentNews
                            .map(a => a.sentimentScore ?? 0)
                            .filter(s => s !== 0)
                          if (scores.length === 0) return null
                          const avg = scores.reduce((s, v) => s + v, 0) / scores.length
                          const label = avg > 0.1 ? '긍정적' : avg < -0.1 ? '부정적' : null
                          if (!label) return null
                          const color = avg > 0.1 ? 'text-emerald-400' : 'text-red-400'
                          return <span className={`${color} ml-1`}>· {label}</span>
                        })()}
                      </span>
                    </>
                  )}
                </div>

                {/* 키워드 (헤더 내부 통합) */}
                {theme.keywords.length > 0 && (
                  <div className="mt-4">
                    <KeywordTags keywords={theme.keywords} />
                  </div>
                )}
              </div>

              <div className="flex-shrink-0">
                <LifecycleScore
                  score={theme.score.value}
                  stage={theme.score.stage}
                  change24h={theme.score.change24h}
                  size="lg"
                />
              </div>
            </div>
          </motion.div>

          {/* [생명주기 예측 카드] - 비교 데이터 있을 때만 표시 */}
          {theme.comparisons.length > 0 && (
            <div className="mb-8">
              <ThemePrediction
                firstSpikeDate={theme.firstSpikeDate}
                comparisons={theme.comparisons}
                currentStage={theme.score.stage}
              />
            </div>
          )}

          {/* [라이프사이클 차트 - 전체 너비] */}
          <motion.div
            initial={shouldReduceMotion ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="rounded-2xl border border-emerald-500/20 bg-slate-900/60 backdrop-blur-xl p-6 mb-8"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">
                <span className="text-white">생명주기</span>
                <span className="text-emerald-400 ml-1">곡선</span>
              </h2>
              {comparisonData && (
                <span className="text-xs font-mono text-sky-400">
                  {comparisonData.length}개 비교 오버레이
                </span>
              )}
            </div>
            {theme.newsTimeline.length === 0 && theme.interestTimeline.length === 0 ? (
              <div className="flex items-center justify-center h-[400px] bg-slate-900/30 rounded-lg border border-slate-800">
                <p className="text-sm text-slate-500 font-mono">데이터 수집 중</p>
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
          </motion.div>

          {/* [관련 뉴스 - 전체 너비] */}
          <motion.div
            initial={shouldReduceMotion ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="rounded-2xl border border-emerald-500/20 bg-slate-900/60 backdrop-blur-xl p-6 mb-8"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">
                <span className="text-white">관련</span>
                <span className="text-emerald-400 ml-1">뉴스</span>
              </h2>
              {(theme.recentNews?.length ?? 0) > 0 && (
                <span className="text-xs font-mono text-emerald-400 px-2 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                  {theme.recentNews.length}건
                </span>
              )}
            </div>
            <NewsHeadlines articles={theme.recentNews ?? []} />
          </motion.div>

          {/* [3 Column Grid] - 점수 구성 / 유사 패턴 / 관련 종목 */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <ScoreCard score={theme.score} />
            <ComparisonList
              comparisons={theme.comparisons}
              selectedIndices={selectedComparisons}
              onToggleComparison={handleToggleComparison}
            />
            <StockList stocks={theme.stocks} />
          </div>

          {/* 면책 조항 */}
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
