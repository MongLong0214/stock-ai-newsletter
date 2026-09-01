/** 자동 비교 후보 빈 상태 */
'use client'

import React from 'react'
import { Search } from 'lucide-react'

export default function ComparisonEmpty() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 py-10">
      <Search className="w-7 h-7 text-slate-600" />
      <p className="text-sm font-mono text-slate-500 text-center leading-relaxed">
        표시할 자동 비교 후보가 아직 없어요
      </p>
    </div>
  )
}
