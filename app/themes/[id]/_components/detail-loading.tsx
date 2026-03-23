/** 로딩 상태 UI — 실제 DetailContent 레이아웃과 1:1 매칭되는 스켈레톤 */
import { GlassCard } from '@/components/tli/glass-card'

function S({ className = '' }: { className?: string }) {
  return <div className={`rounded bg-slate-700/50 ${className}`} />
}

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
        <div className="mx-auto max-w-7xl px-3 pt-12 pb-8 sm:px-6 sm:py-12 lg:px-8 lg:py-16 animate-pulse">
          <div className="mb-8 flex items-center gap-2">
            <S className="w-4 h-4 rounded-full" />
            <S className="w-16 h-4" />
          </div>

          <GlassCard className="p-4 sm:p-6 mb-6 sm:mb-8">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 sm:gap-6">
              <div className="flex-1 min-w-0">
                <div className="flex items-center flex-wrap gap-2 sm:gap-3 mb-2">
                  <S className="w-40 sm:w-56 h-8 sm:h-9 lg:h-10" />
                  <S className="w-16 h-6 rounded-full bg-emerald-500/10" />
                </div>
                <S className="w-32 h-5 bg-slate-800/50" />
                <div className="flex items-center flex-wrap gap-1.5 mt-3">
                  <S className="w-3.5 h-3.5 rounded bg-slate-700/30" />
                  {Array.from({ length: 6 }, (_, i) => (
                    <S key={i} className="w-12 h-5 rounded-md bg-slate-800/40 border border-slate-700/40" />
                  ))}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mt-4">
                  {Array.from({ length: 6 }, (_, i) => (
                    <div key={i} className="rounded-xl border border-slate-700/30 bg-slate-800/20 p-3">
                      <div className="flex items-center gap-1.5 mb-1">
                        <S className="w-4 h-4 rounded bg-slate-700/40" />
                        <S className="w-12 h-2.5 bg-slate-800/50" />
                      </div>
                      <S className="w-10 h-4" />
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex-shrink-0 hidden lg:block">
                <div className="w-32 h-32 rounded-full border-4 border-slate-700/50 bg-slate-800/30" />
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-slate-700/40 grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <S className="w-24 h-3 bg-slate-800/50" />
                  <S className="w-16 h-2.5 bg-slate-800/30" />
                </div>
                <div className="space-y-3">
                  {Array.from({ length: 4 }, (_, i) => (
                    <div key={i}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <S className="w-4 h-4 rounded bg-slate-700/40" />
                          <S className="w-14 h-3 bg-slate-800/50" />
                          <S className="w-8 h-2.5 bg-slate-800/30" />
                        </div>
                        <S className="w-6 h-3" />
                      </div>
                      <div className="h-3 rounded-full bg-slate-800/60 border border-slate-700/40" />
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-4">
                  <S className="w-24 h-3 bg-slate-800/50" />
                  <S className="w-16 h-2.5 bg-slate-800/30" />
                </div>
                <div className="space-y-2.5">
                  {Array.from({ length: 3 }, (_, i) => (
                    <div key={i} className="rounded-xl border border-slate-700/20 bg-slate-800/20 p-3.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <S className="w-20 h-4" />
                            <S className="w-12 h-3 bg-slate-800/50" />
                          </div>
                          <div className="flex items-center gap-2">
                            <S className="w-16 h-3 bg-slate-800/40" />
                            <S className="w-20 h-3 bg-slate-800/40" />
                          </div>
                        </div>
                        <S className="w-16 h-6 rounded-md bg-slate-800/30" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </GlassCard>

          <div className="mb-8">
            <GlassCard className="p-5 sm:p-6">
              <div className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-baseline gap-1">
                    <S className="w-20 h-5" />
                    <S className="w-12 h-5 bg-emerald-500/10" />
                  </div>
                  <div className="flex items-center gap-2">
                    <S className="w-16 h-6 rounded-full bg-sky-500/10" />
                    <S className="w-20 h-6 rounded-full bg-amber-500/10" />
                  </div>
                </div>
                <div className="rounded-xl border border-slate-700/30 bg-slate-800/20 p-4 flex items-start gap-3">
                  <S className="w-5 h-5 rounded bg-slate-700/40 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <S className="h-4" />
                    <S className="w-3/4 h-4" />
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {Array.from({ length: 5 }, (_, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                      <div className="w-full flex items-center gap-0.5">
                        <div className={`h-2 w-full rounded-full ${i === 1 ? 'bg-emerald-500/30' : 'bg-slate-800'}`} />
                      </div>
                      <S className="w-8 h-2.5 bg-slate-800/40" />
                    </div>
                  ))}
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <S className="w-8 h-2.5 bg-slate-800/40" />
                    <S className="w-20 h-2.5 bg-slate-800/40" />
                    <S className="w-24 h-2.5 bg-slate-800/40" />
                  </div>
                  <div className="h-2.5 rounded-full bg-slate-800" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {Array.from({ length: 4 }, (_, i) => (
                    <div key={i} className="rounded-xl border border-slate-700/30 bg-slate-800/20 p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <S className="w-4 h-4 rounded bg-slate-700/40" />
                        <S className="w-12 h-2.5 bg-slate-800/50" />
                      </div>
                      <S className="w-16 h-5" />
                    </div>
                  ))}
                </div>
              </div>
            </GlassCard>
          </div>

          <div className="mb-6 sm:mb-8 rounded-[28px] border border-emerald-500/18 bg-slate-900/60 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-800/50">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <div className="flex items-baseline gap-1">
                    <S className="w-10 h-5" />
                    <S className="w-10 h-5 bg-emerald-500/10" />
                  </div>
                  <S className="w-60 h-4 bg-slate-800/40" />
                </div>
                <div className="flex gap-2">
                  <S className="w-16 h-5 rounded-full bg-emerald-500/10" />
                  <S className="w-16 h-5 rounded-full bg-slate-800/40" />
                </div>
              </div>
            </div>

            <div className="px-5 py-5 space-y-4 border-b border-slate-800/30">
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(260px,0.92fr)_minmax(0,1.08fr)] gap-4">
                <div className="rounded-[24px] border border-emerald-500/10 bg-emerald-500/5 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-2">
                      <S className="w-20 h-3 bg-emerald-500/10" />
                      <S className="w-36 h-6" />
                      <S className="w-24 h-3 bg-slate-800/40" />
                    </div>
                    <div className="rounded-2xl border border-slate-700/30 p-3">
                      <S className="w-10 h-3 bg-slate-800/40 mb-2" />
                      <S className="w-14 h-5" />
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    {Array.from({ length: 3 }, (_, i) => (
                      <div key={i} className="rounded-2xl border border-slate-700/30 bg-slate-950/40 p-3">
                        <S className="w-10 h-3 bg-slate-800/40 mb-2" />
                        <S className="w-8 h-5" />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {Array.from({ length: 3 }, (_, i) => (
                    <div key={i} className="rounded-[22px] border border-slate-700/30 bg-slate-950/40 p-4">
                      <S className="w-12 h-3 bg-slate-800/40" />
                      <S className="w-20 h-5 mt-4" />
                      <S className="w-full h-3 mt-2 bg-slate-800/30" />
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <S className="w-16 h-3 bg-slate-800/40 mb-2" />
                  <div className="flex gap-1.5">
                    {['w-14', 'w-16', 'w-16'].map((w, i) => (
                      <S key={i} className={`${w} h-8 rounded-full ${i === 0 ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-slate-800/30 border border-slate-700/30'}`} />
                    ))}
                  </div>
                </div>
                <div>
                  <S className="w-16 h-3 bg-slate-800/40 mb-2" />
                  <div className="flex gap-1.5">
                    {Array.from({ length: 4 }, (_, i) => (
                      <S key={i} className={`w-14 h-8 rounded-full ${i === 1 ? 'bg-slate-200/90' : 'bg-slate-800/30 border border-slate-700/30'}`} />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="px-5 py-2 border-b border-slate-800/30 hidden lg:block">
              <div className="grid grid-cols-[56px_minmax(0,1.4fr)_120px_120px_160px] gap-3">
                {Array.from({ length: 5 }, (_, i) => (
                  <S key={i} className={i === 1 ? 'w-12 h-3 bg-slate-800/40' : 'w-10 h-3 bg-slate-800/30'} />
                ))}
              </div>
            </div>

            <div>
              {Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="px-5 py-3 border-b border-slate-800/30">
                  <div className="lg:hidden space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="flex items-center gap-2">
                        <S className="w-7 h-7 rounded-full bg-slate-800/40" />
                        <S className="w-3 h-3 bg-slate-800/30" />
                      </div>
                      <div className="flex-1">
                        <S className="w-24 h-4 mb-1" />
                        <S className="w-16 h-3 bg-slate-800/40" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <S className="w-16 h-4" />
                      <S className="w-14 h-4 justify-self-end" />
                      <div className="justify-self-end flex items-center gap-2">
                        <S className="w-16 h-3" />
                        <S className="w-14 h-1 rounded-full bg-slate-800/40" />
                      </div>
                    </div>
                  </div>
                  <div className="hidden lg:grid grid-cols-[56px_minmax(0,1.4fr)_120px_120px_160px] gap-3 items-center">
                    <div className="flex items-center gap-2">
                      <S className="w-7 h-7 rounded-full bg-slate-800/40" />
                      <S className="w-3 h-3 bg-slate-800/30" />
                    </div>
                    <div>
                      <S className="w-24 h-4 mb-1" />
                      <S className="w-16 h-3 bg-slate-800/40" />
                    </div>
                    <S className="w-16 h-4 justify-self-end" />
                    <S className="w-14 h-4 justify-self-end" />
                    <div className="justify-self-end flex items-center gap-2">
                      <S className="w-16 h-3" />
                      <S className="w-14 h-1 rounded-full bg-slate-800/40" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[minmax(360px,0.85fr)_minmax(0,1.55fr)] gap-4 sm:gap-6 mb-6 sm:mb-8 items-start">
            <GlassCard className="h-[620px] overflow-hidden flex flex-col">
              <div className="px-4 py-3.5 border-b border-slate-800/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-baseline gap-1">
                    <S className="w-10 h-5" />
                    <S className="w-10 h-5 bg-emerald-500/10" />
                  </div>
                  <S className="w-6 h-5 rounded-full bg-emerald-500/10" />
                </div>
              </div>
              <div className="flex-1 overflow-hidden px-4 py-3 space-y-3">
                {Array.from({ length: 2 }, (_, i) => (
                  <div key={i} className="p-5 rounded-xl border border-slate-700/30 bg-slate-800/40 space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <S className="w-28 h-4 mb-2" />
                        <S className="w-14 h-5 rounded bg-slate-800/40" />
                      </div>
                      <div className="flex flex-col items-end">
                        <S className="w-12 h-7" />
                        <S className="w-16 h-2.5 bg-slate-800/40 mt-1" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      {Array.from({ length: 3 }, (_, j) => (
                        <div key={j} className="flex items-center gap-2">
                          <S className="w-14 h-2.5 bg-slate-800/50" />
                          <div className="flex-1 h-2 rounded-full bg-slate-800/40" />
                          <S className="w-8 h-2.5" />
                        </div>
                      ))}
                    </div>
                    <div className="h-2 rounded-full bg-slate-700/40" />
                    <S className="w-full h-3 bg-slate-800/30" />
                  </div>
                ))}
              </div>
            </GlassCard>

            <GlassCard className="h-[620px] overflow-hidden grid grid-rows-[auto_auto_minmax(0,1fr)]">
              <div className="px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-baseline gap-1">
                      <S className="w-12 h-5" />
                      <S className="w-10 h-5 bg-emerald-500/10" />
                    </div>
                    <S className="w-56 h-4 mt-2 bg-slate-800/40" />
                  </div>
                  <div className="flex gap-2">
                    <S className="w-16 h-5 rounded-full bg-emerald-500/10" />
                    <S className="w-16 h-5 rounded-full bg-sky-500/10" />
                  </div>
                </div>
              </div>

              <div className="px-5 pb-4">
                <div className="rounded-[22px] border border-slate-800/70 bg-slate-950/55 p-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <S className="w-24 h-3 bg-slate-800/40" />
                      <S className="w-40 h-3 mt-2 bg-slate-800/30" />
                    </div>
                    <div className="flex gap-2">
                      <S className="w-16 h-8 rounded-full bg-slate-800/40" />
                      <S className="w-20 h-8 rounded-full bg-slate-800/40" />
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2.5">
                    {Array.from({ length: 3 }, (_, i) => (
                      <div key={i} className="min-w-[220px] rounded-[18px] border border-slate-700/30 bg-slate-950/40 p-3">
                        <S className="w-12 h-3 bg-slate-800/40" />
                        <S className="w-28 h-4 mt-3" />
                        <S className="w-24 h-3 mt-2 bg-slate-800/30" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="px-5 pb-5 min-h-0">
                <div className="h-full rounded-[24px] border border-slate-800/70 bg-slate-950/40 p-4">
                  <div className="flex gap-2 mb-3">
                    <S className="w-16 h-5 rounded-full bg-slate-800/40" />
                    <S className="w-16 h-5 rounded-full bg-slate-800/40" />
                    <S className="w-20 h-5 rounded-full bg-slate-800/40" />
                  </div>
                  <div className="h-full rounded-lg bg-slate-800/30" />
                </div>
              </div>
            </GlassCard>
          </div>
        </div>
      </main>
    </div>
  )
}

export default DetailLoading
