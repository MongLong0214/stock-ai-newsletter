'use client'

import { useId } from 'react'
import {
  Area, Bar, Line, XAxis, YAxis,
  CartesianGrid, ComposedChart, ReferenceLine, ReferenceArea, ReferenceDot,
} from 'recharts'
import { ChartContainer, ChartTooltip } from '@/components/ui/chart'
import { CustomTooltip } from './lifecycle-curve-tooltip'
import { STAGE_CONFIG } from '@/lib/tli/types/stage'
import {
  type LifecycleCurveProps, type LayerKey,
  scoreToStage, comparisonColors, prepareChartConfig, mergeChartData,
  findPeak, getMaxNewsCount, STAGE_ZONES, ZONE_LABELS,
} from './lifecycle-curve-data'
import {
  CHART_COLORS, NEWS_BAR_HEIGHT_RATIO, layerOpacity,
  AnimatedActiveDot, PeakLabel, CurrentLabel,
} from './lifecycle-curve-elements'

const DEFAULT_VISIBLE: Set<LayerKey> = new Set(['news', 'interest', 'comparison', 'zones', 'community'])

export default function LifecycleCurve({
  currentData, comparisonData, newsTimeline, interestTimeline, communityTimeline,
  height = 350, showZones = true,
  visibleLayers = DEFAULT_VISIBLE, hoveredLayer, reduceMotion = false,
}: LifecycleCurveProps) {
  const gradientId = useId()

  if (currentData.length === 0) {
    return (
      <div className="flex items-center justify-center bg-slate-900/30 rounded-lg border border-slate-800" style={{ height }}>
        <p className="text-slate-500 text-sm font-mono">데이터 없음</p>
      </div>
    )
  }

  const peak = findPeak(currentData)
  const current = currentData[currentData.length - 1]
  const currentColor = STAGE_CONFIG[scoreToStage(current.score)].color
  const showPeakDot = peak && peak.date !== current.date
  const maxNewsCount = getMaxNewsCount(newsTimeline)
  const hasCommunity = !!(communityTimeline?.length && visibleLayers.has('community'))
  const chartConfig = prepareChartConfig(comparisonData, hasCommunity)
  const mergedData = mergeChartData(currentData, newsTimeline, interestTimeline, comparisonData, communityTimeline)

  const dur = reduceMotion ? 0 : 1
  const zonesOn = showZones && visibleLayers.has('zones')
  const newsOn = visibleLayers.has('news') && !!newsTimeline?.length
  const interestOn = visibleLayers.has('interest') && !!interestTimeline?.length
  const compOn = visibleLayers.has('comparison') && !!comparisonData?.length

  return (
    <ChartContainer config={chartConfig} className="w-full" style={{ height }}>
      <ComposedChart data={mergedData} margin={{ top: 16, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={`cg-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART_COLORS.currentTheme} stopOpacity={0.3} />
            <stop offset="100%" stopColor={CHART_COLORS.currentTheme} stopOpacity={0} />
          </linearGradient>
          {hasCommunity && (
            <>
              <linearGradient id={`bg-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART_COLORS.communityBlog} stopOpacity={0.2} />
                <stop offset="100%" stopColor={CHART_COLORS.communityBlog} stopOpacity={0} />
              </linearGradient>
              <linearGradient id={`dg-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART_COLORS.communityDiscussion} stopOpacity={0.2} />
                <stop offset="100%" stopColor={CHART_COLORS.communityDiscussion} stopOpacity={0} />
              </linearGradient>
            </>
          )}
        </defs>

        {/* 스테이지 존 밴드 + 라벨 */}
        {zonesOn && STAGE_ZONES.map((z) => (
          <ReferenceArea key={z.stage} yAxisId="score" y1={z.y1} y2={z.y2}
            fill={z.color} fillOpacity={layerOpacity('zones', hoveredLayer, 0.04)} strokeOpacity={0} />
        ))}
        {zonesOn && ZONE_LABELS.map((z) => (
          <ReferenceLine key={z.y} yAxisId="score" y={z.y} stroke="transparent" strokeWidth={0}
            label={{ value: z.label, position: 'insideRight', fill: z.color, fontSize: 9, fontFamily: 'monospace', opacity: layerOpacity('zones', hoveredLayer, 0.35) }} />
        ))}

        <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} opacity={0.3} vertical={false} />
        <XAxis dataKey="date" tick={{ fill: CHART_COLORS.tick, fontSize: 11 }} tickLine={{ stroke: CHART_COLORS.axis }} axisLine={{ stroke: CHART_COLORS.axis }} />
        <YAxis yAxisId="score" domain={[0, 100]} tick={{ fill: CHART_COLORS.tick, fontSize: 11 }} tickLine={{ stroke: CHART_COLORS.axis }} axisLine={{ stroke: CHART_COLORS.axis }}
          label={{ value: 'Score', angle: -90, position: 'insideLeft', style: { fill: CHART_COLORS.tick, fontSize: 11 } }} />
        {newsOn && <YAxis yAxisId="news" orientation="right" domain={[0, maxNewsCount * NEWS_BAR_HEIGHT_RATIO]} hide />}

        <ChartTooltip content={<CustomTooltip />} />

        {/* 최고점 + 현재 위치 마커 */}
        {showPeakDot && peak && (
          <ReferenceDot x={peak.date} y={peak.score} yAxisId="score" r={5}
            fill={CHART_COLORS.peak} fillOpacity={0.25} stroke={CHART_COLORS.peak} strokeWidth={1.5}
            label={<PeakLabel score={peak.score} />} />
        )}
        {current && (
          <ReferenceDot x={current.date} y={current.score} yAxisId="score" r={5}
            fill={currentColor} fillOpacity={0.4} stroke={currentColor} strokeWidth={2}
            label={<CurrentLabel score={current.score} stageColor={currentColor} />} />
        )}

        {/* 뉴스 볼륨 바 */}
        {newsOn && (
          <Bar dataKey="news" yAxisId="news" fill={CHART_COLORS.news}
            fillOpacity={layerOpacity('news', hoveredLayer, 0.15)} stroke={CHART_COLORS.news}
            strokeOpacity={layerOpacity('news', hoveredLayer, 0.3)} strokeWidth={0.5}
            radius={[2, 2, 0, 0]} animationDuration={dur * 1000} animationBegin={dur * 200} />
        )}

        {/* 현재 테마 영역 */}
        <Area type="monotone" dataKey="current" yAxisId="score" stroke={CHART_COLORS.currentTheme}
          strokeWidth={2} fill={`url(#cg-${gradientId})`}
          animationDuration={dur * 1200} animationBegin={0} activeDot={<AnimatedActiveDot />} />

        {/* 커뮤니티 오버레이 */}
        {hasCommunity && (
          <Area type="monotone" dataKey="communityBlog" yAxisId="score" stroke={CHART_COLORS.communityBlog}
            strokeWidth={1} fill={`url(#bg-${gradientId})`} opacity={layerOpacity('community', hoveredLayer, 0.6)}
            animationDuration={dur * 1000} animationBegin={dur * 600} dot={false} />
        )}
        {hasCommunity && (
          <Area type="monotone" dataKey="communityDiscussion" yAxisId="score" stroke={CHART_COLORS.communityDiscussion}
            strokeWidth={1} fill={`url(#dg-${gradientId})`} opacity={layerOpacity('community', hoveredLayer, 0.6)}
            animationDuration={dur * 1000} animationBegin={dur * 700} dot={false} />
        )}

        {/* 관심도 보조선 */}
        {interestOn && (
          <Line type="monotone" dataKey="interest" yAxisId="score" stroke={CHART_COLORS.interest}
            strokeWidth={1.5} strokeDasharray="4 4" dot={false}
            animationDuration={dur * 1000} animationBegin={dur * 400} opacity={layerOpacity('interest', hoveredLayer, 0.7)} />
        )}

        {/* 비교 테마 라인 */}
        {compOn && comparisonData?.map((comp, idx) => (
          <Line key={comp.themeName} type="monotone" dataKey={`comparison${idx}`} yAxisId="score"
            stroke={comparisonColors[idx % comparisonColors.length]} strokeWidth={1.5} strokeDasharray="5 5"
            dot={false} animationDuration={dur * 1000} animationBegin={dur * (800 + idx * 200)}
            opacity={layerOpacity('comparison', hoveredLayer, 0.8)} />
        ))}
      </ComposedChart>
    </ChartContainer>
  )
}
