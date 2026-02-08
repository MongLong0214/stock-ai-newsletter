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
  Hash,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react'
import StageBadge from '@/components/tli/stage-badge'
import LifecycleScore from '@/components/tli/lifecycle-score'
import type { ThemeDetail } from '@/lib/tli/types'

interface DetailHeaderProps {
  theme: ThemeDetail
}

/* ── 점수 컴포넌트 설정 (가중치 포함) ────────────────────────────────── */

const COMPONENT_CONFIG = [
  { key: 'interest' as const, label: '관심도', icon: Eye, color: '#10B981', weight: 40 },
  { key: 'newsMomentum' as const, label: '뉴스 모멘텀', icon: Newspaper, color: '#0EA5E9', weight: 25 },
  { key: 'sentiment' as const, label: '뉴스 논조', icon: MessageSquare, color: '#F59E0B', weight: 20 },
  { key: 'volatility' as const, label: '변동성', icon: LineChart, color: '#8B5CF6', weight: 15 },
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

function formatVolume(n: number | null): string {
  if (n == null) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString('ko-KR')
}

/* ── 메인 컴포넌트 ─────────────────────────────────────────────────── */

function DetailHeader({ theme }: DetailHeaderProps) {
  const shouldReduceMotion = useReducedMotion()

  const themeAge = useMemo(() => daysSince(theme.firstSpikeDate), [theme.firstSpikeDate])

  // 기사 논조 요약
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

          {/* 키워드 태그 */}
          {theme.keywords && theme.keywords.length > 0 && (
            <div className="flex items-center flex-wrap gap-1.5 mt-3">
              <Hash className="w-3.5 h-3.5 text-slate-600 shrink-0" />
              {theme.keywords.slice(0, 8).map((keyword, i) => (
                <motion.span
                  key={i}
                  initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.05, duration: 0.3 }}
                  className="px-2 py-0.5 rounded-md bg-slate-800/40 border border-slate-700/40 text-[10px] font-mono text-slate-400 hover:border-emerald-500/40 hover:text-emerald-400 transition-colors"
                >
                  {keyword}
                </motion.span>
              ))}
              {theme.keywords.length > 8 && (
                <span className="text-[10px] font-mono text-slate-600">+{theme.keywords.length - 8}</span>
              )}
            </div>
          )}

          {/* 구조화된 미니 대시보드 그리드 */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mt-4">
            {/* 테마 나이 */}
            {themeAge != null && (
              <MetricCard
                icon={<Calendar className="w-4 h-4" />}
                label="테마 나이"
                value={`D+${themeAge}`}
                color="emerald"
              />
            )}

            {/* 24시간 변화 */}
            <MetricCard
              icon={theme.score.change24h >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
              label="24H 변화"
              value={theme.score.change24h === 0 && theme.lifecycleCurve.length < 2 ? '—' : `${theme.score.change24h >= 0 ? '+' : ''}${theme.score.change24h.toFixed(1)}`}
              color={theme.score.change24h >= 0 ? 'emerald' : 'red'}
            />

            {/* 7일 변화 */}
            <MetricCard
              icon={theme.score.change7d >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
              label="7D 변화"
              value={theme.score.change7d === 0 ? '—' : `${theme.score.change7d >= 0 ? '+' : ''}${theme.score.change7d.toFixed(1)}`}
              color={theme.score.change7d >= 0 ? 'emerald' : 'red'}
            />

            {/* 종목 수 */}
            <MetricCard
              icon={<BarChart3 className="w-4 h-4" />}
              label="관련 종목"
              value={`${theme.stockCount}개`}
              color="sky"
            />

            {/* 뉴스 수 */}
            <MetricCard
              icon={<Newspaper className="w-4 h-4" />}
              label="뉴스"
              value={`${theme.newsCount}건`}
              color="sky"
            />

            {/* 유사 패턴 */}
            {theme.comparisons.length > 0 && (
              <MetricCard
                icon={<Activity className="w-4 h-4" />}
                label="유사 패턴"
                value={`${theme.comparisons.length}개`}
                color="purple"
              />
            )}

            {/* 기사 논조 */}
            {sentiment && (
              <div className={`rounded-xl border p-3 ${sentiment.bg}`}>
                <div className="flex items-center gap-1.5 mb-1">
                  <MessageSquare className="w-3.5 h-3.5 text-slate-500" />
                  <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wide">기사 논조</span>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className={`text-sm font-black ${sentiment.color}`}>{sentiment.label}</span>
                  <span className="text-[10px] font-mono text-slate-600">({sentiment.count}건)</span>
                </div>
              </div>
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

      {/* ── Row 2: 점수 구성 + 주요 종목 ─────────────────────────────── */}
      <div className="mt-6 pt-6 border-t border-slate-700/40 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 점수 구성 (가중치 포함) */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-mono text-slate-400 uppercase tracking-wider">점수 구성 요소</h3>
            <span className="text-[10px] font-mono text-slate-600">가중치 적용됨</span>
          </div>
          <div className="space-y-3">
            {COMPONENT_CONFIG.map(({ key, label, icon: Icon, color, weight }) => {
              const value = theme.score.components[key]
              const pct = Math.round(value * 100)
              const contribution = Math.round((value * weight))
              return (
                <div key={key} className="group">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4" style={{ color }} />
                      <span className="text-xs font-mono text-slate-300">{label}</span>
                      <span className="text-[10px] font-mono text-slate-600">×{weight}%</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-slate-600">기여도 {contribution}pt</span>
                      <span className="text-xs font-mono font-bold" style={{ color }}>
                        {pct}
                      </span>
                    </div>
                  </div>
                  <div className="relative h-3 rounded-full bg-slate-800/60 overflow-hidden border border-slate-700/40">
                    <motion.div
                      className="absolute inset-0 rounded-full"
                      style={{
                        background: `linear-gradient(90deg, ${color}40 0%, ${color} 100%)`,
                      }}
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(pct, 100)}%` }}
                      transition={{ duration: 0.8, ease: 'easeOut' }}
                    />
                    <motion.div
                      className="absolute inset-y-0 left-0 w-1 rounded-full"
                      style={{ backgroundColor: color }}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1, x: `${Math.min(pct, 100) * 0.99}%` }}
                      transition={{ duration: 0.8, ease: 'easeOut' }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* 주요 종목 */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-mono text-slate-400 uppercase tracking-wider">주요 변동 종목</h3>
            {topMovers.length > 0 && (
              <span className="text-[10px] font-mono text-slate-600">등락률 기준</span>
            )}
          </div>
          {topMovers.length > 0 ? (
            <div className="space-y-2.5">
              {topMovers.map((stock, idx) => {
                const pct = stock.priceChangePct ?? 0
                const isUp = pct >= 0
                return (
                  <motion.div
                    key={stock.symbol}
                    initial={shouldReduceMotion ? false : { opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.1, duration: 0.4 }}
                    className={`rounded-xl border p-3.5 group hover:border-emerald-500/40 transition-all ${
                      isUp ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-bold text-white truncate">{stock.name}</span>
                          <span className="text-[10px] font-mono text-slate-600 shrink-0">{stock.market}</span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] font-mono text-slate-500">
                          <span>₩{formatPrice(stock.currentPrice)}</span>
                          <span className="text-slate-700">•</span>
                          <span>거래량 {formatVolume(stock.volume)}</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <div className={`flex items-center gap-1 px-2 py-0.5 rounded-md ${
                          isUp ? 'bg-emerald-500/20' : 'bg-red-500/20'
                        }`}>
                          {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          <span className={`text-xs font-black ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
                            {isUp ? '+' : ''}{pct.toFixed(2)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )
              })}
              {theme.stocks.length > 3 && (
                <p className="text-[10px] font-mono text-slate-600 text-center pt-1">
                  외 {theme.stocks.length - 3}개 종목 포함
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-32 rounded-xl bg-slate-800/20 border border-slate-700/20">
              <BarChart3 className="w-8 h-8 text-slate-700 mb-2" />
              <p className="text-xs font-mono text-slate-600">시세 데이터 수집 중</p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}

/* ── 서브 컴포넌트 ──────────────────────────────────────────────────── */

/** 미니 메트릭 카드 */
function MetricCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode
  label: string
  value: string
  color: 'emerald' | 'red' | 'sky' | 'purple' | 'amber'
}) {
  const colorClasses = {
    emerald: 'border-emerald-500/30 bg-emerald-500/5',
    red: 'border-red-500/30 bg-red-500/5',
    sky: 'border-sky-500/30 bg-sky-500/5',
    purple: 'border-purple-500/30 bg-purple-500/5',
    amber: 'border-amber-500/30 bg-amber-500/5',
  }

  const iconColorClasses = {
    emerald: 'text-emerald-500',
    red: 'text-red-500',
    sky: 'text-sky-500',
    purple: 'text-purple-500',
    amber: 'text-amber-500',
  }

  const valueColorClasses = {
    emerald: 'text-emerald-400',
    red: 'text-red-400',
    sky: 'text-sky-400',
    purple: 'text-purple-400',
    amber: 'text-amber-400',
  }

  return (
    <div className={`rounded-xl border p-3 hover:scale-105 transition-transform ${colorClasses[color]}`}>
      <div className="flex items-center gap-1.5 mb-1">
        <div className={iconColorClasses[color]}>{icon}</div>
        <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wide">{label}</span>
      </div>
      <div className={`text-sm font-black ${valueColorClasses[color]}`}>{value}</div>
    </div>
  )
}

export default DetailHeader