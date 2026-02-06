'use client'

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { TrendingUp, Clock, Target, BarChart3 } from 'lucide-react'
import { type Stage, STAGE_CONFIG } from '@/lib/tli/types'
import { calculatePrediction } from '../_utils/calculate-prediction'

interface Comparison {
  pastTheme: string
  similarity: number
  currentDay: number
  pastPeakDay: number
  pastTotalDays: number
  estimatedDaysToPeak: number
}

interface ThemePredictionProps {
  firstSpikeDate: string | null
  comparisons: Comparison[]
  currentStage: Stage
}

/** 생명주기 예측 카드 컴포넌트 */
function ThemePrediction({
  firstSpikeDate,
  comparisons,
  currentStage,
}: ThemePredictionProps) {
  const prediction = useMemo(() => calculatePrediction(firstSpikeDate, comparisons), [firstSpikeDate, comparisons])

  if (!prediction) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="rounded-2xl border border-slate-700/30 bg-slate-900/40 backdrop-blur-xl p-6"
      >
        <p className="text-sm text-slate-500 text-center">비교 데이터가 충분하지 않아 예측을 생성할 수 없습니다</p>
      </motion.div>
    )
  }

  const stageConfig = STAGE_CONFIG[currentStage]

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.2 }}
      className="rounded-2xl border border-emerald-500/20 bg-slate-900/60 backdrop-blur-xl p-6"
    >
      <h2 className="text-lg font-bold mb-5">
        <span className="text-white">생명주기</span>
        <span className="text-emerald-400 ml-1">예측</span>
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <MetricCard
          icon={<Clock className="w-4 h-4" />}
          label="경과일"
          value={`D+${prediction.daysSinceSpike}`}
          color="#10B981"
        />
        <MetricCard
          icon={<Target className="w-4 h-4" />}
          label="피크까지"
          value={prediction.avgDaysToPeak > 0 ? `~${prediction.avgDaysToPeak}일` : '도달'}
          color="#F59E0B"
        />
        <MetricCard
          icon={<BarChart3 className="w-4 h-4" />}
          label="평균 유사도"
          value={`${Math.round(prediction.avgSimilarity * 100)}%`}
          color="#0EA5E9"
        />
        <MetricCard
          icon={<TrendingUp className="w-4 h-4" />}
          label="평균 주기"
          value={`${prediction.avgTotalDays}일`}
          color="#8B5CF6"
        />
      </div>

      {/* 타임라인 바 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-[10px] font-mono text-slate-500">
          <span>시작</span>
          <span>피크 (D+{prediction.avgPeakDay})</span>
          <span>종료 (D+{prediction.avgTotalDays})</span>
        </div>

        <div className="relative h-4 rounded-full bg-slate-800/60 border border-slate-700/30 overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{
              width: `${prediction.peakProgress}%`,
              background: 'linear-gradient(90deg, rgba(16,185,129,0.15) 0%, rgba(245,158,11,0.15) 100%)',
            }}
          />
          <div
            className="absolute inset-y-0 rounded-full"
            style={{
              left: `${prediction.peakProgress}%`,
              right: '0',
              background: 'linear-gradient(90deg, rgba(245,158,11,0.1) 0%, rgba(239,68,68,0.1) 100%)',
            }}
          />
          <div
            className="absolute top-0 h-full w-px bg-amber-500/50"
            style={{ left: `${prediction.peakProgress}%` }}
          />
          <div
            className="absolute top-0 w-1.5 h-1.5 bg-amber-500 rounded-full -translate-x-1/2"
            style={{ left: `${prediction.peakProgress}%` }}
          />
          <motion.div
            className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-slate-900"
            style={{
              left: `${prediction.currentProgress}%`,
              marginLeft: '-7px',
              backgroundColor: stageConfig.color,
              boxShadow: `0 0 8px ${stageConfig.color}60`,
            }}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.5, delay: 0.8 }}
          />
        </div>
        <div className="flex items-center justify-center gap-2 text-xs font-mono">
          <div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: stageConfig.color }}
          />
          <span className="text-slate-400">
            현재 위치: 전체 주기의{' '}
            <span className="text-white font-medium">
              {Math.round(prediction.currentProgress)}%
            </span>
          </span>
        </div>
      </div>
    </motion.div>
  )
}

/** 지표 카드 서브 컴포넌트 */
function MetricCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode
  label: string
  value: string
  color: string
}) {
  return (
    <div
      className="rounded-lg border p-3 text-center"
      style={{
        borderColor: `${color}20`,
        backgroundColor: `${color}08`,
      }}
    >
      <div
        className="flex items-center justify-center mb-1.5"
        style={{ color }}
      >
        {icon}
      </div>
      <div className="text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-0.5">
        {label}
      </div>
      <div
        className="text-sm font-mono font-bold"
        style={{ color }}
      >
        {value}
      </div>
    </div>
  )
}

export default ThemePrediction
