/** 점수 구성 카드 컴포넌트 */
'use client'

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, Sparkles } from 'lucide-react'
import ScoreBreakdown from '@/components/tli/score-breakdown'
import { GlassCard } from '@/components/tli/glass-card'
import { SCORE_COMPONENTS } from '@/lib/tli/constants/score-config'
import { formatScoreChange } from '@/lib/tli/format-utils'
import type { ThemeDetail } from '@/lib/tli/types'

interface ScoreCardProps {
  score: ThemeDetail['score']
}

function ScoreCard({ score }: ScoreCardProps) {
  const dominantComponent = useMemo(() => {
    const contributions = SCORE_COMPONENTS.map(c => ({
      key: c.key,
      contribution: score.components[c.key] * c.weight,
      label: c.label,
    }))
    return contributions.reduce((max, curr) =>
      curr.contribution > max.contribution ? curr : max
    )
  }, [score.components])

  return (
    <GlassCard className="p-6 h-full overflow-y-auto custom-scroll">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
      >
        {/* 헤더: 총점 + 단계 */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-sm font-mono text-slate-400 uppercase tracking-wider mb-2">종합 점수</h2>
            <div className="flex items-baseline gap-3">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.3 }}
                className="text-5xl font-black text-white tabular-nums"
              >
                {score.value}
              </motion.div>
              <span className="text-2xl font-mono text-slate-600">/100</span>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <ChangePill label="24H" value={score.change24h} delay={0.4} />
            <ChangePill label="7D" value={score.change7d} delay={0.5} />
          </div>
        </div>

        {/* 주도 요인 인사이트 */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.6 }}
          className="mb-6 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 flex items-start gap-3"
        >
          <Sparkles className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-mono text-emerald-400 mb-1">주도 요인</p>
            <p className="text-sm font-mono text-slate-200">
              <span className="font-bold text-emerald-300">{dominantComponent.label}</span>
              이(가) 점수를 주도하고 있어요
              <span className="text-slate-500 ml-1">(기여도 {dominantComponent.contribution.toFixed(1)}pt)</span>
            </p>
          </div>
        </motion.div>

        {/* 신뢰도 표시 */}
        {score.confidence && score.confidence.level !== 'high' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.7 }}
            className={`mb-6 rounded-xl border p-4 flex items-start gap-3 ${
              score.confidence.level === 'low'
                ? 'border-amber-500/20 bg-amber-500/5'
                : 'border-slate-500/20 bg-slate-500/5'
            }`}
          >
            <span className="text-sm">⚠️</span>
            <div>
              <p className={`text-xs font-mono mb-1 ${
                score.confidence.level === 'low' ? 'text-amber-400' : 'text-slate-400'
              }`}>
                점수 신뢰도: {score.confidence.level === 'low' ? '낮음' : '보통'}
              </p>
              <p className="text-sm font-mono text-slate-400">
                {score.confidence.reason}
              </p>
            </div>
          </motion.div>
        )}

        {/* 점수 구성 상세 */}
        <div className="mb-4">
          <h3 className="text-xs font-mono text-slate-500 uppercase tracking-wider mb-4">구성 요소 분석</h3>
          <ScoreBreakdown components={score.components} raw={score.raw} />
        </div>
      </motion.div>
    </GlassCard>
  )
}

function ChangePill({ label, value, delay }: { label: string; value: number; delay: number }) {
  const isPositive = value > 0
  const isZero = value === 0

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, delay }}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
        isZero ? 'bg-slate-800/40 border-slate-700/30'
          : isPositive ? 'bg-emerald-500/10 border-emerald-500/30'
          : 'bg-red-500/10 border-red-500/30'
      }`}
    >
      <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wide min-w-[24px]">{label}</span>
      {!isZero && (
        <div className={isPositive ? 'text-emerald-400' : 'text-red-400'}>
          {isPositive ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
        </div>
      )}
      <span className={`text-sm font-black font-mono tabular-nums ${
        isZero ? 'text-slate-500' : isPositive ? 'text-emerald-400' : 'text-red-400'
      }`}>
        {formatScoreChange(value)}
      </span>
    </motion.div>
  )
}

export default ScoreCard
