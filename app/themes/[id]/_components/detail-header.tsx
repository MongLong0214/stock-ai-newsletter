'use client'

import { useMemo } from 'react'
import { useReducedMotion, motion } from 'framer-motion'
import {
  Zap,
  Calendar,
  TrendingUp,
  TrendingDown,
  Newspaper,
  BarChart3,
  Activity,
  Eye,
  MessageSquare,
  LineChart,
} from 'lucide-react'
import StageBadge from '@/components/tli/stage-badge'
import LifecycleScore from '@/components/tli/lifecycle-score'
import type { ThemeDetail } from '@/lib/tli/types'

interface DetailHeaderProps {
  theme: ThemeDetail
}

/* ── 점수 컴포넌트 설정 ────────────────────────────────────────────── */

const COMPONENT_CONFIG = [
  { key: 'interest' as const, label: '관심도', icon: Eye, color: '#10B981' },
  { key: 'newsMomentum' as const, label: '뉴스', icon: Newspaper, color: '#0EA5E9' },
  { key: 'sentiment' as const, label: '감성', icon: MessageSquare, color: '#F59E0B' },
  { key: 'volatility' as const, label: '변동성', icon: LineChart, color: '#8B5CF6' },
]

/* ── 유틸 ──────────────────────────────────────────────────────────── */

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null
  const diff = Date.now() - new Date(dateStr).getTime()
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)))
}

function formatPrice(n: number | null): string {
  if (n == null) return '—'
  return n.toLocaleString('ko-KR')
}

/* ── 메인 컴포넌트 ─────────────────────────────────────────────────── */

