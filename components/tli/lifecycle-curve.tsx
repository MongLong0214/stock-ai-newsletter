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
import { ChartContainer, ChartTooltip } from '@/components/ui/chart'
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
  currentLabel = '현재 테마',
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
  const chartConfig = prepareChartConfig(comparisonData, currentLabel)
  const mergedData = mergeChartData(currentData, newsTimeline, interestTimeline, comparisonData)

  return (
    <ChartContainer config={chartConfig} className="w-full aspect-auto" style={{ height }}>
      <ComposedChart
        data={mergedData}
        margin={{ top: 8, right: 6, bottom: 4, left: -18 }}
      >
        <defs>
          <linearGradient id={`currentGradient-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART_COLORS.currentTheme} stopOpacity={0.22} />
            <stop offset="100%" stopColor={CHART_COLORS.currentTheme} stopOpacity={0.02} />
          </linearGradient>
        </defs>

        <CartesianGrid
          strokeDasharray="3 3"
          stroke={CHART_COLORS.grid}
          opacity={0.22}
          vertical={false}
        />

        <XAxis
          dataKey="date"
          tick={{ fill: CHART_COLORS.tick, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          tickMargin={10}
          minTickGap={28}
          tickFormatter={formatAxisDateLabel}
        />

        <YAxis
          yAxisId="score"
          domain={[0, 100]}
          tick={{ fill: CHART_COLORS.tick, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={34}
          tickCount={5}
        />

        {newsTimeline && newsTimeline.length > 0 && (
          <YAxis
            yAxisId="news"
            orientation="right"
            domain={[0, maxNewsCount * NEWS_BAR_HEIGHT_RATIO]}
            hide
          />
        )}

        <ChartTooltip
          cursor={{ stroke: '#334155', strokeWidth: 1, strokeDasharray: '4 4' }}
          content={
            <CustomTooltip
              currentLabel={currentLabel}
              comparisonLabels={comparisonData?.map((comparison) => comparison.themeName) ?? []}
            />
          }
        />

        {peakDate && (
          <ReferenceLine
            x={peakDate}
            yAxisId="score"
            stroke={CHART_COLORS.peak}
            strokeDasharray="4 4"
            strokeWidth={1}
            opacity={0.55}
          />
        )}

        {newsTimeline && newsTimeline.length > 0 && (
          <Bar
            dataKey="news"
            yAxisId="news"
            fill={CHART_COLORS.news}
            fillOpacity={0.08}
            stroke={CHART_COLORS.news}
            strokeOpacity={0.18}
            strokeWidth={0.5}
            radius={[3, 3, 0, 0]}
            barSize={10}
            animationDuration={1200}
          />
        )}

        <Area
          type="monotone"
          dataKey="current"
          yAxisId="score"
          stroke={CHART_COLORS.currentTheme}
          strokeWidth={2.5}
          fill={`url(#currentGradient-${gradientId})`}
          activeDot={{ r: 4, strokeWidth: 0, fill: CHART_COLORS.currentTheme }}
          animationDuration={1200}
        />

        {interestTimeline && interestTimeline.length > 0 && (
          <Line
            type="monotone"
            dataKey="interest"
            yAxisId="score"
            stroke={CHART_COLORS.interest}
            strokeWidth={1.25}
            strokeDasharray="4 4"
            dot={false}
            animationDuration={1200}
            opacity={0.55}
          />
        )}

        {comparisonData?.map((comp, idx) => (
          <Line
            key={`comparison-${idx}`}
            type="monotone"
            dataKey={`comparison${idx}`}
            yAxisId="score"
            stroke={comparisonColors[idx % comparisonColors.length]}
            strokeWidth={2}
            strokeDasharray="6 4"
            dot={false}
            animationDuration={1200}
            opacity={0.92}
          />
        ))}
      </ComposedChart>
    </ChartContainer>
  )
}

function formatAxisDateLabel(value: string) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return `${parsed.getMonth() + 1}.${String(parsed.getDate()).padStart(2, '0')}`
}
