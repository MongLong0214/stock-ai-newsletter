/** 메트릭 그리드 — 미니 대시보드 카드 모음 */
'use client'

import { useMemo } from 'react'
import {
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
  Newspaper,
  Activity,
  MessageSquare,
} from 'lucide-react'
import type { ThemeDetail } from '@/lib/tli/types'

/* ── 색상 통합 맵 ──────────────────────────────────────────────── */

type MetricColor = 'emerald' | 'red' | 'sky' | 'purple' | 'amber' | 'slate'

const COLOR_MAP: Record<MetricColor, { card: string; icon: string; value: string }> = {
  emerald: { card: 'border-emerald-500/30 bg-emerald-500/5', icon: 'text-emerald-500', value: 'text-emerald-400' },
  red:     { card: 'border-red-500/30 bg-red-500/5',         icon: 'text-red-500',     value: 'text-red-400' },
  sky:     { card: 'border-sky-500/30 bg-sky-500/5',         icon: 'text-sky-500',     value: 'text-sky-400' },
  purple:  { card: 'border-purple-500/30 bg-purple-500/5',   icon: 'text-purple-500',  value: 'text-purple-400' },
  amber:   { card: 'border-amber-500/30 bg-amber-500/5',     icon: 'text-amber-500',   value: 'text-amber-400' },
  slate:   { card: 'border-slate-500/30 bg-slate-500/5',     icon: 'text-slate-500',   value: 'text-slate-400' },
}

/* ── MetricCard 서브 컴포넌트 ───────────────────────────────────── */

function MetricCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode
  label: string
  value: string
  color: MetricColor
}) {
  const c = COLOR_MAP[color]
  return (
    <div className={`rounded-xl border p-3 hover:border-opacity-80 hover:shadow-sm transition-all ${c.card}`}>
      <div className="flex items-center gap-1.5 mb-1">
        <div className={c.icon}>{icon}</div>
        <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wide">{label}</span>
      </div>
      <div className={`text-sm font-black ${c.value}`}>{value}</div>
    </div>
  )
}

/* ── MetricGrid ─────────────────────────────────────────────────── */

interface MetricGridProps {
  theme: ThemeDetail
  themeAge: number | null
}

export default function MetricGrid({ theme, themeAge }: MetricGridProps) {
  const sentiment = useMemo(() => {
    if (!theme.recentNews || theme.recentNews.length === 0) return null
    const scores = theme.recentNews
      .filter(a => a.sentimentScore != null)
      .map(a => a.sentimentScore!)
    if (scores.length === 0) return null
    const avg = scores.reduce((s, v) => s + v, 0) / scores.length
    return {
      avg,
      label: avg > 0.1 ? '긍정적' : avg < -0.1 ? '부정적' : '중립',
      color: avg > 0.1 ? 'text-emerald-400' : avg < -0.1 ? 'text-red-400' : 'text-slate-400',
      bg: avg > 0.1 ? 'bg-emerald-500/10 border-emerald-500/20' : avg < -0.1 ? 'bg-red-500/10 border-red-500/20' : 'bg-slate-500/10 border-slate-700/30',
      count: scores.length,
    }
  }, [theme.recentNews])

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mt-4">
      {themeAge != null && (
        <MetricCard icon={<Calendar className="w-4 h-4" />} label="테마 나이" value={themeAge > 365 ? '1년+' : `${themeAge}일`} color="emerald" />
      )}
      <MetricCard
        icon={theme.score.change24h >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
        label="24H 변화"
        value={theme.score.change24h === 0 && theme.lifecycleCurve.length < 2 ? '—' : `${theme.score.change24h >= 0 ? '+' : ''}${theme.score.change24h.toFixed(1)}`}
        color={theme.score.change24h > 0 ? 'emerald' : theme.score.change24h < 0 ? 'red' : 'slate'}
      />
      <MetricCard
        icon={theme.score.change7d >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
        label="7D 변화"
        value={theme.score.change7d === 0 && theme.lifecycleCurve.length < 2 ? '—' : `${theme.score.change7d >= 0 ? '+' : ''}${theme.score.change7d.toFixed(1)}`}
        color={theme.score.change7d > 0 ? 'emerald' : theme.score.change7d < 0 ? 'red' : 'slate'}
      />
      <MetricCard icon={<BarChart3 className="w-4 h-4" />} label="관련 종목" value={`${theme.stockCount}개`} color="sky" />
      <MetricCard icon={<Newspaper className="w-4 h-4" />} label="뉴스" value={`${theme.newsCount}건`} color="sky" />
      {theme.comparisons.length > 0 && (
        <MetricCard icon={<Activity className="w-4 h-4" />} label="유사 패턴" value={`${theme.comparisons.length}개`} color="purple" />
      )}
      {sentiment && (
        <div className={`rounded-xl border p-3 ${sentiment.bg}`}>
          <div className="flex items-center gap-1.5 mb-1">
            <MessageSquare className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wide">기사 논조</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className={`text-sm font-black ${sentiment.color}`}>{sentiment.label}</span>
            <span className="text-[10px] font-mono text-slate-600">({sentiment.count}건)</span>
          </div>
        </div>
      )}
    </div>
  )
}
