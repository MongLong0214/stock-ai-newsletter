/** 생명주기 예측 컴포넌트 설정 맵 */

import {
  TrendingUp,
  TrendingDown,
  Minus,
  Shield,
  AlertTriangle,
  Zap,
} from 'lucide-react'
import type {
  ConfidenceLevel,
  Phase,
  RiskLevel,
  Momentum,
} from '@/lib/tli/prediction'

export const CONFIDENCE_CONFIG: Record<ConfidenceLevel, { label: string; bg: string; text: string; border: string }> = {
  high:   { label: '신뢰도 높음', bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  medium: { label: '신뢰도 보통', bg: 'bg-amber-500/10',   text: 'text-amber-400',   border: 'border-amber-500/30' },
  low:    { label: '신뢰도 낮음', bg: 'bg-red-500/10',     text: 'text-red-400',     border: 'border-red-500/30' },
}

export const RISK_CONFIG: Record<RiskLevel, { label: string; bg: string; text: string; border: string; icon: typeof Shield }> = {
  low:      { label: '낮음',     bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30', icon: Shield },
  moderate: { label: '보통',     bg: 'bg-amber-500/10',   text: 'text-amber-400',   border: 'border-amber-500/30',   icon: AlertTriangle },
  high:     { label: '높음',     bg: 'bg-orange-500/10',  text: 'text-orange-400',  border: 'border-orange-500/30',  icon: AlertTriangle },
  critical: { label: '매우높음', bg: 'bg-red-500/10',     text: 'text-red-400',     border: 'border-red-500/30',     icon: Zap },
}

export const INSIGHT_BG: Record<RiskLevel, string> = {
  low:      'bg-emerald-500/8 border-emerald-500/20',
  moderate: 'bg-amber-500/8 border-amber-500/20',
  high:     'bg-orange-500/8 border-orange-500/20',
  critical: 'bg-red-500/8 border-red-500/20',
}

export const INSIGHT_ICON_COLOR: Record<RiskLevel, string> = {
  low:      'text-emerald-400',
  moderate: 'text-amber-400',
  high:     'text-orange-400',
  critical: 'text-red-400',
}

export const PHASE_LABELS: { id: Phase; label: string }[] = [
  { id: 'pre-peak',  label: '초기' },
  { id: 'near-peak', label: '성장' },
  { id: 'at-peak',   label: '피크' },
  { id: 'post-peak', label: '하락' },
  { id: 'declining', label: '종료' },
]

export const PHASE_COLORS: Record<Phase, { bg: string; ring: string; text: string; dot: string }> = {
  'pre-peak':  { bg: 'bg-emerald-500', ring: 'ring-emerald-500/30', text: 'text-emerald-400', dot: '#10B981' },
  'near-peak': { bg: 'bg-amber-500',   ring: 'ring-amber-500/30',   text: 'text-amber-400',   dot: '#F59E0B' },
  'at-peak':   { bg: 'bg-orange-500',  ring: 'ring-orange-500/30',  text: 'text-orange-400',  dot: '#F97316' },
  'post-peak': { bg: 'bg-red-500',     ring: 'ring-red-500/30',     text: 'text-red-400',     dot: '#EF4444' },
  'declining': { bg: 'bg-slate-500',   ring: 'ring-slate-500/30',   text: 'text-slate-400',   dot: '#64748B' },
}

export const MOMENTUM_CONFIG: Record<Momentum, { label: string; color: string; Icon: typeof TrendingUp }> = {
  accelerating: { label: '가속 중',  color: 'text-emerald-400', Icon: TrendingUp },
  stable:       { label: '안정',    color: 'text-slate-400',   Icon: Minus },
  decelerating: { label: '감속 중',  color: 'text-amber-400',   Icon: TrendingDown },
}
