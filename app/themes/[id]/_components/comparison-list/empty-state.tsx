/** 유사 패턴 빈 상태 — 필터 결과 없음 vs 데이터 없음 구분 */
'use client'

import { Search } from 'lucide-react'
import { GlassCard } from '@/components/tli/glass-card'

interface ComparisonEmptyProps {
  /** 원본 비교 데이터는 있지만 품질 필터에 걸린 경우 true */
  hasRawData: boolean
}

export default function ComparisonEmpty({ hasRawData }: ComparisonEmptyProps) {
  return (
    <GlassCard className="p-6 h-full flex flex-col items-center justify-center gap-3">
      <Search className="w-8 h-8 text-slate-600" />
      <p className="text-sm font-mono text-slate-500 text-center leading-relaxed">
        {hasRawData
          ? '기준을 충족하는 비슷한 테마가 없어요'
          : '비슷한 과거 테마가 아직 없어요'}
      </p>
      {hasRawData && (
        <p className="text-[10px] font-mono text-slate-600 text-center">
          과거 주기 14일 이상 · 정점 3일차 이상 필요
        </p>
      )}
    </GlassCard>
  )
}
