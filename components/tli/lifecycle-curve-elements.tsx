'use client'

import { STAGE_CONFIG } from '@/lib/tli/types/stage'
import { scoreToStage, type LayerKey } from './lifecycle-curve-data'

/* ─── 차트 상수 ─── */

export const CHART_COLORS = {
  currentTheme: '#10B981',
  peak: '#F59E0B',
  news: '#0EA5E9',
  interest: '#8B5CF6',
  communityBlog: '#EC4899',
  communityDiscussion: '#A855F7',
  grid: '#1e293b',
  axis: '#334155',
  tick: '#64748b',
} as const

/** 뉴스 바가 차트 높이의 약 1/3만 차지하도록 Y축 도메인 확장 비율 */
export const NEWS_BAR_HEIGHT_RATIO = 3

/* ─── 유틸리티 ─── */

/** 호버 중인 레이어만 강조, 나머지 opacity 감소 */
export function layerOpacity(
  layer: LayerKey,
  hoveredLayer: LayerKey | null | undefined,
  baseOpacity = 1
): number {
  if (!hoveredLayer) return baseOpacity
  return hoveredLayer === layer ? baseOpacity : 0.12
}

/* ─── SVG 서브컴포넌트 (recharts 커스텀 렌더러) ─── */

/** 스코어에 따른 스테이지 색상 글로우 링 */
export const AnimatedActiveDot = (props: Record<string, unknown>) => {
  const { cx, cy, payload } = props as {
    cx: number; cy: number; payload: Record<string, unknown>
  }
  if (typeof cx !== 'number' || typeof cy !== 'number') return null

  const score = (payload?.current as number) ?? 0
  const color = STAGE_CONFIG[scoreToStage(score)].color

  return (
    <g>
      <circle cx={cx} cy={cy} r={8} fill={color} fillOpacity={0.15} />
      <circle cx={cx} cy={cy} r={5} fill={color} fillOpacity={0.3} stroke={color} strokeWidth={1.5} />
      <circle cx={cx} cy={cy} r={2.5} fill={color} />
    </g>
  )
}

/** 데이터 최고점 라벨 — 스테이지명 "정점"과 구분하기 위해 "최고" 표기 */
export const PeakLabel = (props: Record<string, unknown>) => {
  const { viewBox, score } = props as { viewBox: { x: number; y: number }; score: number }
  if (!viewBox) return null
  return (
    <g>
      <rect
        x={viewBox.x - 28} y={viewBox.y - 28}
        width={56} height={20} rx={4}
        fill="rgba(245,158,11,0.15)" stroke="rgba(245,158,11,0.4)" strokeWidth={0.5}
      />
      <text
        x={viewBox.x} y={viewBox.y - 15}
        textAnchor="middle" fill="#F59E0B"
        fontSize={10} fontFamily="monospace" fontWeight={600}
      >
        최고 {score}
      </text>
    </g>
  )
}

/** 현재 위치 마커 — 마지막 데이터 포인트에 스테이지 색상으로 "현재" 표시 */
export const CurrentLabel = (props: Record<string, unknown>) => {
  const { viewBox, score, stageColor } = props as {
    viewBox: { x: number; y: number }; score: number; stageColor: string
  }
  if (!viewBox) return null
  return (
    <g>
      <rect
        x={viewBox.x - 22} y={viewBox.y + 8}
        width={44} height={18} rx={4}
        fill={stageColor + '20'} stroke={stageColor + '60'} strokeWidth={0.5}
      />
      <text
        x={viewBox.x} y={viewBox.y + 20}
        textAnchor="middle" fill={stageColor}
        fontSize={9} fontFamily="monospace" fontWeight={600}
      >
        현재 {score}
      </text>
    </g>
  )
}
