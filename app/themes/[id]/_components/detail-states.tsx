import Link from 'next/link'
import { GlassCard } from '@/components/tli/glass-card'

/** 로딩 상태 UI - 실제 DetailContent 구조와 일치 */
export function DetailLoading() {
  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none z-1 opacity-[0.04]">
        <div
          className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(16,185,129,0.04)_50%)] bg-size-[100%_4px]"
          aria-hidden="true"
        />
      </div>

      <main className="relative z-10 py-8 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-3 pt-12 pb-8 sm:px-6 sm:py-12 lg:px-8 lg:py-16">
          {/* Back link skeleton */}
          <div className="mb-8 animate-pulse">
            <div className="h-4 w-24 bg-slate-700/50 rounded" />
          </div>

          {/* DetailHeader skeleton */}
          <GlassCard className="p-4 sm:p-6 mb-6 sm:mb-8">
            <div className="animate-pulse">
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 sm:gap-6">
                <div className="flex-1 min-w-0">
                  {/* Title + badges */}
                  <div className="flex items-center flex-wrap gap-2 sm:gap-3 mb-2">
                    <div className="h-8 sm:h-9 lg:h-10 w-48 sm:w-64 bg-slate-700/50 rounded-lg" />
                    <div className="h-6 w-16 bg-emerald-500/10 rounded-full" />
                    <div className="h-6 w-20 bg-amber-500/10 rounded-full" />
                  </div>
                  <div className="h-5 w-32 bg-slate-800/50 rounded mb-2" />
                  <div className="space-y-2 max-w-2xl">
                    <div className="h-4 w-full bg-slate-800/50 rounded" />
                    <div className="h-4 w-2/3 bg-slate-800/50 rounded" />
                  </div>

                  {/* Keywords */}
                  <div className="flex items-center flex-wrap gap-1.5 mt-3">
                    <div className="h-3 w-3 bg-slate-700/50 rounded" />
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                      <div key={i} className="h-5 w-12 bg-slate-800/40 rounded-md" />
                    ))}
                  </div>

                  {/* MetricGrid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mt-6">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i}>
                        <div className="h-3 w-16 bg-slate-800/50 rounded mb-1" />
                        <div className="h-5 w-12 bg-slate-700/50 rounded" />
                      </div>
                    ))}
                  </div>
                </div>

                {/* LifecycleScore gauge */}
                <div className="flex-shrink-0">
                  <div className="w-32 h-32 rounded-full border-4 border-slate-700/50 bg-slate-800/50" />
                </div>
              </div>

              {/* Row 2: ScoreComponents + TopMovers */}
              <div className="mt-6 pt-6 border-t border-slate-700/40 grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* ScoreComponents */}
                <div>
                  <div className="h-4 w-24 bg-slate-700/50 rounded mb-3" />
                  <div className="space-y-2">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className="h-3 w-20 bg-slate-800/50 rounded" />
                        <div className="flex-1 h-2 bg-slate-800/50 rounded" />
                        <div className="h-3 w-8 bg-slate-700/50 rounded" />
                      </div>
                    ))}
                  </div>
                </div>

                {/* TopMovers */}
                <div>
                  <div className="h-4 w-24 bg-slate-700/50 rounded mb-3" />
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="flex items-center justify-between">
                        <div className="h-4 w-24 bg-slate-800/50 rounded" />
                        <div className="h-4 w-16 bg-slate-700/50 rounded" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </GlassCard>

          {/* ThemePrediction skeleton */}
          <GlassCard className="p-4 sm:p-6 mb-6 sm:mb-8">
            <div className="animate-pulse">
              <div className="flex items-center justify-between mb-4">
                <div className="h-5 w-40 bg-slate-700/50 rounded" />
                <div className="h-6 w-16 bg-sky-500/10 rounded-full" />
              </div>
              <div className="space-y-2 mb-4">
                <div className="h-4 w-full bg-slate-800/50 rounded" />
                <div className="h-4 w-5/6 bg-slate-800/50 rounded" />
              </div>
              <div className="flex items-center gap-2">
                <div className="h-5 w-5 bg-slate-700/50 rounded" />
                <div className="h-4 w-32 bg-slate-800/50 rounded" />
              </div>
            </div>
          </GlassCard>

          {/* LifecycleCurve chart skeleton */}
          <GlassCard className="p-4 sm:p-6 mb-6 sm:mb-8">
            <div className="animate-pulse">
              <div className="flex items-center justify-between mb-4">
                <div className="h-5 w-32 bg-slate-700/50 rounded" />
                <div className="h-4 w-24 bg-sky-500/10 rounded" />
              </div>
              <div className="h-[400px] bg-slate-800/30 rounded-lg" />
            </div>
          </GlassCard>

          {/* NewsHeadlines skeleton */}
          <GlassCard className="p-4 sm:p-6 mb-6 sm:mb-8">
            <div className="animate-pulse">
              <div className="flex items-center justify-between mb-4">
                <div className="h-5 w-24 bg-slate-700/50 rounded" />
                <div className="h-5 w-12 bg-emerald-500/10 rounded-full" />
              </div>
              <div className="px-3 sm:px-4 py-2.5 mb-2 rounded-lg bg-slate-800/30 border border-slate-700/30">
                <div className="flex items-center justify-between">
                  <div className="h-3 w-16 bg-slate-800/50 rounded" />
                  <div className="h-5 w-16 bg-emerald-500/10 rounded" />
                </div>
              </div>
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="px-3 sm:px-4 py-3">
                    <div className="flex items-start gap-2 mb-1.5">
                      <div className="h-3 w-4 bg-slate-800/50 rounded" />
                      <div className="flex-1 h-4 bg-slate-700/50 rounded" />
                    </div>
                    <div className="flex items-center gap-2 ml-6">
                      <div className="h-4 w-16 bg-emerald-500/10 rounded" />
                      <div className="h-4 w-12 bg-sky-500/10 rounded" />
                      <div className="flex-1" />
                      <div className="h-3 w-16 bg-slate-800/50 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </GlassCard>

          {/* 3-column grid: ScoreCard + ComparisonList + StockList */}
          <div className="grid grid-cols-1 lg:grid-cols-3 lg:grid-rows-[600px] gap-4 sm:gap-6">
            {/* ScoreCard skeleton */}
            <GlassCard className="p-6 h-full overflow-y-auto">
              <div className="animate-pulse">
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <div className="h-3 w-20 bg-slate-800/50 rounded mb-2" />
                    <div className="flex items-baseline gap-3">
                      <div className="h-12 w-16 bg-slate-700/50 rounded" />
                      <div className="h-6 w-12 bg-slate-800/50 rounded" />
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="h-9 w-20 bg-emerald-500/10 rounded-lg" />
                    <div className="h-9 w-20 bg-emerald-500/10 rounded-lg" />
                  </div>
                </div>
                <div className="h-20 w-full bg-emerald-500/5 rounded-xl border border-emerald-500/20 mb-6" />
                <div className="h-4 w-24 bg-slate-700/50 rounded mb-4" />
                <div className="space-y-3">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="h-3 w-20 bg-slate-800/50 rounded" />
                        <div className="h-3 w-8 bg-slate-700/50 rounded" />
                      </div>
                      <div className="h-2 w-full bg-slate-800/50 rounded" />
                    </div>
                  ))}
                </div>
              </div>
            </GlassCard>

            {/* ComparisonList skeleton */}
            <GlassCard className="p-6 h-full overflow-y-auto">
              <div className="animate-pulse">
                <div className="h-5 w-32 bg-slate-700/50 rounded mb-1" />
                <div className="h-3 w-40 bg-slate-800/50 rounded mb-4" />
                <div className="space-y-3">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="p-3 bg-slate-800/30 rounded-lg border border-slate-700/30">
                      <div className="flex items-center justify-between mb-2">
                        <div className="h-4 w-32 bg-slate-700/50 rounded" />
                        <div className="h-4 w-12 bg-sky-500/10 rounded" />
                      </div>
                      <div className="h-3 w-24 bg-slate-800/50 rounded mb-2" />
                      <div className="h-16 w-full bg-slate-800/30 rounded" />
                    </div>
                  ))}
                </div>
              </div>
            </GlassCard>

            {/* StockList skeleton */}
            <GlassCard className="p-0 h-full overflow-hidden">
              <div className="animate-pulse">
                <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-800/50">
                  <div className="h-5 w-24 bg-slate-700/50 rounded" />
                  <div className="h-5 w-8 bg-emerald-500/10 rounded-full" />
                </div>
                <div className="px-4 pt-3 pb-2 space-y-2">
                  <div className="flex gap-1">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-6 w-16 bg-slate-800/30 rounded-md" />
                    ))}
                  </div>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="h-5 w-12 bg-slate-800/30 rounded" />
                    ))}
                  </div>
                </div>
                <div className="px-4 py-1.5 border-y border-slate-800/30 bg-slate-950/30">
                  <div className="h-3 w-32 bg-slate-800/50 rounded" />
                </div>
                <div className="p-4 space-y-2">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b border-slate-800/30">
                      <div className="h-4 w-24 bg-slate-700/50 rounded" />
                      <div className="h-4 w-16 bg-slate-700/50 rounded" />
                    </div>
                  ))}
                </div>
              </div>
            </GlassCard>
          </div>
        </div>
      </main>
    </div>
  )
}

/** 에러 상태 UI */
export function DetailError({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="text-center">
        <p className="text-red-400 font-mono mb-2">테마를 찾을 수 없습니다</p>
        <p className="text-slate-500 text-sm mb-4">{message}</p>
        <Link href="/themes" className="text-emerald-400 hover:text-emerald-300 text-sm font-mono">
          ← 목록으로 돌아가기
        </Link>
      </div>
    </div>
  )
}
