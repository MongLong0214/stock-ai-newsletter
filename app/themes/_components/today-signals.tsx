'use client'

import { motion } from 'framer-motion'
import { TrendingUp, AlertTriangle, Sparkles, Zap } from 'lucide-react'
import Link from 'next/link'
import type { ThemeRanking } from '@/lib/tli/types'
import { buildSignalCards, type SignalCardData } from './today-signals-logic'

interface TodaySignalsProps {
  ranking: ThemeRanking
}

interface SignalData extends SignalCardData {
  icon: React.ComponentType<{ className?: string }>
  color: string
  borderColor: string
  bgColor: string
  textColor: string
}

function computeSignals(ranking: ThemeRanking): SignalData[] {
  const signalConfig: Record<SignalCardData['key'], Omit<SignalData, keyof SignalCardData>> = {
    movers: {
      icon: TrendingUp,
      color: '#10B981',
      borderColor: 'border-emerald-500/20',
      bgColor: 'bg-emerald-500/5',
      textColor: 'text-emerald-400',
    },
    peak: {
      icon: AlertTriangle,
      color: '#EF4444',
      borderColor: 'border-red-500/20',
      bgColor: 'bg-red-500/5',
      textColor: 'text-red-400',
    },
    emerging: {
      icon: Sparkles,
      color: '#3B82F6',
      borderColor: 'border-blue-500/20',
      bgColor: 'bg-blue-500/5',
      textColor: 'text-blue-400',
    },
    reigniting: {
      icon: Zap,
      color: '#F97316',
      borderColor: 'border-orange-500/20',
      bgColor: 'bg-orange-500/5',
      textColor: 'text-orange-400',
    },
  }

  return buildSignalCards(ranking).map((signal) => ({
    ...signal,
    ...signalConfig[signal.key],
  }))
}

function SignalCard({ signal }: { signal: SignalData }) {
  const Icon = signal.icon
  const MAX_DISPLAY = 3

  return (
    <div
      className={`rounded-xl border ${signal.borderColor} ${signal.bgColor} p-4`}
    >
      <div className="flex items-center gap-2 mb-3">
        <div
          className="flex items-center justify-center w-7 h-7 rounded-lg"
          style={{ backgroundColor: `${signal.color}15`, border: `1px solid ${signal.color}30` }}
        >
          <Icon className={`w-3.5 h-3.5 ${signal.textColor}`} />
        </div>
        <h3 className={`text-sm font-semibold ${signal.textColor}`}>
          {signal.title}
        </h3>
        <span
          className="ml-auto text-xs font-mono font-bold tabular-nums"
          style={{ color: `${signal.color}99` }}
        >
          {signal.themes.length}
        </span>
      </div>

      <div className="space-y-1.5">
        {signal.themes.slice(0, MAX_DISPLAY).map((t) => (
          <Link
            key={t.id}
            href={`/themes/${t.id}`}
            className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-slate-900/40 hover:bg-slate-800/60 transition-colors group"
          >
            <span className="text-xs text-slate-300 truncate group-hover:text-white transition-colors">
              {t.name}
            </span>
            <span
              className="text-xs font-mono font-medium shrink-0"
              style={{ color: signal.color }}
            >
              {t.detail}
            </span>
          </Link>
        ))}
        {signal.themes.length > MAX_DISPLAY && (
          <p className="text-[11px] text-slate-500 text-center pt-1">
            외 {signal.themes.length - MAX_DISPLAY}개
          </p>
        )}
      </div>
    </div>
  )
}

function TodaySignals({ ranking }: TodaySignalsProps) {
  const signals = computeSignals(ranking)

  if (signals.length === 0) return null

  const today = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.15 }}
      className="mb-8"
    >
      <div className="rounded-2xl border border-emerald-500/10 bg-slate-900/30 backdrop-blur-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-white">
            오늘의 시그널
          </h2>
          <span className="text-xs text-slate-500 font-mono">{today}</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {signals.map((signal) => (
            <SignalCard key={signal.key} signal={signal} />
          ))}
        </div>

        <p className="text-[11px] text-slate-600 mt-4 text-center">
          시그널은 데이터 기반 현황이며 투자 권유가 아닙니다
        </p>
      </div>
    </motion.div>
  )
}

export default TodaySignals
