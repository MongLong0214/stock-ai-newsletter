'use client'

import { useId } from 'react'
import {
  Area,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ComposedChart,
  ReferenceLine
} from 'recharts'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { STAGE_CONFIG, type Stage } from '@/lib/tli/types'

/** 스코어 → 스테이지 판정 */
function scoreToStage(score: number): Stage {
  if (score >= 80) return 'Peak'
  if (score >= 60) return 'Growth'
  if (score >= 40) return 'Early'
  if (score >= 20) return 'Decay'
  return 'Dormant'
}

/** 커스텀 툴팁 */
function CustomTooltip({ active, payload, label }: {
  active?: boolean
  payload?: Array<{ value?: number; color?: string; name?: string; dataKey?: string }>
  label?: string
}) {
  if (!active || !payload?.length) return null

  const currentEntry = payload.find(p => p.dataKey === 'current')
  const score = currentEntry?.value || 0
  const stage = scoreToStage(score)
  const newsEntry = payload.find(p => p.dataKey === 'news')
  const interestEntry = payload.find(p => p.dataKey === 'interest')
  const otherEntries = payload.filter(p => p.dataKey !== 'news' && p.dataKey !== 'interest')

  return (
    <div className="rounded-lg border border-emerald-500/20 bg-slate-900/95 backdrop-blur-xl px-3 py-2 shadow-xl">
      <div className="text-xs text-slate-400 mb-1">{label}</div>
      <div className="space-y-1">
        {otherEntries.map((entry, idx: number) => (
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

interface LifecycleCurveProps {
  currentData: Array<{ date: string; score: number }>
  comparisonData?: Array<{
    themeName: string
    data: Array<{ day: number; value: number }>
    similarity: number
  }>
  /** 뉴스 볼륨 오버레이 */
  newsTimeline?: Array<{ date: string; count: number }>
  /** 관심도 보조선 */
  interestTimeline?: Array<{ date: string; value: number }>
  height?: number
}

export default function LifecycleCurve({
  currentData,
  comparisonData,
  newsTimeline,
  interestTimeline,
  height = 350
}: LifecycleCurveProps) {
  // 현재 데이터에서 최고점 찾기
  const peakIndex = currentData.reduce(
    (maxIdx, item, idx, arr) =>
      item.score > arr[maxIdx].score ? idx : maxIdx,
    0
  )
  const peakDate = currentData[peakIndex]?.date

  // 뉴스 볼륨 최대값 (Y축 스케일링용)
  const maxNewsCount = newsTimeline?.reduce((max, item) => Math.max(max, item.count), 0) ?? 0

  // 차트 설정 준비
  const chartConfig: ChartConfig = {
    current: {
      label: '현재 테마',
      color: '#10B981',
    },
    news: {
      label: '뉴스 볼륨',
      color: '#F59E0B',
    },
    interest: {
      label: '관심도',
      color: '#8B5CF6',
    },
  }

  // 비교 테마를 설정에 추가
  const comparisonColors = ['#0EA5E9', '#F59E0B', '#8B5CF6']
  comparisonData?.forEach((comp, idx) => {
    chartConfig[`comparison${idx}`] = {
      label: comp.themeName,
      color: comparisonColors[idx % comparisonColors.length],
    }
  })

  // 뉴스/관심도를 날짜 기반으로 맵핑
  const newsMap = new Map(newsTimeline?.map(n => [n.date, n.count]))
  const interestMap = new Map(interestTimeline?.map(i => [i.date, i.value]))

  // 차트용 데이터 병합
  const mergedData = currentData.map((item, idx) => {
    const merged: Record<string, string | number> = {
      date: item.date,
      current: item.score,
    }

    // 뉴스 볼륨 매핑
    if (newsMap.has(item.date)) {
      merged.news = newsMap.get(item.date)!
    }

    // 관심도 매핑
    if (interestMap.has(item.date)) {
      merged.interest = interestMap.get(item.date)!
    }

    comparisonData?.forEach((comp, compIdx) => {
      const compPoint = comp.data[idx]
      if (compPoint) {
        merged[`comparison${compIdx}`] = compPoint.value
      }
    })

    return merged
  })

  const gradientId = useId()

  return (
    <ChartContainer config={chartConfig} className="w-full" style={{ height }}>
      <ComposedChart data={mergedData}>
        <defs>
          <linearGradient id={`currentGradient-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
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

        {/* 메인 Y축: 스코어 */}
        <YAxis
          yAxisId="score"
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

        {/* 뉴스 볼륨 Y축 (우측, 숨김) */}
        {newsTimeline && newsTimeline.length > 0 && (
          <YAxis
            yAxisId="news"
            orientation="right"
            domain={[0, maxNewsCount * 3]}
            hide
          />
        )}

        <ChartTooltip content={<CustomTooltip />} />

        {/* 최고점 마커 */}
        {peakDate && (
          <ReferenceLine
            x={peakDate}
            yAxisId="score"
            stroke="#F59E0B"
            strokeDasharray="3 3"
            strokeWidth={1}
            opacity={0.5}
          />
        )}

        {/* 뉴스 볼륨 바 (하단 반투명) */}
        {newsTimeline && newsTimeline.length > 0 && (
          <Bar
            dataKey="news"
            yAxisId="news"
            fill="#F59E0B"
            fillOpacity={0.15}
            stroke="#F59E0B"
            strokeOpacity={0.3}
            strokeWidth={0.5}
            radius={[2, 2, 0, 0]}
            animationDuration={1500}
          />
        )}

        {/* 현재 테마 영역 + 라인 */}
        <Area
          type="monotone"
          dataKey="current"
          yAxisId="score"
          stroke="#10B981"
          strokeWidth={2}
          fill={`url(#currentGradient-${gradientId})`}
          animationDuration={1500}
        />

        {/* 관심도 보조선 (점선) */}
        {interestTimeline && interestTimeline.length > 0 && (
          <Line
            type="monotone"
            dataKey="interest"
            yAxisId="score"
            stroke="#8B5CF6"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            dot={false}
            animationDuration={1500}
            opacity={0.7}
          />
        )}

        {/* 비교 테마 라인 */}
        {comparisonData?.map((_, idx) => (
          <Line
            key={idx}
            type="monotone"
            dataKey={`comparison${idx}`}
            yAxisId="score"
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
