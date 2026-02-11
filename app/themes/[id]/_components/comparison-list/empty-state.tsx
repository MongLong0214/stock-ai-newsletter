/** 유사 패턴 빈 상태 — 비교 데이터 없음 */
'use client'

import { Search } from 'lucide-react'

export default function ComparisonEmpty() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 py-10">
      <Search className="w-7 h-7 text-slate-600" />
      <p className="text-sm font-mono text-slate-500 text-center leading-relaxed">
        비슷한 과거 테마가 아직 없어요
      </p>
    </div>
  )
}
