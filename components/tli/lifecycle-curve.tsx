'use client'

import {
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ComposedChart,
  ReferenceLine
} from 'recharts'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { STAGE_CONFIG, type Stage } from '@/lib/tli/types'

interface LifecycleCurveProps {
  currentData: Array<{ date: string; score: number }>
  comparisonData?: Array<{
    themeName: string
    data: Array<{ day: number; value: number }>
    similarity: number
  }>
  height?: number
}

export default function LifecycleCurve({
  currentData,
  comparisonData,
  height = 300
}: LifecycleCurveProps) {
  // Find peak in current data
  const peakIndex = currentData.reduce(
    (maxIdx, item, idx, arr) =>
      item.score > arr[maxIdx].score ? idx : maxIdx,
    0
  )
  const peakDate = currentData[peakIndex]?.date

  // Prepare chart config
  const chartConfig: ChartConfig = {
    current: {
      label: '현재 테마',
      color: '#10B981',
    },
  }

  // Add comparison themes to config
  const comparisonColors = ['#0EA5E9', '#F59E0B', '#8B5CF6']
  comparisonData?.forEach((comp, idx) => {
    chartConfig[`comparison${idx}`] = {
      label: comp.themeName,
      color: comparisonColors[idx % comparisonColors.length],
    }
  })

  // Merge data for chart
  const mergedData = currentData.map((item, idx) => {
    const merged: Record<string, string | number> = {
      date: item.date,
      current: item.score,
    }

    comparisonData?.forEach((comp, compIdx) => {
      const compPoint = comp.data[idx]
      if (compPoint) {
        merged[`comparison${compIdx}`] = compPoint.value
      }
    })

    return merged
  })

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ value?: number; color?: string; name?: string; dataKey?: string }>; label?: string }) => {
    if (!active || !payload?.length) return null

    const score = payload[0]?.value || 0
    let stage: Stage = 'Dormant'
    if (score >= 80) stage = 'Peak'
    else if (score >= 60) stage = 'Growth'
    else if (score >= 40) stage = 'Early'
    else if (score >= 20) stage = 'Decay'
    else stage = 'Dormant'

    return (
      <div className="rounded-lg border border-emerald-500/20 bg-slate-900/95 backdrop-blur-xl px-3 py-2 shadow-xl">
        <div className="text-xs text-slate-400 mb-1">{label}</div>
        <div className="space-y-1">
          {payload.map((entry, idx: number) => (
            <div key={idx} className="flex items-center justify-between gap-4">
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
          {payload[0]?.dataKey === 'current' && (
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

  return (
    <ChartContainer config={chartConfig} className="w-full" style={{ height }}>
      <ComposedChart data={mergedData}>
        <defs>
          <linearGradient id="currentGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10B981" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
          </linearGradient>
        </defs>

        <CartesianGrid
          strokeDasharray="3 3"
          stroke="#1e293b"
          opacity={0.3}
          vertical={false}
        />

        <XAxis
          dataKey="date"
          tick={{ fill: '#64748b', fontSize: 11 }}
          tickLine={{ stroke: '#334155' }}
          axisLine={{ stroke: '#334155' }}
        />

        <YAxis
          domain={[0, 100]}
          tick={{ fill: '#64748b', fontSize: 11 }}
          tickLine={{ stroke: '#334155' }}
          axisLine={{ stroke: '#334155' }}
          label={{
            value: 'Score',
            angle: -90,
            position: 'insideLeft',
            style: { fill: '#64748b', fontSize: 11 }
          }}
        />

        <ChartTooltip content={<CustomTooltip />} />

        {/* Peak marker */}
        {peakDate && (
          <ReferenceLine
            x={peakDate}
            stroke="#F59E0B"
            strokeDasharray="3 3"
            strokeWidth={1}
            opacity={0.5}
          />
        )}

        {/* Current theme area + line */}
        <Area
          type="monotone"
          dataKey="current"
          stroke="#10B981"
          strokeWidth={2}
          fill="url(#currentGradient)"
          animationDuration={1500}
        />

        {/* Comparison theme lines */}
        {comparisonData?.map((_, idx) => (
          <Line
            key={idx}
            type="monotone"
            dataKey={`comparison${idx}`}
            stroke={comparisonColors[idx % comparisonColors.length]}
            strokeWidth={1.5}
            strokeDasharray="5 5"
            dot={false}
            animationDuration={1500}
          />
        ))}
      </ComposedChart>
    </ChartContainer>
  )
}
