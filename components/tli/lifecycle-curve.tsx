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
  ReferenceLine,
} from 'recharts'
import { ChartContainer, ChartTooltip, ChartLegend, ChartLegendContent } from '@/components/ui/chart'
import CustomTooltip from './lifecycle-curve-tooltip'
import {
  type LifecycleCurveProps,
  comparisonColors,
  prepareChartConfig,
  mergeChartData,
  findPeakDate,
  getMaxNewsCount
} from './lifecycle-curve-data'
import { SCORE_COMPONENTS } from '@/lib/tli/constants/score-config'

// 뉴스 바 차트가 차트 높이의 약 1/3만 차지하도록 도메인 확장
const NEWS_BAR_HEIGHT_RATIO = 3

// 차트 색상 (score-config.ts의 컴포넌트 색상 사용)
const CHART_COLORS = {
  currentTheme: SCORE_COMPONENTS[0].color,  // #10B981 (emerald - interest)
  peak: '#F59E0B',                          // amber (decorative)
  news: SCORE_COMPONENTS[1].color,          // #0EA5E9 (sky - newsMomentum)
  interest: SCORE_COMPONENTS[2].color,      // #8B5CF6 (purple - volatility)
  grid: '#1e293b',
  axis: '#334155',
  tick: '#64748b',
} as const

export default function LifecycleCurve({
  currentData,
  comparisonData,
  newsTimeline,
  interestTimeline,
  height = 350
}: LifecycleCurveProps) {
  const gradientId = useId()

  if (currentData.length === 0) {
    return (
      <div
        className="flex items-center justify-center bg-slate-900/30 rounded-lg border border-slate-800"
        style={{ height }}
      >
        <p className="text-slate-500 text-sm font-mono">데이터 없음</p>
      </div>
    )
  }

  const peakDate = findPeakDate(currentData)
  const maxNewsCount = getMaxNewsCount(newsTimeline)
  const chartConfig = prepareChartConfig(comparisonData)
  const mergedData = mergeChartData(currentData, newsTimeline, interestTimeline, comparisonData)

  return (
    <ChartContainer config={chartConfig} className="w-full" style={{ height }}>
      <ComposedChart data={mergedData}>
        <defs>
          <linearGradient id={`currentGradient-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART_COLORS.currentTheme} stopOpacity={0.3} />
            <stop offset="100%" stopColor={CHART_COLORS.currentTheme} stopOpacity={0} />
          </linearGradient>
        </defs>

        <CartesianGrid
          strokeDasharray="3 3"
          stroke={CHART_COLORS.grid}
          opacity={0.3}
          vertical={false}
        />

        <XAxis
          dataKey="date"
          tick={{ fill: CHART_COLORS.tick, fontSize: 11 }}
          tickLine={{ stroke: CHART_COLORS.axis }}
          axisLine={{ stroke: CHART_COLORS.axis }}
        />

        {/* 메인 Y축: 스코어 */}
        <YAxis
          yAxisId="score"
          domain={[0, 100]}
          tick={{ fill: CHART_COLORS.tick, fontSize: 11 }}
          tickLine={{ stroke: CHART_COLORS.axis }}
          axisLine={{ stroke: CHART_COLORS.axis }}
          label={{
            value: 'Score',
            angle: -90,
            position: 'insideLeft',
            style: { fill: CHART_COLORS.tick, fontSize: 11 }
          }}
        />

        {/* 뉴스 볼륨 Y축 (우측, 숨김) */}
        {newsTimeline && newsTimeline.length > 0 && (
          <YAxis
            yAxisId="news"
            orientation="right"
            domain={[0, maxNewsCount * NEWS_BAR_HEIGHT_RATIO]}
            hide
          />
        )}

        <ChartTooltip content={<CustomTooltip />} />
        <ChartLegend content={<ChartLegendContent />} />

        {/* 최고점 마커 */}
        {peakDate && (
          <ReferenceLine
            x={peakDate}
            yAxisId="score"
            stroke={CHART_COLORS.peak}
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
            fill={CHART_COLORS.news}
            fillOpacity={0.15}
            stroke={CHART_COLORS.news}
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
          stroke={CHART_COLORS.currentTheme}
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
            stroke={CHART_COLORS.interest}
            strokeWidth={1.5}
            strokeDasharray="4 4"
            dot={false}
            animationDuration={1500}
            opacity={0.7}
          />
        )}

        {/* 비교 테마 라인 */}
        {comparisonData?.map((comp, idx) => (
          <Line
            key={`comparison-${idx}`}
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
