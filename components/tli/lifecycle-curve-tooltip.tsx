'use client'

import { STAGE_CONFIG, type Stage } from '@/lib/tli/types'

/**
 * 스코어 → 스테이지 판정
 * Note: lib/tli/types/stage.ts의 toStage()는 DB 문자열 변환용이므로
 * 클라이언트에서 숫자 스코어 기반 판정은 별도 함수 필요
 */
export function scoreToStage(score: number): Stage {
  if (score >= 80) return 'Peak'
  if (score >= 60) return 'Growth'
  if (score >= 40) return 'Emerging'
  if (score >= 20) return 'Decline'
  return 'Dormant'
}

/** 커스텀 툴팁 */
export default function CustomTooltip({ active, payload, label }: {
  active?: boolean
  payload?: Array<{ value?: number; color?: string; name?: string; dataKey?: string }>
  label?: string
}) {
  if (!active || !payload?.length) return null

  const currentEntry = payload.find(p => p.dataKey === 'current')
  const score = currentEntry?.value ?? 0
  const stage = scoreToStage(score)
  const newsEntry = payload.find(p => p.dataKey === 'news')
  const interestEntry = payload.find(p => p.dataKey === 'interest')
  const otherEntries = payload.filter(p => p.dataKey !== 'news' && p.dataKey !== 'interest')

  return (
    <div className="rounded-lg border border-emerald-500/20 bg-slate-900/95 backdrop-blur-xl px-3 py-2 shadow-xl">
      <div className="text-xs text-slate-400 mb-1">{label}</div>
      <div className="space-y-1">
        {otherEntries.map((entry) => (
          <div key={entry.dataKey ?? entry.name} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-xs text-slate-300">{entry.name}</span>
            </div>
            <span className="text-sm font-mono font-medium text-white">
              {entry.value?.toFixed(1)}
            </span>
          </div>
        ))}
        {newsEntry && newsEntry.value !== undefined && (
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-sm bg-amber-500/60" />
              <span className="text-xs text-slate-300">뉴스</span>
            </div>
            <span className="text-sm font-mono font-medium text-amber-400">
              {Math.round(newsEntry.value)}건
            </span>
          </div>
        )}
        {interestEntry && interestEntry.value !== undefined && (
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full border border-violet-400" />
              <span className="text-xs text-slate-300">관심도</span>
            </div>
            <span className="text-sm font-mono font-medium text-violet-400">
              {interestEntry.value.toFixed(1)}
            </span>
          </div>
        )}
        {currentEntry && (
          <div className="mt-2 pt-2 border-t border-slate-700/50">
            <div
              className="text-xs font-medium"
              style={{ color: STAGE_CONFIG[stage].color }}
            >
              {STAGE_CONFIG[stage].label}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
