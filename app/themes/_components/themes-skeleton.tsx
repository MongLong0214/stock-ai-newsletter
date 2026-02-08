import AnimatedBackground from '@/components/animated-background'

/** 스켈레톤 카드 플레이스홀더 */
function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-emerald-500/10 bg-slate-900/40 backdrop-blur-xl p-6 animate-pulse">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex-1">
          <div className="h-6 w-32 bg-slate-700/50 rounded-lg mb-2" />
          <div className="h-4 w-24 bg-slate-800/50 rounded-lg" />
        </div>
        <div className="h-6 w-16 bg-slate-700/30 rounded-full" />
      </div>
      <div className="flex items-end gap-2 mb-4">
        <div className="h-12 w-16 bg-slate-700/50 rounded-lg" />
        <div className="h-3 w-12 bg-slate-800/50 rounded mb-2" />
      </div>
      <div className="flex items-center gap-2 mb-4 pb-4 border-b border-slate-700/30">
        <div className="h-4 w-4 bg-slate-700/50 rounded" />
        <div className="h-4 w-16 bg-slate-700/50 rounded" />
      </div>
      <div className="flex items-center gap-2">
        <div className="h-4 w-4 bg-slate-700/50 rounded" />
        <div className="h-4 w-24 bg-slate-700/50 rounded" />
      </div>
    </div>
  )
}

/** 스켈레톤 로딩 UI */
function ThemesSkeleton() {
  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      <AnimatedBackground />
      <main className="relative z-10 py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          {/* 헤더 스켈레톤 */}
          <div className="mb-12 animate-pulse">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-8 w-1 bg-emerald-500/30 rounded-full" />
              <div className="h-9 w-64 bg-slate-700/50 rounded-lg" />
            </div>
            <div className="h-5 w-96 bg-slate-800/50 rounded-lg ml-4" />
          </div>

          {/* 통계 바 스켈레톤 */}
          <div className="rounded-2xl border border-white/5 bg-white/[0.02] backdrop-blur-xl p-5 mb-8 animate-pulse">
            <div className="flex items-center gap-6">
              <div className="h-10 w-20 bg-slate-700/30 rounded-lg" />
              <div className="h-10 w-px bg-white/5" />
              <div className="flex gap-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-7 w-16 bg-slate-700/20 rounded-full" />
                ))}
              </div>
            </div>
          </div>

          {/* 카드 그리드 스켈레톤 */}
          <div className="mb-12">
            <div className="flex items-center gap-3 mb-6">
              <div className="h-6 w-1 bg-slate-700/50 rounded-full" />
              <div className="h-6 w-32 bg-slate-700/50 rounded-lg" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

export default ThemesSkeleton
