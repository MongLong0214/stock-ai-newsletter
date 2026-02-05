'use client'

import { useState, useEffect, Suspense, use } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import AnimatedBackground from '@/components/animated-background'
import { LifecycleScore, StageBadge, LifecycleCurve, ScoreBreakdown, Disclaimer } from '@/components/tli'
import { type ThemeDetail } from '@/lib/tli/types'

function DetailLoading() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="animate-pulse text-emerald-500 font-mono">Loading Theme...</div>
    </div>
  )
}

function ThemeDetailContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [theme, setTheme] = useState<ThemeDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchTheme() {
      try {
        const res = await fetch(`/api/tli/themes/${id}`)
        if (!res.ok) throw new Error('Theme not found')
        const data = await res.json()
        if (data.success) {
          setTheme(data.data)
        } else {
          throw new Error(data.error?.message || 'Unknown error')
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load')
      } finally {
        setLoading(false)
      }
    }
    fetchTheme()
  }, [id])

  if (loading) return <DetailLoading />

  if (error || !theme) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 font-mono mb-2">테마를 찾을 수 없습니다</p>
          <p className="text-slate-500 text-sm mb-4">{error}</p>
          <Link href="/themes" className="text-emerald-400 hover:text-emerald-300 text-sm font-mono">
            ← 목록으로 돌아가기
          </Link>
        </div>
      </div>
    )
  }

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
          {/* Back button */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
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

          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6 mb-12"
          >
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl sm:text-4xl font-black">{theme.name}</h1>
                <StageBadge stage={theme.score.stage} showIcon size="md" />
              </div>
              {theme.nameEn && (
                <p className="text-slate-500 text-lg">{theme.nameEn}</p>
              )}
              {theme.description && (
                <p className="text-slate-400 mt-2 max-w-2xl">{theme.description}</p>
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
          </motion.div>

          {/* Main content grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left column - Chart + Breakdown */}
            <div className="lg:col-span-2 space-y-6">
              {/* Lifecycle Curve */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.1 }}
                className="rounded-2xl border border-emerald-500/20 bg-slate-900/60 backdrop-blur-xl p-6"
              >
                <h2 className="text-lg font-bold mb-4">
                  <span className="text-white">생명주기</span>
                  <span className="text-emerald-400 ml-1">곡선</span>
                </h2>
                <LifecycleCurve
                  currentData={theme.lifecycleCurve}
                  comparisonData={theme.comparisons.length > 0 ? theme.comparisons.map(c => ({
                    themeName: c.pastTheme,
                    data: [],
                    similarity: c.similarity,
                  })) : undefined}
                  height={350}
                />
              </motion.div>

              {/* Score Breakdown */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="rounded-2xl border border-emerald-500/20 bg-slate-900/60 backdrop-blur-xl p-6"
              >
                <h2 className="text-lg font-bold mb-4">
                  <span className="text-white">점수</span>
                  <span className="text-emerald-400 ml-1">구성</span>
                </h2>
                <ScoreBreakdown components={theme.score.components} />

                {/* Change indicators */}
                <div className="flex gap-6 mt-6 pt-4 border-t border-slate-700/50">
                  <div>
                    <span className="text-xs text-slate-500 font-mono">24H</span>
                    <div className={`text-lg font-mono font-bold ${theme.score.change24h >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {theme.score.change24h >= 0 ? '+' : ''}{theme.score.change24h.toFixed(1)}
                    </div>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500 font-mono">7D</span>
                    <div className={`text-lg font-mono font-bold ${theme.score.change7d >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {theme.score.change7d >= 0 ? '+' : ''}{theme.score.change7d.toFixed(1)}
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>

            {/* Right column - Stocks + Comparisons */}
            <div className="space-y-6">
              {/* Related stocks */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.3 }}
                className="rounded-2xl border border-emerald-500/20 bg-slate-900/60 backdrop-blur-xl p-6"
              >
                <h2 className="text-lg font-bold mb-4">
                  <span className="text-white">관련</span>
                  <span className="text-emerald-400 ml-1">종목</span>
                  <span className="text-sm font-normal text-slate-500 ml-2">
                    ({theme.stocks.length})
                  </span>
                </h2>

                <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 scrollbar-thin scrollbar-track-slate-800 scrollbar-thumb-slate-600">
                  {theme.stocks.map((stock) => (
                    <div
                      key={stock.symbol}
                      className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 border border-slate-700/30 hover:border-emerald-500/30 transition-colors"
                    >
                      <div>
                        <div className="text-sm font-medium text-white">{stock.name}</div>
                        <div className="text-xs text-slate-500 font-mono">{stock.symbol}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500 px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700/50">
                          {stock.market}
                        </span>
                        <a
                          href={`https://finance.naver.com/item/main.naver?code=${stock.symbol}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-slate-500 hover:text-emerald-400 transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </div>
                  ))}

                  {theme.stocks.length === 0 && (
                    <p className="text-sm text-slate-500 text-center py-4">
                      관련 종목 데이터가 아직 수집되지 않았습니다
                    </p>
                  )}
                </div>
              </motion.div>

              {/* Past theme comparisons */}
              {theme.comparisons.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.4 }}
                  className="rounded-2xl border border-emerald-500/20 bg-slate-900/60 backdrop-blur-xl p-6"
                >
                  <h2 className="text-lg font-bold mb-4">
                    <span className="text-white">유사</span>
                    <span className="text-emerald-400 ml-1">패턴</span>
                  </h2>

                  <div className="space-y-3">
                    {theme.comparisons.map((comp, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/30"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-white">{comp.pastTheme}</span>
                          <span className="text-xs font-mono text-sky-400">
                            {Math.round(comp.similarity * 100)}% 유사
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 leading-relaxed">{comp.message}</p>
                        {comp.estimatedDaysToPeak > 0 && (
                          <div className="mt-2 pt-2 border-t border-slate-700/30">
                            <span className="text-xs text-amber-400 font-mono">
                              예상 피크까지 ~{comp.estimatedDaysToPeak}일
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </div>
          </div>

          {/* Disclaimer */}
          <motion.div
            initial={{ opacity: 0 }}
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

export default function ThemeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<DetailLoading />}>
      <ThemeDetailContent params={params} />
    </Suspense>
  )
}
