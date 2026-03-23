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
export default function CustomTooltip({ active, payload, label, currentLabel, comparisonLabels }: {
  active?: boolean
  payload?: Array<{ value?: number; color?: string; name?: string; dataKey?: string }>
  label?: string
  currentLabel?: string
  comparisonLabels?: string[]
}) {
  if (!active || !payload?.length) return null

  const currentEntry = payload.find(p => p.dataKey === 'current')
  const score = currentEntry?.value ?? 0
  const stage = scoreToStage(score)
  const newsEntry = payload.find(p => p.dataKey === 'news')
  const interestEntry = payload.find(p => p.dataKey === 'interest')
  const seriesEntries = payload
    .filter(p => p.dataKey !== 'news' && p.dataKey !== 'interest')
    .sort((a, b) => {
      if (a.dataKey === 'current') return -1
      if (b.dataKey === 'current') return 1
      return 0
    })

  const resolveEntryLabel = (dataKey?: string, fallbackName?: string) => {
    if (dataKey === 'current') {
      return currentLabel ?? '현재 테마'
    }
    if (dataKey?.startsWith('comparison')) {
      const index = Number(dataKey.replace('comparison', ''))
      if (Number.isFinite(index) && comparisonLabels?.[index]) {
        return comparisonLabels[index]
      }
      return '선택한 비교 패턴'
    }
    return fallbackName ?? '데이터'
  }

  const formattedDate = formatTooltipDate(label)

  return (
    <div className="min-w-[220px] rounded-[18px] border border-white/8 bg-[linear-gradient(180deg,rgba(15,23,42,0.96),rgba(2,6,23,0.94))] px-3.5 py-3 shadow-[0_18px_50px_rgba(2,6,23,0.36)] backdrop-blur-xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-mono uppercase tracking-[0.14em] text-slate-500">기준 시점</div>
          <div className="mt-1 text-sm font-medium text-white">{formattedDate}</div>
        </div>
        {currentEntry && (
          <div
            className="rounded-full border px-2.5 py-1 text-[10px] font-mono"
            style={{
              color: STAGE_CONFIG[stage].color,
              borderColor: `${STAGE_CONFIG[stage].color}33`,
              backgroundColor: `${STAGE_CONFIG[stage].color}14`,
            }}
          >
            {STAGE_CONFIG[stage].label}
          </div>
        )}
      </div>

      <div className="mt-3 space-y-2">
        {seriesEntries.map((entry) => (
          <div
            key={entry.dataKey ?? entry.name}
            className={entry.dataKey === 'current'
              ? 'flex items-center justify-between gap-4 rounded-2xl border border-emerald-500/15 bg-emerald-500/8 px-3 py-2'
              : 'flex items-center justify-between gap-4 rounded-2xl border border-slate-800/70 bg-slate-950/55 px-3 py-2'}
          >
            <div className="flex items-center gap-2">
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span className={entry.dataKey === 'current' ? 'text-xs text-slate-100' : 'text-xs text-slate-300'}>
                {resolveEntryLabel(entry.dataKey, entry.name)}
              </span>
            </div>
            <span className={entry.dataKey === 'current' ? 'text-sm font-mono font-semibold text-emerald-100' : 'text-sm font-mono font-medium text-white'}>
              {entry.value?.toFixed(1)}
            </span>
          </div>
        ))}
      </div>

      {(newsEntry || interestEntry) && (
        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-800/70 pt-3">
          <MetricTile
            label="뉴스량"
            value={newsEntry && newsEntry.value !== undefined ? `${Math.round(newsEntry.value)}건` : '없음'}
            tone="amber"
          />
          <MetricTile
            label="관심도"
            value={interestEntry && interestEntry.value !== undefined ? interestEntry.value.toFixed(1) : '없음'}
            tone="violet"
          />
        </div>
      )}
    </div>
  )
}

function MetricTile({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: 'amber' | 'violet'
}) {
  const className = tone === 'amber'
    ? 'border-amber-500/15 bg-amber-500/6 text-amber-200'
    : 'border-violet-500/15 bg-violet-500/6 text-violet-200'

  return (
    <div className={`rounded-2xl border px-3 py-2 ${className}`}>
      <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-mono font-medium">{value}</div>
    </div>
  )
}

function formatTooltipDate(value?: string) {
  if (!value) return '날짜 정보 없음'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    weekday: 'short',
  }).format(parsed)
}
