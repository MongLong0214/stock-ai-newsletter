/** Stage constants and utilities */

import type { Stage, ScoreComponents, DisplayStage } from './db'

export const STAGE_CONFIG: Record<DisplayStage, { color: string; label: string; labelEn: string; bg: string; border: string; text: string }> = {
  Dormant:    { color: '#64748B', label: '휴면',     labelEn: 'Dormant',    bg: 'bg-slate-500/20',   border: 'border-slate-500/30',   text: 'text-slate-400' },
  Emerging:   { color: '#3B82F6', label: '부상',     labelEn: 'Emerging',   bg: 'bg-blue-500/20',    border: 'border-blue-500/30',    text: 'text-blue-400' },
  Growth:     { color: '#10B981', label: '성장',     labelEn: 'Growth',     bg: 'bg-emerald-500/20', border: 'border-emerald-500/30', text: 'text-emerald-400' },
  Peak:       { color: '#EF4444', label: '정점',     labelEn: 'Peak',       bg: 'bg-red-500/20',     border: 'border-red-500/30',     text: 'text-red-400' },
  Decline:    { color: '#F59E0B', label: '하락',     labelEn: 'Decline',    bg: 'bg-amber-500/20',   border: 'border-amber-500/30',   text: 'text-amber-400' },
  Reigniting: { color: '#F97316', label: '재점화',   labelEn: 'Reigniting', bg: 'bg-orange-500/20',  border: 'border-orange-500/30',  text: 'text-orange-400' },
} as const;

/** DB 문자열 → Stage 타입 가드 (유효하지 않으면 Dormant 폴백) */
const VALID_STAGES = new Set<string>(['Dormant', 'Emerging', 'Growth', 'Peak', 'Decline'])

export function toStage(value: unknown): Stage {
  if (typeof value === 'string' && VALID_STAGES.has(value)) return value as Stage
  return 'Dormant'
}

/** JSONB → ScoreComponents 타입 가드 */
export function isScoreComponents(value: unknown): value is ScoreComponents {
  if (!value || typeof value !== 'object') return false
  const obj = value as Record<string, unknown>
  return (
    typeof obj.interest_score === 'number' &&
    typeof obj.news_momentum === 'number' &&
    typeof obj.volatility_score === 'number' &&
    typeof obj.maturity_ratio === 'number'
  )
}

export function getStageKo(stage: Stage): string {
  return STAGE_CONFIG[stage].label;
}
