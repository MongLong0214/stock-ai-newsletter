/** 로딩 상태 UI — 실제 DetailContent 레이아웃과 일치하는 스켈레톤 */
import { GlassCard } from '@/components/tli/glass-card'

/** 스켈레톤 바 축약 헬퍼 */
function Skel({ w = 'w-full', h = 'h-4', bg = 'bg-slate-700/50' }: { w?: string; h?: string; bg?: string }) {
  return <div className={`${h} ${w} ${bg} rounded`} />
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
          {/* 뒤로가기 */}
          <div className="mb-8"><Skel w="w-24" h="h-4" /></div>

          {/* 헤더 */}
          <GlassCard className="p-4 sm:p-6 mb-6 sm:mb-8">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 sm:gap-6">
              <div className="flex-1 min-w-0">
                <div className="flex items-center flex-wrap gap-2 sm:gap-3 mb-2">
                  <Skel w="w-48 sm:w-64" h="h-8 sm:h-9 lg:h-10" /><Skel w="w-16" h="h-6" bg="bg-emerald-500/10" /><Skel w="w-20" h="h-6" bg="bg-amber-500/10" />
                </div>
                <Skel w="w-32" h="h-5" bg="bg-slate-800/50" />
                <div className="space-y-2 max-w-2xl mt-2"><Skel bg="bg-slate-800/50" /><Skel w="w-2/3" bg="bg-slate-800/50" /></div>
                <div className="flex items-center flex-wrap gap-1.5 mt-3">
                  {[1, 2, 3, 4, 5].map(i => <Skel key={i} w="w-12" h="h-5" bg="bg-slate-800/40" />)}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i}><Skel w="w-16" h="h-3" bg="bg-slate-800/50" /><Skel w="w-12" h="h-5" /></div>
                  ))}
                </div>
              </div>
              <div className="flex-shrink-0"><div className="w-32 h-32 rounded-full border-4 border-slate-700/50 bg-slate-800/50" /></div>
            </div>
            <div className="mt-6 pt-6 border-t border-slate-700/40 grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <Skel w="w-24" h="h-4" />
                <div className="space-y-2 mt-3">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className="flex items-center gap-2"><Skel w="w-20" h="h-3" bg="bg-slate-800/50" /><div className="flex-1"><Skel h="h-2" bg="bg-slate-800/50" /></div><Skel w="w-8" h="h-3" /></div>
                  ))}
                </div>
              </div>
              <div>
                <Skel w="w-24" h="h-4" />
                <div className="space-y-2 mt-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="flex items-center justify-between"><Skel w="w-24" h="h-4" bg="bg-slate-800/50" /><Skel w="w-16" h="h-4" /></div>
                  ))}
                </div>
              </div>
            </div>
          </GlassCard>

          {/* 생명주기 예측 */}
          <GlassCard className="p-4 sm:p-6 mb-6 sm:mb-8">
            <div className="flex items-center justify-between mb-4"><Skel w="w-40" h="h-5" /><Skel w="w-16" h="h-6" bg="bg-sky-500/10" /></div>
            <div className="space-y-2 mb-4"><Skel bg="bg-slate-800/50" /><Skel w="w-5/6" bg="bg-slate-800/50" /></div>
          </GlassCard>

          {/* 차트 */}
          <GlassCard className="p-4 sm:p-6 mb-6 sm:mb-8">
            <div className="flex items-center justify-between mb-4"><Skel w="w-32" h="h-5" /><Skel w="w-24" h="h-4" bg="bg-sky-500/10" /></div>
            <div className="h-[400px] bg-slate-800/30 rounded-lg" />
          </GlassCard>

          {/* 뉴스 */}
          <GlassCard className="p-4 sm:p-6 mb-6 sm:mb-8">
            <div className="flex items-center justify-between mb-4"><Skel w="w-24" h="h-5" /><Skel w="w-12" h="h-5" bg="bg-emerald-500/10" /></div>
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="px-3 py-3">
                  <div className="flex items-start gap-2 mb-1.5"><Skel w="w-4" h="h-3" bg="bg-slate-800/50" /><Skel h="h-4" /></div>
                  <div className="flex items-center gap-2 ml-6"><Skel w="w-16" h="h-4" bg="bg-emerald-500/10" /><Skel w="w-12" h="h-4" bg="bg-sky-500/10" /></div>
                </div>
              ))}
            </div>
          </GlassCard>

          {/* 3열 그리드 */}
          <div className="grid grid-cols-1 lg:grid-cols-3 lg:grid-rows-[600px] gap-4 sm:gap-6">
            {/* ScoreCard */}
            <GlassCard className="p-6 h-full">
              <div className="flex items-start justify-between mb-6">
                <div><Skel w="w-20" h="h-3" bg="bg-slate-800/50" /><div className="flex items-baseline gap-3 mt-2"><Skel w="w-16" h="h-12" /><Skel w="w-12" h="h-6" bg="bg-slate-800/50" /></div></div>
                <div className="flex flex-col gap-2"><Skel w="w-20" h="h-9" bg="bg-emerald-500/10" /><Skel w="w-20" h="h-9" bg="bg-emerald-500/10" /></div>
              </div>
              <Skel h="h-20" bg="bg-emerald-500/5" />
            </GlassCard>

            {/* ComparisonList */}
            <GlassCard className="p-6 h-full">
              <Skel w="w-32" h="h-5" /><Skel w="w-40" h="h-3" bg="bg-slate-800/50" />
              <div className="space-y-3 mt-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="p-3 bg-slate-800/30 rounded-lg border border-slate-700/30">
                    <div className="flex items-center justify-between mb-2"><Skel w="w-32" h="h-4" /><Skel w="w-12" h="h-4" bg="bg-sky-500/10" /></div>
                    <Skel h="h-16" bg="bg-slate-800/30" />
                  </div>
                ))}
              </div>
            </GlassCard>

            {/* StockList */}
            <GlassCard className="p-0 h-full overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-800/50"><Skel w="w-24" h="h-5" /><Skel w="w-8" h="h-5" bg="bg-emerald-500/10" /></div>
              <div className="p-4 space-y-2">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-slate-800/30"><Skel w="w-24" h="h-4" /><Skel w="w-16" h="h-4" /></div>
                ))}
              </div>
            </GlassCard>
          </div>
        </div>
      </main>
    </div>
  )
}

export default DetailLoading
