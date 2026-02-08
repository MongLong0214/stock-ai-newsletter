import AnimatedBackground from '@/components/animated-background'

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-emerald-500/10 bg-slate-900/60 backdrop-blur-sm p-6 animate-pulse">
      {/* Header: name + StageBadge */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex-1 min-w-0">
          <div className="h-6 w-28 bg-slate-700/50 rounded-lg mb-1" />
          <div className="h-4 w-20 bg-slate-800/50 rounded-lg" />
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <div className="h-6 w-14 bg-slate-700/30 rounded-full" />
          <div className="h-5 w-14 bg-orange-500/10 rounded-full" />
        </div>
      </div>

      {/* Score + Sparkline */}
      <div className="flex items-end justify-between gap-3 mb-4">
        <div className="flex items-end gap-2">
          <div className="h-12 w-14 bg-slate-700/50 rounded-lg" />
          <div className="pb-2">
            <div className="h-3 w-16 bg-slate-800/50 rounded" />
          </div>
        </div>
        <div className="pb-2">
          <div className="h-6 w-[60px] bg-slate-700/50 rounded" />
        </div>
      </div>

      {/* Change row with border-b */}
      <div className="flex items-center gap-2 mb-4 pb-4 border-b border-slate-700/50">
        <div className="h-4 w-4 bg-slate-700/50 rounded" />
        <div className="h-4 w-14 bg-slate-700/50 rounded" />
        <div className="h-3 w-12 bg-slate-800/50 rounded" />
      </div>

      {/* Stock count + news */}
      <div className="flex items-center gap-4 mb-3">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 bg-slate-700/50 rounded" />
          <div className="h-4 w-20 bg-slate-700/50 rounded" />
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3.5 w-3.5 bg-slate-700/50 rounded" />
          <div className="h-3 w-12 bg-slate-800/50 rounded" />
        </div>
      </div>

      {/* Top stock tags */}
      <div className="flex items-center gap-1.5 mt-auto flex-wrap">
        <div className="h-5 w-16 bg-emerald-500/10 rounded-full" />
        <div className="h-5 w-20 bg-emerald-500/10 rounded-full" />
        <div className="h-5 w-14 bg-emerald-500/10 rounded-full" />
      </div>
    </div>
  )
}

function ThemesSkeleton() {
  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      <AnimatedBackground />

      <div className="fixed inset-0 pointer-events-none z-1 opacity-[0.04]">
        <div
          className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(16,185,129,0.04)_50%)] bg-size-[100%_4px] animate-[matrix-scan_8s_linear_infinite]"
          aria-hidden="true"
        />
      </div>

      <main className="relative z-10 py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          {/* 1. Header */}
          <div className="mb-12 animate-pulse">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-8 w-1 bg-emerald-500 rounded-full" />
              <div className="h-9 w-48 sm:w-64 bg-slate-700/50 rounded-lg" />
            </div>
            <div className="ml-4 flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <div className="h-4 w-16 bg-slate-700/50 rounded" />
                <div className="h-3 w-24 bg-slate-800/50 rounded" />
              </div>
              <div className="h-4 w-full max-w-md bg-slate-800/50 rounded" />
            </div>
          </div>

          {/* 2. Stats Overview Bar */}
          <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-5 shadow-[0_4px_30px_rgba(0,0,0,0.3)] mb-8 animate-pulse">
            <div className="flex flex-wrap items-center gap-4 lg:gap-6">
              {/* Total */}
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-emerald-500/15 rounded-lg" />
                <div>
                  <div className="h-3 w-10 bg-slate-800/50 rounded mb-1" />
                  <div className="h-5 w-8 bg-slate-700/50 rounded" />
                </div>
              </div>

              <div className="hidden sm:block h-10 w-px bg-white/10" />

              {/* Stage pills */}
              <div className="flex items-center gap-3 flex-wrap">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-7 w-16 bg-slate-700/30 rounded-full" />
                ))}
              </div>

              <div className="hidden lg:block h-10 w-px bg-white/10" />

              {/* Hottest */}
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-amber-500/15 rounded-lg" />
                <div>
                  <div className="h-3 w-12 bg-slate-800/50 rounded mb-1" />
                  <div className="h-4 w-20 bg-slate-700/50 rounded" />
                </div>
              </div>

              <div className="hidden lg:block h-10 w-px bg-white/10" />

              {/* Surging */}
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-emerald-500/15 rounded-lg" />
                <div>
                  <div className="h-3 w-12 bg-slate-800/50 rounded mb-1" />
                  <div className="h-4 w-20 bg-slate-700/50 rounded" />
                </div>
              </div>

              <div className="hidden lg:block h-10 w-px bg-white/10" />

              {/* Avg Score */}
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-sky-500/15 rounded-lg" />
                <div>
                  <div className="h-3 w-16 bg-slate-800/50 rounded mb-1" />
                  <div className="h-5 w-12 bg-slate-700/50 rounded" />
                </div>
              </div>
            </div>
          </div>

          {/* 3. Filter Bar */}
          <div className="mb-8 animate-pulse">
            {/* Desktop */}
            <div className="hidden sm:flex items-center gap-3 p-2 rounded-xl bg-slate-900/40 backdrop-blur-sm border border-slate-800/50">
              <div className="relative flex-1">
                <div className="h-8 w-full bg-slate-950/50 rounded-lg border border-slate-700/30" />
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-7 w-14 bg-slate-800/30 rounded-lg" />
                ))}
              </div>
              <div className="flex items-center gap-1 pl-2 border-l border-slate-700/50">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-7 w-12 bg-slate-800/30 rounded-lg" />
                ))}
              </div>
            </div>

            {/* Mobile */}
            <div className="flex sm:hidden flex-col gap-2">
              <div className="h-9 w-full bg-slate-900/60 rounded-lg border border-slate-700/50" />
              <div className="flex gap-1 overflow-x-auto scrollbar-hide">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-8 w-16 bg-slate-900/60 rounded-lg flex-shrink-0" />
                ))}
              </div>
              <div className="flex gap-1">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex-1 h-8 bg-slate-900/60 rounded-lg" />
                ))}
              </div>
            </div>
          </div>

          {/* 4. Stage Sections */}
          {[1, 2].map((sectionIdx) => (
            <div key={sectionIdx} className="mb-10">
              <div className="flex items-start gap-3.5 p-3.5 rounded-xl mb-5 animate-pulse">
                <div className="w-1 h-6 bg-slate-700/50 rounded-full mt-0.5" />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="h-6 w-28 bg-slate-700/50 rounded-lg" />
                    <div className="h-4 w-8 bg-slate-800/50 rounded" />
                  </div>
                  <div className="h-4 w-48 bg-slate-800/50 rounded" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-5">
                {[1, 2, 3].map((i) => (
                  <SkeletonCard key={`${sectionIdx}-${i}`} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}

export default ThemesSkeleton