function DetailHeader({ theme }: DetailHeaderProps) {
  const shouldReduceMotion = useReducedMotion()

  const themeAge = useMemo(() => daysSince(theme.firstSpikeDate), [theme.firstSpikeDate])

  // 뉴스 감성 요약
  const sentiment = useMemo(() => {
    if (!theme.recentNews || theme.recentNews.length === 0) return null
    const scores = theme.recentNews
      .filter(a => a.sentimentScore != null)
      .map(a => a.sentimentScore!)
    if (scores.length === 0) return null
    const avg = scores.reduce((s, v) => s + v, 0) / scores.length
    return {
      avg,
      label: avg > 0.1 ? '긍정적' : avg < -0.1 ? '부정적' : '중립',
      color: avg > 0.1 ? 'text-emerald-400' : avg < -0.1 ? 'text-red-400' : 'text-slate-400',
      bg: avg > 0.1 ? 'bg-emerald-500/10 border-emerald-500/20' : avg < -0.1 ? 'bg-red-500/10 border-red-500/20' : 'bg-slate-500/10 border-slate-700/30',
      count: scores.length,
    }
  }, [theme.recentNews])

  // 상위 종목 (등락률 기준 상위 3개)
  const topMovers = useMemo(() => {
    return [...theme.stocks]
      .filter(s => s.priceChangePct != null)
      .sort((a, b) => Math.abs(b.priceChangePct!) - Math.abs(a.priceChangePct!))
      .slice(0, 3)
  }, [theme.stocks])

  return (
    <motion.div
      initial={shouldReduceMotion ? false : { opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="rounded-2xl border border-emerald-500/20 bg-slate-900/60 backdrop-blur-xl p-4 sm:p-6 mb-6 sm:mb-8"
    >
      {/* ── Row 1: 타이틀 + 게이지 ──────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 sm:gap-6">
        <div className="flex-1 min-w-0">
          {/* 타이틀 + 뱃지 */}
          <div className="flex items-center flex-wrap gap-2 sm:gap-3 mb-2">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black">{theme.name}</h1>
            <StageBadge stage={theme.score.stage} showIcon size="md" />
            {theme.score.isReigniting && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-mono">
                <Zap className="w-3 h-3" />
                재점화
              </span>
            )}
          </div>
          {theme.nameEn && (
            <p className="text-slate-500 text-lg">{theme.nameEn}</p>
          )}
          {theme.description && (
            <p className="text-slate-400 mt-2 max-w-2xl text-sm">{theme.description}</p>
          )}

          {/* 핵심 지표 칩 */}
          <div className="flex items-center flex-wrap gap-2 mt-4">
            {themeAge != null && (
              <StatChip icon={<Calendar className="w-3.5 h-3.5" />} label={`D+${themeAge}`} color="text-emerald-400" />
            )}
            <StatChip
              icon={theme.score.change24h >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
              label={`24H ${theme.score.change24h === 0 && theme.lifecycleCurve.length < 2 ? '—' : `${theme.score.change24h >= 0 ? '+' : ''}${theme.score.change24h.toFixed(1)}`}`}
              color={theme.score.change24h >= 0 ? 'text-emerald-400' : 'text-red-400'}
            />
            <StatChip
              icon={theme.score.change7d >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
              label={`7D ${theme.score.change7d === 0 ? '—' : `${theme.score.change7d >= 0 ? '+' : ''}${theme.score.change7d.toFixed(1)}`}`}
              color={theme.score.change7d >= 0 ? 'text-emerald-400' : 'text-red-400'}
            />
            <StatChip
              icon={<BarChart3 className="w-3.5 h-3.5" />}
              label={`종목 ${theme.stockCount}개`}
              color="text-slate-300"
            />
            <StatChip
              icon={<Newspaper className="w-3.5 h-3.5" />}
              label={`뉴스 ${theme.newsCount}건`}
              color="text-slate-300"
            />
            {theme.comparisons.length > 0 && (
              <StatChip
                icon={<Activity className="w-3.5 h-3.5" />}
                label={`유사 패턴 ${theme.comparisons.length}개`}
                color="text-slate-300"
              />
            )}
            {sentiment && (
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-mono ${sentiment.bg} ${sentiment.color}`}>
                <MessageSquare className="w-3 h-3" />
                감성 {sentiment.label}
                <span className="text-[10px] opacity-60">({sentiment.count}건)</span>
              </span>
            )}
          </div>
        </div>

        <div className="flex-shrink-0">
          <LifecycleScore
            score={theme.score.value}
            stage={theme.score.stage}
            change24h={theme.score.change24h}
            size="lg"
          />
        </div>
      </div>

      {/* ── Row 2: 점수 구성 바 + 주요 종목 ─────────────────────────── */}
      <div className="mt-5 pt-5 border-t border-slate-700/40 grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* 점수 구성 미니 바 */}
        <div>
          <h3 className="text-[11px] font-mono text-slate-500 uppercase tracking-wider mb-3">Score Components</h3>
          <div className="space-y-2.5">
            {COMPONENT_CONFIG.map(({ key, label, icon: Icon, color }) => {
              const value = theme.score.components[key]
              // 모든 컴포넌트 값이 0~1 범위이므로 일관되게 * 100
              const pct = Math.round(value * 100)
              return (
                <div key={key} className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 w-16 shrink-0">
                    <Icon className="w-3.5 h-3.5" style={{ color }} />
                    <span className="text-[11px] font-mono text-slate-400">{label}</span>
                  </div>
                  <div className="flex-1 h-2 rounded-full bg-slate-800/60 overflow-hidden">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ backgroundColor: color }}
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(pct, 100)}%` }}
                      transition={{ duration: 0.8, ease: 'easeOut' }}
                    />
                  </div>
                  <span className="text-xs font-mono font-medium w-10 text-right" style={{ color }}>
                    {pct}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* 주요 종목 */}
        <div>
          <h3 className="text-[11px] font-mono text-slate-500 uppercase tracking-wider mb-3">Top Movers</h3>
          {topMovers.length > 0 ? (
            <div className="space-y-2">
              {topMovers.map((stock) => {
                const pct = stock.priceChangePct ?? 0
                const isUp = pct >= 0
                return (
                  <div
                    key={stock.symbol}
                    className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-800/40 border border-slate-700/30"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isUp ? 'bg-emerald-400' : 'bg-red-400'}`} />
                      <span className="text-sm text-white font-medium truncate">{stock.name}</span>
                      <span className="text-[10px] font-mono text-slate-600 shrink-0">{stock.market}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs font-mono text-slate-400">{formatPrice(stock.currentPrice)}</span>
                      <span className={`text-xs font-mono font-semibold ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
                        {isUp ? '+' : ''}{pct.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                )
              })}
              {theme.stocks.length > 3 && (
                <p className="text-[10px] font-mono text-slate-600 text-right">
                  외 {theme.stocks.length - 3}개 종목
                </p>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-20 rounded-lg bg-slate-800/20 border border-slate-700/20">
              <p className="text-xs font-mono text-slate-600">시세 데이터 수집 중</p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}

/* ── 지표 칩 서브 컴포넌트 ─────────────────────────────────────────── */

function StatChip({ icon, label, color }: { icon: React.ReactNode; label: string; color: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800/60 border border-slate-700/30 text-xs font-mono ${color}`}>
      {icon}
      {label}
    </span>
  )
}

export default DetailHeader
