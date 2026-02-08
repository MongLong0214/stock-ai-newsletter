'use client'

import { useId } from 'react'
import Link from 'next/link'
import { ArrowUpRight, ArrowDownRight, TrendingUp, Newspaper } from 'lucide-react'
import { type Stage, STAGE_CONFIG } from '@/lib/tli/types'
import StageBadge from './stage-badge'

interface ThemeCardProps {
  theme: {
    id: string
    name: string
    nameEn: string | null
    score: number
    stage: Stage
    stageKo: string
    change7d: number
    stockCount: number
    topStocks: string[]
    isReigniting: boolean
    sparkline: number[]
    newsCount7d: number
  }
  href?: string
}

/** 스파크라인 SVG 미니 차트 */
function Sparkline({ data, isPositive }: { data: number[]; isPositive: boolean }) {
  const uniqueId = useId()

  if (!data || data.length < 2) return null

  const width = 60
  const height = 24
  const padding = 2

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1

  /** 데이터를 SVG 좌표로 변환 */
  const coords = data.map((value, index) => ({
    x: padding + (index / (data.length - 1)) * (width - padding * 2),
    y: padding + (1 - (value - min) / range) * (height - padding * 2),
  }))

  const pathD = `M ${coords.map(c => `${c.x},${c.y}`).join(' L ')}`
  const gradientId = `sparkline-${uniqueId}`
  const strokeColor = isPositive ? '#10B981' : '#EF4444'
  const gradientStart = isPositive ? '#10B981' : '#EF4444'
  const gradientEnd = isPositive ? '#10B98100' : '#EF444400'

  /** 채움 영역 경로: 라인 아래 영역을 닫음 */
  const areaD = `${pathD} L ${width - padding},${height - padding} L ${padding},${height - padding} Z`
  const last = coords[coords.length - 1]

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="flex-shrink-0">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={gradientStart} stopOpacity={0.3} />
          <stop offset="100%" stopColor={gradientEnd} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#${gradientId})`} />
      <path
        d={pathD}
        fill="none"
        stroke={strokeColor}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* 마지막 점 강조 */}
      <circle cx={last.x} cy={last.y} r={2} fill={strokeColor} />
    </svg>
  )
}

export default function ThemeCard({ theme, href }: ThemeCardProps) {
  const stageConfig = STAGE_CONFIG[theme.stage]
  const isPositiveChange = theme.change7d >= 0
  const linkHref = href || `/themes/${theme.id}`

  return (
    <Link href={linkHref}>
      <article
        className="group relative h-full flex flex-col rounded-2xl border border-emerald-500/10 bg-slate-900/60 backdrop-blur-sm p-6 shadow-[0_2px_12px_rgba(0,0,0,0.3)] hover:border-emerald-500/30 hover:shadow-[0_4px_24px_rgba(16,185,129,0.15),0_0_0_1px_rgba(16,185,129,0.1)] transition-[border-color,box-shadow] duration-300 ease-out"
      >
        {/* 재점화 표시 */}
        {theme.isReigniting && (
          <div className="absolute top-4 right-4 flex items-center gap-1.5 px-2 py-1 rounded-full bg-orange-500/20 border border-orange-500/30">
            <div className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
            <span className="text-xs font-medium text-orange-400">재점화 감지</span>
          </div>
        )}

        {/* 헤더 */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex-1 min-w-0">
            <h3 className="text-xl font-bold text-white mb-1 truncate group-hover:text-emerald-400 transition-colors duration-300">
              {theme.name}
            </h3>
            {theme.nameEn && (
              <p className="text-sm text-slate-400 truncate">{theme.nameEn}</p>
            )}
          </div>
          <StageBadge stage={theme.stage} showIcon size="sm" />
        </div>

        {/* 점수 + 스파크라인 */}
        <div className="flex items-end justify-between gap-3 mb-4">
          <div className="flex items-end gap-2">
            <div
              className="text-5xl font-black font-mono"
              style={{ color: stageConfig.color }}
            >
              {Math.round(theme.score)}
            </div>
            <div className="pb-2">
              <div className="text-xs text-slate-500 font-mono uppercase tracking-wider">
                Theme Score
              </div>
            </div>
          </div>
          {/* 7일 추이 스파크라인 */}
          <div className="pb-2">
            <Sparkline data={theme.sparkline} isPositive={isPositiveChange} />
          </div>
        </div>

        {/* 변화율 표시 */}
        <div className="flex items-center gap-2 mb-4 pb-4 border-b border-slate-700/50">
          {theme.change7d === 0 ? (
            <>
              <span className="text-sm font-mono font-medium text-slate-500">—</span>
              <span className="text-xs text-slate-500">7일 변화</span>
            </>
          ) : (
            <>
              {isPositiveChange ? (
                <ArrowUpRight className="w-4 h-4 text-emerald-400" />
              ) : (
                <ArrowDownRight className="w-4 h-4 text-red-400" />
              )}
              <span
                className={`text-sm font-mono font-medium ${
                  isPositiveChange ? 'text-emerald-400' : 'text-red-400'
                }`}
              >
                {isPositiveChange ? '+' : ''}{theme.change7d.toFixed(1)}%
              </span>
              <span className="text-xs text-slate-500">7일 변화</span>
            </>
          )}
        </div>

        {/* 종목 수 + 뉴스 카운트 */}
        <div className="flex items-center gap-4 mb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-slate-500" />
            <span className="text-sm text-slate-400">
              관련 종목 <span className="font-mono font-medium text-white">{theme.stockCount}</span>개
            </span>
          </div>
          {theme.newsCount7d > 0 && (
            <div className="flex items-center gap-1.5">
              <Newspaper className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-xs text-slate-400 font-mono">
                <span className="text-white font-medium">{theme.newsCount7d}</span> 뉴스
              </span>
            </div>
          )}
        </div>

        {/* 대표 종목 태그 */}
        {theme.topStocks.length > 0 && (
          <div className="flex items-center gap-1.5 mt-auto flex-wrap">
            {theme.topStocks.slice(0, 4).map((name, idx) => (
              <span
                key={`${name}-${idx}`}
                className="bg-emerald-500/8 text-[11px] text-emerald-300/80 rounded-full px-2 py-0.5 border border-emerald-500/15 truncate max-w-[110px] font-mono"
              >
                {name}
              </span>
            ))}
            {theme.stockCount > 4 && (
              <span className="text-[10px] text-slate-500 font-mono">
                +{theme.stockCount - 4}
              </span>
            )}
          </div>
        )}
      </article>
    </Link>
  )
}
