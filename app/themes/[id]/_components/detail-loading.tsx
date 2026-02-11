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
          {/* 뒤로가기 */}
          <div className="mb-8 flex items-center gap-2">
            <S className="w-4 h-4 rounded-full" />
            <S className="w-16 h-4" />
          </div>

          {/* ── DetailHeader ────────────────────────────────────── */}
          <GlassCard className="p-4 sm:p-6 mb-6 sm:mb-8">
            {/* Row 1: 타이틀 + 게이지 */}
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 sm:gap-6">
              <div className="flex-1 min-w-0">
                {/* 타이틀 + 뱃지 */}
                <div className="flex items-center flex-wrap gap-2 sm:gap-3 mb-2">
                  <S className="w-40 sm:w-56 h-8 sm:h-9 lg:h-10" />
                  <S className="w-16 h-6 rounded-full bg-emerald-500/10" />
                </div>
                {/* 영문명 */}
                <S className="w-32 h-5 bg-slate-800/50" />
                {/* 키워드 태그 */}
                <div className="flex items-center flex-wrap gap-1.5 mt-3">
                  <S className="w-3.5 h-3.5 rounded bg-slate-700/30" />
                  {Array.from({ length: 6 }, (_, i) => (
                    <S key={i} className="w-12 h-5 rounded-md bg-slate-800/40 border border-slate-700/40" />
                  ))}
                </div>
                {/* MetricGrid — 6칸 */}
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
              {/* 원형 게이지 */}
              <div className="flex-shrink-0 hidden lg:block">
                <div className="w-32 h-32 rounded-full border-4 border-slate-700/50 bg-slate-800/30" />
              </div>
            </div>

            {/* Row 2: 점수 구성 + 주요 종목 */}
            <div className="mt-6 pt-6 border-t border-slate-700/40 grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* ScoreComponents — 4 bars */}
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
              {/* TopMovers — 3 cards */}
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

          {/* ── ThemePrediction ──────────────────────────────────── */}
          <div className="mb-8">
            <GlassCard className="p-5 sm:p-6">
              <div className="space-y-5">
                {/* 헤더 */}
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
                {/* 인사이트 박스 */}
                <div className="rounded-xl border border-slate-700/30 bg-slate-800/20 p-4 flex items-start gap-3">
                  <S className="w-5 h-5 rounded bg-slate-700/40 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <S className="h-4" />
                    <S className="w-3/4 h-4" />
                  </div>
                </div>
                {/* Phase timeline — 5 bars */}
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
                {/* 진행 바 */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <S className="w-8 h-2.5 bg-slate-800/40" />
                    <S className="w-20 h-2.5 bg-slate-800/40" />
                    <S className="w-24 h-2.5 bg-slate-800/40" />
                  </div>
                  <div className="h-2.5 rounded-full bg-slate-800" />
                </div>
                {/* 통계 그리드 2×2 */}
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
                {/* 시나리오 3장 */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {Array.from({ length: 3 }, (_, i) => (
                    <div key={i} className="rounded-xl border border-slate-700/30 bg-slate-800/20 p-4">
                      <S className="w-20 h-3 bg-slate-800/50 mb-3" />
                      <S className="w-24 h-4 mb-2" />
                      <div className="space-y-1.5">
                        <S className="w-full h-2.5 bg-slate-800/40" />
                        <S className="w-3/4 h-2.5 bg-slate-800/40" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </GlassCard>
          </div>

          {/* ── 점수 추이 차트 ──────────────────────────────────── */}
          <GlassCard className="p-4 sm:p-6 mb-6 sm:mb-8">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-baseline gap-1">
                <S className="w-12 h-5" />
                <S className="w-10 h-5 bg-emerald-500/10" />
              </div>
            </div>
            <div className="h-[400px] rounded-lg bg-slate-800/30" />
          </GlassCard>

          {/* ── 관련 뉴스 ───────────────────────────────────────── */}
          <GlassCard className="p-4 sm:p-6 mb-6 sm:mb-8">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-baseline gap-1">
                <S className="w-12 h-5" />
                <S className="w-10 h-5 bg-emerald-500/10" />
              </div>
              <S className="w-10 h-5 rounded-full bg-emerald-500/10" />
            </div>
            {/* 기사 논조 요약 */}
            <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 mb-2 rounded-lg bg-slate-800/30 border border-slate-700/30">
              <S className="w-14 h-3 bg-slate-800/50" />
              <div className="flex items-center gap-2">
                <S className="w-12 h-5 rounded bg-slate-800/40" />
                <S className="w-10 h-3 bg-slate-800/30" />
              </div>
            </div>
            {/* 뉴스 3건 */}
            <div className="divide-y divide-slate-800/60">
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="px-3 sm:px-4 py-3">
                  <div className="flex items-start gap-2">
                    <S className="w-4 h-3 bg-slate-800/50 shrink-0 mt-0.5" />
                    <S className="flex-1 h-4" />
                  </div>
                  <div className="flex items-center gap-2 mt-1.5 ml-6">
                    <S className="w-14 h-4 rounded bg-emerald-500/10" />
                    <S className="w-10 h-4 rounded bg-slate-800/40" />
                    <span className="flex-1" />
                    <S className="w-12 h-3 bg-slate-800/30" />
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>

          {/* ── 3열 그리드: ScoreCard · ComparisonList · StockList ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 lg:grid-rows-[600px] gap-4 sm:gap-6">
            {/* ScoreCard */}
            <GlassCard className="p-6 h-full overflow-hidden">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <S className="w-16 h-3 bg-slate-800/50 mb-2" />
                  <div className="flex items-baseline gap-3">
                    <S className="w-16 h-12" />
                    <S className="w-10 h-6 bg-slate-800/50" />
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/40 border border-slate-700/30">
                    <S className="w-6 h-2.5 bg-slate-800/50" />
                    <S className="w-10 h-4" />
                  </div>
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/40 border border-slate-700/30">
                    <S className="w-6 h-2.5 bg-slate-800/50" />
                    <S className="w-10 h-4" />
                  </div>
                </div>
              </div>
              {/* 주도 요인 인사이트 */}
              <div className="mb-6 rounded-xl border border-emerald-500/10 bg-emerald-500/5 p-4 flex items-start gap-3">
                <S className="w-5 h-5 rounded bg-emerald-500/20 shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <S className="w-14 h-3 bg-emerald-500/10" />
                  <S className="w-full h-4 bg-slate-800/40" />
                </div>
              </div>
              {/* 구성 요소 분석 */}
              <S className="w-24 h-3 bg-slate-800/50 mb-4" />
              <div className="space-y-3">
                {Array.from({ length: 4 }, (_, i) => (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <S className="w-4 h-4 rounded bg-slate-700/40" />
                        <S className="w-12 h-3 bg-slate-800/50" />
                      </div>
                      <S className="w-6 h-3" />
                    </div>
                    <div className="h-3 rounded-full bg-slate-800/60 border border-slate-700/40" />
                  </div>
                ))}
              </div>
            </GlassCard>

            {/* ComparisonList */}
            <GlassCard className="h-full overflow-hidden flex flex-col">
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
                    {/* 헤더: 테마명 + 유사도 */}
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
                    {/* 세부 지표 3줄 */}
                    <div className="space-y-2">
                      {Array.from({ length: 3 }, (_, j) => (
                        <div key={j} className="flex items-center gap-2">
                          <S className="w-14 h-2.5 bg-slate-800/50" />
                          <div className="flex-1 h-2 rounded-full bg-slate-800/40" />
                          <S className="w-8 h-2.5" />
                        </div>
                      ))}
                    </div>
                    {/* 타임라인 */}
                    <div className="h-2 rounded-full bg-slate-700/40" />
                    <S className="w-full h-3 bg-slate-800/30" />
                  </div>
                ))}
              </div>
            </GlassCard>

            {/* StockList */}
            <div className="rounded-2xl border border-emerald-500/20 bg-slate-900/60 overflow-hidden flex flex-col h-full">
              {/* 헤더 */}
              <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-800/50">
                <div className="flex items-baseline gap-1">
                  <S className="w-10 h-5" />
                  <S className="w-10 h-5 bg-emerald-500/10" />
                </div>
                <S className="w-6 h-5 rounded-full bg-emerald-500/10" />
              </div>
              {/* 탭 + 정렬 */}
              <div className="px-4 pt-3 pb-2 space-y-2">
                <div className="flex gap-1">
                  {['w-12', 'w-14', 'w-16'].map((w, i) => (
                    <S key={i} className={`${w} h-6 rounded-md ${i === 0 ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-slate-800/30 border border-slate-700/30'}`} />
                  ))}
                </div>
                <div className="flex gap-1">
                  {Array.from({ length: 4 }, (_, i) => (
                    <S key={i} className="w-10 h-5 rounded bg-slate-800/20" />
                  ))}
                </div>
              </div>
              {/* 통계 바 */}
              <div className="flex items-center gap-3 px-4 py-1.5 border-y border-slate-800/30 bg-slate-950/30">
                <S className="w-6 h-3 bg-emerald-500/15" />
                <S className="w-6 h-3 bg-red-500/15" />
                <S className="w-6 h-3 bg-slate-800/30" />
                <span className="flex-1" />
                <S className="w-16 h-3 bg-slate-800/30" />
              </div>
              {/* 종목 4행 */}
              <div className="flex-1 overflow-hidden">
                {Array.from({ length: 5 }, (_, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-3 border-b border-slate-800/30">
                    <div className="flex items-center gap-3">
                      <S className="w-6 h-6 rounded-lg bg-slate-800/40" />
                      <div>
                        <S className="w-16 h-3.5 mb-1" />
                        <S className="w-20 h-2.5 bg-slate-800/40" />
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <S className="w-16 h-3.5" />
                      <S className="w-12 h-5 rounded-md bg-slate-800/30" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

export default DetailLoading