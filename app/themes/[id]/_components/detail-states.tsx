import Link from 'next/link'
import { GlassCard } from '@/components/tli/glass-card'

/** 로딩 상태 UI */
export function DetailLoading() {
  return (
    <div className="min-h-screen bg-black">
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Back link skeleton */}
        <div className="mb-6">
          <div className="h-5 w-24 bg-emerald-500/10 rounded animate-pulse" />
        </div>

        {/* Header card skeleton */}
        <GlassCard className="p-6 mb-8">
          <div className="flex items-start justify-between gap-6">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-9 w-64 bg-slate-700/50 rounded animate-pulse" />
                <div className="h-6 w-16 bg-emerald-500/10 rounded-full animate-pulse" />
                <div className="h-6 w-20 bg-emerald-500/10 rounded-full animate-pulse" />
              </div>
              <div className="h-5 w-48 bg-slate-700/50 rounded mb-3 animate-pulse" />
              <div className="space-y-2 mb-6">
                <div className="h-4 w-full bg-slate-700/50 rounded animate-pulse" />
                <div className="h-4 w-3/4 bg-slate-700/50 rounded animate-pulse" />
              </div>
              <div className="flex gap-6 mb-6">
                <div className="flex flex-col gap-2">
                  <div className="h-3 w-16 bg-slate-700/50 rounded animate-pulse" />
                  <div className="h-6 w-20 bg-emerald-500/10 rounded animate-pulse" />
                </div>
                <div className="flex flex-col gap-2">
                  <div className="h-3 w-16 bg-slate-700/50 rounded animate-pulse" />
                  <div className="h-6 w-12 bg-emerald-500/10 rounded animate-pulse" />
                </div>
                <div className="flex flex-col gap-2">
                  <div className="h-3 w-20 bg-slate-700/50 rounded animate-pulse" />
                  <div className="h-6 w-12 bg-emerald-500/10 rounded animate-pulse" />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <div className="h-6 w-16 bg-emerald-500/10 rounded-full animate-pulse" />
                <div className="h-6 w-20 bg-emerald-500/10 rounded-full animate-pulse" />
                <div className="h-6 w-24 bg-emerald-500/10 rounded-full animate-pulse" />
                <div className="h-6 w-18 bg-emerald-500/10 rounded-full animate-pulse" />
              </div>
            </div>
            <div className="flex-shrink-0">
              <div className="w-32 h-32 rounded-full border-4 border-slate-700/50 bg-slate-800/50 animate-pulse" />
            </div>
          </div>
        </GlassCard>

        {/* Prediction card skeleton */}
        <GlassCard className="p-6 mb-8">
          <div className="h-6 w-32 bg-slate-700/50 rounded mb-4 animate-pulse" />
          <div className="space-y-2">
            <div className="h-4 w-full bg-slate-700/50 rounded animate-pulse" />
            <div className="h-4 w-5/6 bg-slate-700/50 rounded animate-pulse" />
            <div className="h-4 w-4/6 bg-slate-700/50 rounded animate-pulse" />
          </div>
        </GlassCard>

        {/* Lifecycle chart card skeleton */}
        <GlassCard className="p-6 mb-8">
          <div className="h-6 w-40 bg-slate-700/50 rounded mb-4 animate-pulse" />
          <div className="h-[400px] bg-slate-800/30 rounded-lg animate-pulse" />
        </GlassCard>

        {/* 3-column grid skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <GlassCard className="p-6">
            <div className="h-6 w-32 bg-slate-700/50 rounded mb-4 animate-pulse" />
            <div className="space-y-3">
              <div className="h-4 w-full bg-slate-700/50 rounded animate-pulse" />
              <div className="h-4 w-full bg-slate-700/50 rounded animate-pulse" />
              <div className="h-4 w-3/4 bg-slate-700/50 rounded animate-pulse" />
            </div>
          </GlassCard>
          <GlassCard className="p-6">
            <div className="h-6 w-32 bg-slate-700/50 rounded mb-4 animate-pulse" />
            <div className="space-y-3">
              <div className="h-4 w-full bg-slate-700/50 rounded animate-pulse" />
              <div className="h-4 w-full bg-slate-700/50 rounded animate-pulse" />
              <div className="h-4 w-3/4 bg-slate-700/50 rounded animate-pulse" />
            </div>
          </GlassCard>
          <GlassCard className="p-6">
            <div className="h-6 w-32 bg-slate-700/50 rounded mb-4 animate-pulse" />
            <div className="space-y-3">
              <div className="h-4 w-full bg-slate-700/50 rounded animate-pulse" />
              <div className="h-4 w-full bg-slate-700/50 rounded animate-pulse" />
              <div className="h-4 w-3/4 bg-slate-700/50 rounded animate-pulse" />
            </div>
          </GlassCard>
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
