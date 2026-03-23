/** 테마 상세 메인 컨텐츠 */
'use client'

import { useState, useCallback, useMemo } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import AnimatedBackground from '@/components/animated-background'
import Disclaimer from '@/components/tli/disclaimer'
import { GlassCard } from '@/components/tli/glass-card'
import ComparisonWorkspace from './comparison-workspace'
import StockList from './stock-list'
import ThemePrediction from './theme-prediction'
import NewsHeadlines from './news-headlines'
import DetailHeader from './detail-header'
import { DetailLoading } from './detail-loading'
import { DetailError } from './detail-error'
import { shouldRenderPredictionPanel } from './theme-prediction/presentation'
import { useGetThemeDetail } from '../_services/use-get-theme-detail'
import { useKisStockSnapshots } from './stock-list-kis'
import type { Stock } from './stock-list-utils'

interface DetailContentProps {
  id: string
}

function DetailContent({ id }: DetailContentProps) {
  const shouldReduceMotion = useReducedMotion()
  const { data: theme, isLoading, error } = useGetThemeDetail(id)
  const [selectedComparisonIds, setSelectedComparisonIds] = useState<string[]>([])
  const { liveSnapshots, liveStatus } = useKisStockSnapshots(theme?.stocks ?? [])

  const handleToggleComparison = useCallback((comparisonId: string) => {
    setSelectedComparisonIds((prev) =>
      prev.includes(comparisonId)
        ? prev.filter((id) => id !== comparisonId)
        : [...prev, comparisonId],
    )
  }, [])

  const handleRemoveComparison = useCallback((comparisonId: string) => {
    setSelectedComparisonIds((prev) => prev.filter((id) => id !== comparisonId))
  }, [])

  const handleClearComparisons = useCallback(() => {
    setSelectedComparisonIds([])
  }, [])

  const liveStocks = useMemo<Stock[]>(() => (
    (theme?.stocks ?? []).map((stock) => {
      const snapshot = liveSnapshots.get(stock.symbol)

      if (!snapshot) {
        return {
          ...stock,
          previousClose: null,
          priceDelta: null,
          lastUpdatedAt: null,
          dataSource: 'stored',
        }
      }

      return {
        ...stock,
        currentPrice: snapshot.currentPrice,
        priceChangePct: snapshot.changeRate,
        volume: snapshot.volume,
        previousClose: snapshot.previousClose,
        priceDelta: snapshot.currentPrice - snapshot.previousClose,
        openPrice: snapshot.openPrice ?? null,
        highPrice: snapshot.highPrice ?? null,
        lowPrice: snapshot.lowPrice ?? null,
        week52High: snapshot.week52High ?? null,
        week52Low: snapshot.week52Low ?? null,
        tradingValue: snapshot.tradingValue ?? null,
        marketCap: snapshot.marketCap ?? null,
        per: snapshot.per ?? null,
        pbr: snapshot.pbr ?? null,
        eps: snapshot.eps ?? null,
        bps: snapshot.bps ?? null,
        sharesOutstanding: snapshot.sharesOutstanding ?? null,
        lastUpdatedAt: snapshot.timestamp,
        dataSource: 'kis',
      }
    })
  ), [liveSnapshots, theme?.stocks])

  const themeWithLiveStocks = useMemo(() => (
    theme
      ? {
          ...theme,
          stocks: liveStocks,
        }
      : null
  ), [liveStocks, theme])

  if (isLoading) return <DetailLoading />
  if (error || !theme || !themeWithLiveStocks) return <DetailError message={error?.message || '알 수 없는 오류가 발생했어요'} />

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

          <DetailHeader theme={themeWithLiveStocks} />

          {shouldRenderPredictionPanel(theme.firstSpikeDate, theme.comparisons.length) && (
            <div className="mb-8">
              <ThemePrediction
                firstSpikeDate={theme.firstSpikeDate}
                comparisons={theme.comparisons}
                score={theme.score.value}
                stage={theme.score.stage}
              />
            </div>
          )}

          <div className="mb-6 sm:mb-8">
            <StockList stocks={liveStocks} liveStatus={liveStatus} />
          </div>

          <ComparisonWorkspace
            themeName={theme.name}
            currentData={theme.lifecycleCurve}
            comparisons={theme.comparisons}
            selectedComparisonIds={selectedComparisonIds}
            onToggleComparison={handleToggleComparison}
            onClearComparisons={handleClearComparisons}
            onRemoveComparison={handleRemoveComparison}
            newsTimeline={theme.newsTimeline}
            interestTimeline={theme.interestTimeline}
            isPrePeak={theme.score.stage === 'Emerging' || theme.score.stage === 'Growth'}
            shouldReduceMotion={shouldReduceMotion ?? false}
          />

          <motion.div
            initial={shouldReduceMotion ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.16 }}
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

          <motion.div
            initial={shouldReduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.55 }}
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
