'use client'

import { motion } from 'framer-motion'
import { Activity } from 'lucide-react'
import type { ThemeRanking } from '@/lib/tli/types'

interface ThemesHeaderProps {
  summary: ThemeRanking['summary'] | null
}

/** 시장 상태 진단 (summary 데이터 기반) */
function getMarketPulse(summary: ThemeRanking['summary']): {
  label: string
  description: string
  color: string
  barColor: string
} {
  const { byStage, avgScore } = summary
  const peak = byStage['Peak'] ?? 0
  const growth = byStage['Growth'] ?? 0
  const decay = byStage['Decay'] ?? 0
  const early = byStage['Early'] ?? 0
  const total = summary.totalThemes

  if (total > 0 && peak / total >= 0.1) {
    return {
      label: '과열 주의',
      description: '다수의 테마가 과열 구간에 진입했습니다. 신규 진입 시 주의가 필요합니다.',
      color: 'text-amber-400',
      barColor: 'bg-amber-500',
    }
  }
  if (growth > peak && growth > decay) {
    return {
      label: '성장 주도',
      description: '성장 단계 테마가 시장을 이끌고 있습니다. 모멘텀이 살아있는 구간입니다.',
      color: 'text-sky-400',
      barColor: 'bg-sky-500',
    }
  }
  if (decay > growth && decay > peak) {
    return {
      label: '시장 냉각',
      description: '대부분의 테마가 하락 추세입니다. 새로운 테마 출현을 주시하세요.',
      color: 'text-red-400',
      barColor: 'bg-red-500',
    }
  }
  if (early > growth && early > peak) {
    return {
      label: '초기 탐색',
      description: '새로운 테마들이 형성 중입니다. 조기 포착 기회를 살펴보세요.',
      color: 'text-emerald-400',
      barColor: 'bg-emerald-500',
    }
  }
  if (avgScore >= 60) {
    return {
      label: '활발',
      description: '전반적인 테마 활성도가 높습니다.',
      color: 'text-emerald-400',
      barColor: 'bg-emerald-500',
    }
  }
  return {
    label: '보합',
    description: '뚜렷한 방향성 없이 혼조세를 보이고 있습니다.',
    color: 'text-slate-400',
    barColor: 'bg-slate-500',
  }
}

/** 테마 페이지 헤더 컴포넌트 */
function ThemesHeader({ summary }: ThemesHeaderProps) {
  const pulse = summary ? getMarketPulse(summary) : null

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="mb-12"
    >
      {/* 타이틀 */}
      <div className="flex items-center gap-3 mb-3">
        <div className="h-8 w-1 bg-emerald-500 rounded-full" />
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight">
          <span className="text-white">테마</span>
          <span className="text-emerald-400 ml-2">트래커</span>
        </h1>
      </div>

      {/* 시장 펄스 인사이트 */}
      {pulse && summary ? (
        <div className="ml-4 flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Activity className={`w-4 h-4 ${pulse.color}`} />
              <span className={`text-sm font-bold font-mono ${pulse.color}`}>
                {pulse.label}
              </span>
            </div>
            <span className="text-xs text-slate-600 font-mono" suppressHydrationWarning>
              {new Date().toLocaleDateString('ko-KR')} 기준
            </span>
          </div>
          <p className="text-sm text-slate-400">
            {pulse.description}
          </p>
        </div>
      ) : (
        <p className="text-slate-400 text-lg ml-4">
          AI가 추적하는 한국 주식시장 테마의 생명주기 분석
        </p>
      )}
    </motion.div>
  )
}

export default ThemesHeader
