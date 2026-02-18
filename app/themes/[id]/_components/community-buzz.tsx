'use client'

import { useId } from 'react'
import { MessageCircle } from 'lucide-react'
import { Area, XAxis, YAxis, CartesianGrid, AreaChart } from 'recharts'
import { ChartContainer, ChartTooltip, ChartLegend, ChartLegendContent } from '@/components/ui/chart'
import type { ChartConfig } from '@/components/ui/chart'

interface CommunityTimelinePoint {
  date: string
  blog: number
  discussion: number
}

interface CommunityBuzzProps {
  timeline: CommunityTimelinePoint[]
}

const chartConfig = {
  blog: { label: '블로그', color: '#EC4899' },
  discussion: { label: '종목토론방', color: '#A855F7' },
} satisfies ChartConfig

export const CommunityBuzz = ({ timeline }: CommunityBuzzProps) => {
  const gradientId = useId()
  const blogGradient = `blog-${gradientId.replace(/:/g, '')}`
  const discussionGradient = `discussion-${gradientId.replace(/:/g, '')}`

  if (timeline.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <MessageCircle className="w-8 h-8 text-slate-700" />
        <p className="text-sm text-slate-500 font-mono">커뮤니티 데이터를 수집하고 있어요</p>
      </div>
    )
  }

  const sorted = [...timeline].sort((a, b) => a.date.localeCompare(b.date))

  return (
    <ChartContainer config={chartConfig} className="h-[300px] w-full">
      <AreaChart data={sorted} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
        <defs>
          <linearGradient id={blogGradient} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#EC4899" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#EC4899" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id={discussionGradient} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#A855F7" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#A855F7" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="#1e293b" strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tick={{ fill: '#64748b', fontSize: 11, fontFamily: 'monospace' }}
          tickFormatter={(v: string) => v.slice(5)}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={{ fill: '#64748b', fontSize: 11, fontFamily: 'monospace' }}
          allowDecimals={false}
        />
        <ChartTooltip
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null
            return (
              <div className="rounded-lg border border-slate-700 bg-slate-900/95 backdrop-blur-sm px-3 py-2 shadow-lg">
                <p className="text-[11px] font-mono text-slate-400 mb-1">{label}</p>
                {payload.map((entry) => (
                  <div key={entry.dataKey} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                    <span className="text-xs text-slate-300">{entry.dataKey === 'blog' ? '블로그' : '종목토론방'}</span>
                    <span className="text-xs font-bold text-white ml-auto">{entry.value}</span>
                  </div>
                ))}
              </div>
            )
          }}
        />
        <ChartLegend content={<ChartLegendContent />} />
        <Area
          type="monotone"
          dataKey="blog"
          stackId="community"
          stroke="#EC4899"
          strokeWidth={2}
          fill={`url(#${blogGradient})`}
        />
        <Area
          type="monotone"
          dataKey="discussion"
          stackId="community"
          stroke="#A855F7"
          strokeWidth={2}
          fill={`url(#${discussionGradient})`}
        />
      </AreaChart>
    </ChartContainer>
  )
}
