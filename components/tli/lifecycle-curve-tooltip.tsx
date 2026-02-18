'use client'

import { STAGE_CONFIG } from '@/lib/tli/types'
import { scoreToStage } from './lifecycle-curve-data'

/** M/D 형식 날짜 → 요일 한글 포함 포맷 */
function formatDateWithDay(dateStr: string): string {
  const parts = dateStr.split('/')
  if (parts.length !== 2) return dateStr

  const month = parseInt(parts[0])
  const day = parseInt(parts[1])
  const now = new Date()
  const date = new Date(now.getFullYear(), month - 1, day)

  // 연말→연초 데이터: 미래 날짜면 작년으로 보정
  if (date > now) date.setFullYear(date.getFullYear() - 1)

  const dayNames = ['일', '월', '화', '수', '목', '금', '토']
  return `${month}/${day} (${dayNames[date.getDay()]})`
}

/** 프리미엄 커스텀 툴팁 */
export const CustomTooltip = ({ active, payload, label }: {
  active?: boolean
  payload?: Array<{ value?: number; color?: string; name?: string; dataKey?: string }>
  label?: string
}) => {
  if (!active || !payload?.length) return null

  const currentEntry = payload.find(p => p.dataKey === 'current')
  const score = currentEntry?.value ?? 0
  const stage = scoreToStage(score)
  const cfg = STAGE_CONFIG[stage]
  const prevScore = payload.find(p => p.dataKey === 'prevScore')?.value
  const delta = typeof prevScore === 'number' ? Number((score - prevScore).toFixed(1)) : null
  const newsEntry = payload.find(p => p.dataKey === 'news')
  const interestEntry = payload.find(p => p.dataKey === 'interest')
  const blogEntry = payload.find(p => p.dataKey === 'communityBlog')
  const discussionEntry = payload.find(p => p.dataKey === 'communityDiscussion')
  const compEntries = payload.filter(p => p.dataKey?.startsWith('comparison'))

  return (
    <div
      className="rounded-lg border bg-slate-900/95 backdrop-blur-xl shadow-2xl overflow-hidden min-w-[200px]"
      style={{ borderColor: cfg.color + '40', borderLeftWidth: 3, borderLeftColor: cfg.color }}
    >
      {/* 날짜 헤더 */}
      <div className="px-3 py-1.5 border-b border-slate-800/60">
        <span className="text-[11px] font-mono text-slate-400">
          {label ? formatDateWithDay(label) : ''}
        </span>
      </div>

      <div className="px-3 py-2 space-y-2">
        {/* 히어로 점수 + 스테이지 */}
        {currentEntry && (
          <div className="flex items-center gap-3">
            <div className="rounded-md px-2.5 py-1" style={{ backgroundColor: cfg.color + '15' }}>
              <span className="text-2xl font-bold font-mono tabular-nums" style={{ color: cfg.color }}>
                {score.toFixed(1)}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-mono" style={{ color: cfg.color }}>{cfg.label}</span>
              {delta !== null && delta !== 0 && (
                <span className={`text-[10px] font-mono ${delta > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  전일 {delta > 0 ? '+' : ''}{delta}
                </span>
              )}
              {delta === 0 && <span className="text-[10px] font-mono text-slate-500">전일 변동 없음</span>}
            </div>
          </div>
        )}

        {/* 미니 프로그레스 바 */}
        {currentEntry && (
          <div className="relative h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${score}%`, backgroundColor: cfg.color, opacity: 0.6 }} />
            <div className="absolute top-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-white" style={{ left: `${score}%`, marginLeft: -2 }} />
          </div>
        )}

        {/* 지표 섹션 */}
        {(newsEntry?.value !== undefined || interestEntry?.value !== undefined || blogEntry?.value !== undefined) && (
          <div className="pt-1 border-t border-slate-800/40 space-y-1">
            {newsEntry?.value !== undefined && (
              <IndicatorRow icon="rounded-sm bg-sky-500/60" label="뉴스" value={`${Math.round(newsEntry.value)}건`} color="text-sky-400" />
            )}
            {interestEntry?.value !== undefined && (
              <IndicatorRow icon="rounded-full border border-violet-400" label="관심도" value={interestEntry.value.toFixed(1)} color="text-violet-400" />
            )}
            {blogEntry?.value !== undefined && (
              <IndicatorRow icon="rounded-full bg-pink-500/60" label="블로그" value={`${Math.round(blogEntry.value)}건`} color="text-pink-400" />
            )}
            {discussionEntry?.value !== undefined && (
              <IndicatorRow icon="rounded-full bg-purple-500/60" label="토론" value={`${Math.round(discussionEntry.value)}건`} color="text-purple-400" />
            )}
          </div>
        )}

        {/* 비교 테마 점수 */}
        {compEntries.length > 0 && (
          <div className="pt-1 border-t border-slate-800/40 space-y-1">
            {compEntries.map((e) => (
              <div key={e.dataKey} className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: e.color }} />
                  <span className="text-[10px] text-slate-400 truncate max-w-[100px]">{e.name}</span>
                </div>
                <span className="text-[11px] font-mono text-slate-300">{e.value?.toFixed(1)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/** 지표 행 (아이콘 + 라벨 + 값) */
const IndicatorRow = ({ icon, label, value, color }: {
  icon: string; label: string; value: string; color: string
}) => (
  <div className="flex items-center justify-between">
    <div className="flex items-center gap-1.5">
      <div className={`w-1.5 h-1.5 ${icon}`} />
      <span className="text-[10px] text-slate-400">{label}</span>
    </div>
    <span className={`text-[11px] font-mono ${color}`}>{value}</span>
  </div>
)
