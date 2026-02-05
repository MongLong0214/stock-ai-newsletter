'use client'

import { useState, useEffect, Suspense } from 'react'
import { motion } from 'framer-motion'
import AnimatedBackground from '@/components/animated-background'
import { ThemeCard } from '@/components/tli'
import { Disclaimer } from '@/components/tli'
import { STAGE_CONFIG, type ThemeListItem, type ThemeRanking, type Stage } from '@/lib/tli/types'

function ThemesLoading() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="animate-pulse text-emerald-500 font-mono">Loading TLI Data...</div>
    </div>
  )
}

const STAGE_ORDER: { key: keyof ThemeRanking; stage: Stage; title: string; subtitle: string }[] = [
  { key: 'early', stage: 'Early', title: '초기 단계', subtitle: '새로운 기회가 형성되는 테마' },
  { key: 'growth', stage: 'Growth', title: '성장 단계', subtitle: '관심이 빠르게 증가하는 테마' },
  { key: 'peak', stage: 'Peak', title: '과열 단계', subtitle: '관심이 최고조에 달한 테마' },
  { key: 'reigniting', stage: 'Early', title: '재점화 감지', subtitle: '하락 후 다시 관심이 증가하는 테마' },
  { key: 'decay', stage: 'Decay', title: '말기 단계', subtitle: '관심이 감소하고 있는 테마' },
]

function ThemesContent() {
  const [ranking, setRanking] = useState<ThemeRanking | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchRanking() {
      try {
        const res = await fetch('/api/tli/scores/ranking')
        if (!res.ok) throw new Error('Failed to fetch ranking')
        const data = await res.json()
        if (data.success) {
          setRanking(data.data)
        } else {
          throw new Error(data.error?.message || 'Unknown error')
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load')
      } finally {
        setLoading(false)
      }
    }
    fetchRanking()
  }, [])

  if (loading) return <ThemesLoading />

  if (error) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 font-mono mb-2">데이터 로딩 실패</p>
          <p className="text-slate-500 text-sm">{error}</p>
        </div>
      </div>
    )
  }

  const totalThemes = ranking
    ? Object.values(ranking).reduce((sum, arr) => sum + arr.length, 0)
    : 0

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
          {/* Page Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="mb-12"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="h-8 w-1 bg-emerald-500 rounded-full" />
              <h1 className="text-3xl sm:text-4xl font-black tracking-tight">
                <span className="text-white">테마</span>
                <span className="text-emerald-400 ml-2">라이프사이클</span>
              </h1>
            </div>
            <p className="text-slate-400 text-lg ml-4">
              Theme Lifecycle Intelligence (TLI) — 테마의 생명주기를 추적합니다
            </p>

            {/* Stats bar */}
            <div className="flex items-center gap-6 mt-6 ml-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-sm text-slate-500 font-mono">
                  {totalThemes}개 테마 추적 중
                </span>
              </div>
              <div className="text-sm text-slate-600 font-mono">
                Updated {new Date().toLocaleDateString('ko-KR')}
              </div>
            </div>
          </motion.div>

          {/* Stage sections */}
          {ranking && STAGE_ORDER.map(({ key, stage, title, subtitle }, sectionIdx) => {
            const themes = ranking[key]
            if (!themes || themes.length === 0) return null

            const config = STAGE_CONFIG[stage]

            return (
              <motion.section
                key={key}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: sectionIdx * 0.1 }}
                className="mb-12"
              >
                <div className="flex items-center gap-3 mb-6">
                  <div
                    className="h-6 w-1 rounded-full"
                    style={{ backgroundColor: config.color }}
                  />
                  <div>
                    <h2 className="text-xl font-bold" style={{ color: config.color }}>
                      {title}
                      <span className="ml-2 text-sm font-normal text-slate-500">
                        ({themes.length})
                      </span>
                    </h2>
                    <p className="text-sm text-slate-500">{subtitle}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {themes.map((theme: ThemeListItem) => (
                    <ThemeCard key={theme.id} theme={theme} />
                  ))}
                </div>
              </motion.section>
            )
          })}

          {/* Disclaimer */}
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

export default function ThemesPage() {
  return (
    <Suspense fallback={<ThemesLoading />}>
      <ThemesContent />
    </Suspense>
  )
}
