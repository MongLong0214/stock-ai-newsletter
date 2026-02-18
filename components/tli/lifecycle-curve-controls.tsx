'use client'

import type { LayerKey } from './lifecycle-curve-data'

interface LayerConfig {
  key: LayerKey
  label: string
  color: string
}

const LAYER_OPTIONS: LayerConfig[] = [
  { key: 'zones', label: '스테이지 존', color: '#64748b' },
  { key: 'news', label: '뉴스 볼륨', color: '#0EA5E9' },
  { key: 'interest', label: '관심도', color: '#8B5CF6' },
  { key: 'comparison', label: '비교 테마', color: '#F59E0B' },
  { key: 'community', label: '커뮤니티', color: '#EC4899' },
]

interface LifecycleCurveControlsProps {
  visibleLayers: Set<LayerKey>
  onToggleLayer: (layer: LayerKey) => void
  hoveredLayer: LayerKey | null
  onHoverLayer: (layer: LayerKey | null) => void
  /** 커뮤니티 데이터 존재 여부 (없으면 커뮤니티 칩 숨김) */
  hasCommunity?: boolean
  /** 비교 테마 존재 여부 (없으면 비교 칩 숨김) */
  hasComparison?: boolean
}

export const LifecycleCurveControls = ({
  visibleLayers,
  onToggleLayer,
  hoveredLayer,
  onHoverLayer,
  hasCommunity = false,
  hasComparison = false,
}: LifecycleCurveControlsProps) => {
  const filtered = LAYER_OPTIONS.filter((opt) => {
    if (opt.key === 'community' && !hasCommunity) return false
    if (opt.key === 'comparison' && !hasComparison) return false
    return true
  })

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {filtered.map((opt) => {
        const isVisible = visibleLayers.has(opt.key)
        const isHovered = hoveredLayer === opt.key
        return (
          <button
            key={opt.key}
            onClick={() => onToggleLayer(opt.key)}
            onMouseEnter={() => onHoverLayer(opt.key)}
            onMouseLeave={() => onHoverLayer(null)}
            className={`
              inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono
              border transition-all cursor-pointer select-none
              ${isVisible
                ? isHovered
                  ? 'border-white/30 bg-white/5'
                  : 'border-slate-600/40 bg-slate-800/30'
                : 'border-slate-800/40 bg-transparent opacity-40'
              }
            `}
          >
            <div
              className="w-2 h-2 rounded-full shrink-0 transition-opacity"
              style={{
                backgroundColor: opt.color,
                opacity: isVisible ? 1 : 0.3,
              }}
            />
            <span className={isVisible ? 'text-slate-300' : 'text-slate-600'}>
              {opt.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
