/** 생명주기 참고 지표 — 메인 컴포넌트 */
'use client'

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Clock, Target, BarChart3, Lightbulb, ChevronRight, ShieldAlert } from 'lucide-react'
import { GlassCard } from '@/components/tli/glass-card'
import { calculatePrediction } from '@/lib/tli/prediction'
import type { ComparisonResult, Stage } from '@/lib/tli/types'
import type { AnalogEvidencePayload, ForecastPayload } from '@/lib/tli/forecast/api-payloads'
import type { ThemeForecastControl } from '@/lib/tli/types/api'
import {
  CONFIDENCE_CONFIG,
  RISK_CONFIG,
  INSIGHT_BG,
  INSIGHT_ICON_COLOR,
  PHASE_LABELS,
  PHASE_COLORS,
} from './config'
import { StatCell, MomentumCell, ScenarioCard } from './sub-components'
import { getScenarioCards } from './presentation'

const containerVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1, y: 0,
    transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number], staggerChildren: 0.08 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
}

interface ThemePredictionProps {
  firstSpikeDate: string | null
  comparisons: ComparisonResult[]
  score?: number
  stage?: Stage
  forecast?: ForecastPayload
  analogEvidence?: AnalogEvidencePayload
  forecastControl?: ThemeForecastControl
}

function resolveForecastRiskLabel(severeDrawdownProb: number) {
  if (severeDrawdownProb >= 0.3) return '높음'
  if (severeDrawdownProb >= 0.15) return '보통'
  return '낮음'
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`
}

function ServedForecastPrediction({
  forecast,
  analogEvidence,
  forecastControl,
  comparisons,
}: {
  forecast: ForecastPayload
  analogEvidence: AnalogEvidencePayload | undefined
  forecastControl: ThemeForecastControl | undefined
  comparisons: ComparisonResult[]
}) {
  const confidenceCfg = CONFIDENCE_CONFIG[forecast.confidenceLabel]
  const themeNames = new Map(comparisons.map((comparison) => [comparison.pastThemeId, comparison.pastTheme]))

  return (
    <GlassCard className="p-5 sm:p-6">
      <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-5">
        <motion.div variants={itemVariants} className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold">
              <span className="text-white">확률형</span>
              <span className="text-emerald-400 ml-1">예측</span>
            </h2>
            {forecastControl?.version && (
              <p className="text-xs font-mono text-slate-500 mt-1">
                serving {forecastControl.version}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-mono px-2.5 py-1 rounded-full border ${confidenceCfg.bg} ${confidenceCfg.text} ${confidenceCfg.border}`}>
              {confidenceCfg.label}
            </span>
            {analogEvidence?.lowEvidenceBadge && (
              <span className="text-[10px] font-mono px-2.5 py-1 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-300">
                낮은 근거
              </span>
            )}
            {forecast.abstained && (
              <span className="text-[10px] font-mono px-2.5 py-1 rounded-full border border-red-500/30 bg-red-500/10 text-red-300">
                보수적 서빙
              </span>
            )}
          </div>
        </motion.div>

        <motion.div variants={itemVariants} className="grid grid-cols-3 gap-3">
          {[5, 10, 20].map((horizon) => (
            <div key={horizon} className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
              <div className="text-[11px] font-mono text-slate-500">정점 {horizon}일 이내</div>
              <div className="mt-2 text-2xl font-mono font-bold text-emerald-400">
                {formatPercent(forecast.probabilities[horizon as 5 | 10 | 20])}
              </div>
            </div>
          ))}
        </motion.div>

        <motion.div variants={itemVariants} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatCell icon={<Target className="w-4 h-4" />} label="기대 정점" value={`약 ${forecast.expectedPeakDay}일`} color="#10B981" />
          <StatCell icon={<Clock className="w-4 h-4" />} label="중앙 정점 시점" value={`${forecast.survival.medianTimeToPeak}일`} color="#0EA5E9" />
          <StatCell icon={<BarChart3 className="w-4 h-4" />} label="급락 위험" value={resolveForecastRiskLabel(forecast.postPeakRisk.severeDrawdownProb)} color="#F59E0B" />
        </motion.div>

        {forecast.abstained && (
          <motion.div variants={itemVariants} className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 mt-0.5 shrink-0 text-red-300" />
            <div className="space-y-1">
              <p className="text-sm font-mono text-red-200">
                근거가 충분하지 않아 확신형 문구를 비활성화했습니다.
              </p>
              <p className="text-xs font-mono text-red-300/80">
                {forecast.abstentionReasons.join(' · ')}
              </p>
            </div>
          </motion.div>
        )}

        {analogEvidence && (
          <motion.div variants={itemVariants} className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-white">근거 패키지</h3>
              <span className="text-[10px] font-mono px-2 py-1 rounded-full border border-slate-700 text-slate-300">
                품질 {analogEvidence.evidenceQuality}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3 text-xs font-mono">
              <div className="rounded-lg bg-slate-950/60 p-3">
                <div className="text-slate-500">근거 수</div>
                <div className="mt-1 text-white">{analogEvidence.analogCount}</div>
              </div>
              <div className="rounded-lg bg-slate-950/60 p-3">
                <div className="text-slate-500">집중도 Gini</div>
                <div className="mt-1 text-white">{analogEvidence.concentrationGini.toFixed(2)}</div>
              </div>
              <div className="rounded-lg bg-slate-950/60 p-3">
                <div className="text-slate-500">Top-1 비중</div>
                <div className="mt-1 text-white">{formatPercent(analogEvidence.top1Weight)}</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {analogEvidence.topAnalogs.slice(0, 3).map((analog) => (
                <span
                  key={`${analog.episodeId}-${analog.themeId}`}
                  className="rounded-full border border-slate-700 bg-slate-950/70 px-3 py-1 text-[11px] font-mono text-slate-300"
                >
                  {themeNames.get(analog.themeId) ?? analog.themeId} · {analog.peakDay}일
                </span>
              ))}
            </div>
          </motion.div>
        )}

        <motion.p variants={itemVariants} className="text-[10px] font-mono text-slate-500 text-center pt-1">
          확률, 불확실성, 근거 패키지를 함께 노출하는 forecast_control_v1 서빙 경로입니다
        </motion.p>
      </motion.div>
    </GlassCard>
  )
}

function ThemePrediction({
  firstSpikeDate,
  comparisons,
  score,
  stage,
  forecast,
  analogEvidence,
  forecastControl,
}: ThemePredictionProps) {
  const prediction = useMemo(
    () => (forecast ? null : calculatePrediction(firstSpikeDate, comparisons, undefined, score, stage)),
    [forecast, firstSpikeDate, comparisons, score, stage],
  )

  if (forecast) {
    return (
      <ServedForecastPrediction
        forecast={forecast}
        analogEvidence={analogEvidence}
        forecastControl={forecastControl}
        comparisons={comparisons}
      />
    )
  }

  if (!prediction) return null

  const confidenceCfg = CONFIDENCE_CONFIG[prediction.confidence]
  const riskCfg = RISK_CONFIG[prediction.riskLevel]
  const RiskIcon = riskCfg.icon
  const phaseColors = PHASE_COLORS[prediction.phase]

  return (
    <GlassCard className="p-5 sm:p-6">
      <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-5">
        {/* 1. 헤더 */}
        <motion.div variants={itemVariants} className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">
            <span className="text-white">테마 흐름</span>
            <span className="text-emerald-400 ml-1">분석</span>
          </h2>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-mono px-2.5 py-1 rounded-full border ${confidenceCfg.bg} ${confidenceCfg.text} ${confidenceCfg.border}`}>
              {confidenceCfg.label}
            </span>
            <span className={`text-[10px] font-mono px-2.5 py-1 rounded-full border flex items-center gap-1 ${riskCfg.bg} ${riskCfg.text} ${riskCfg.border}`}>
              <RiskIcon className="w-3 h-3" />
              주의 {riskCfg.label}
            </span>
          </div>
        </motion.div>

        {/* 2. 핵심 인사이트 */}
        <motion.div variants={itemVariants} className={`rounded-xl border p-4 flex items-start gap-3 ${INSIGHT_BG[prediction.riskLevel]}`}>
          <Lightbulb className={`w-5 h-5 mt-0.5 shrink-0 ${INSIGHT_ICON_COLOR[prediction.riskLevel]}`} />
          <p className="text-sm font-mono text-slate-200 leading-relaxed">{prediction.keyInsight}</p>
        </motion.div>

        {/* 3. Phase Timeline (3단계) */}
        <motion.div variants={itemVariants} className="space-y-3">
          <div className="flex items-center gap-1.5">
            {PHASE_LABELS.map((phase, idx) => {
              const isActive = phase.id === prediction.phase
              const isPast = PHASE_LABELS.findIndex(p => p.id === prediction.phase) > idx
              const colors = PHASE_COLORS[phase.id]
              return (
                <div key={phase.id} className="flex-1 flex flex-col items-center gap-1.5">
                  <div className="w-full flex items-center gap-0.5">
                    <div className={`h-2 w-full rounded-full transition-all duration-500 ${
                      isActive ? `${colors.bg} ring-2 ${colors.ring}` : isPast ? `${colors.bg} opacity-40` : 'bg-slate-800'
                    }`} />
                    {idx < PHASE_LABELS.length - 1 && (
                      <ChevronRight className={`w-3 h-3 shrink-0 ${isPast || isActive ? 'text-slate-500' : 'text-slate-700'}`} />
                    )}
                  </div>
                  <span className={`text-[10px] font-mono ${isActive ? colors.text + ' font-bold' : 'text-slate-600'}`}>{phase.label}</span>
                  {isActive && (
                    <motion.div
                      className={`w-1.5 h-1.5 rounded-full ${colors.bg}`}
                      initial={{ scale: 0 }}
                      animate={{ scale: [1, 1.4, 1] }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                    />
                  )}
                </div>
              )
            })}
          </div>
          <p className={`text-xs font-mono text-center ${phaseColors.text}`}>{prediction.phaseMessage}</p>
        </motion.div>

        {/* 4. 종합 진행률 (과거 유사 테마 평균 주기 대비 연속적 위치) */}
        {prediction.avgTotalDays > 0 && (
          <motion.div variants={itemVariants} className="space-y-1.5">
            <div className="flex items-center justify-between text-[10px] font-mono text-slate-500">
              <span>시작</span>
              {prediction.peakProgress > 0 && <span>평균 정점 ({prediction.avgPeakDay}일)</span>}
              <span>평균 종료 (~{prediction.avgTotalDays}일)</span>
            </div>
            <div className="relative h-2.5 rounded-full bg-slate-800">
              {prediction.peakProgress > 0 && (
                <div className="absolute top-0 h-full w-0.5 bg-amber-500/60 z-10" style={{ left: `${prediction.peakProgress}%` }} />
              )}
              <motion.div
                className={`absolute top-0 h-full rounded-full ${phaseColors.bg} opacity-30`}
                initial={{ width: 0 }}
                animate={{ width: `${prediction.currentProgress}%` }}
                transition={{ duration: 1, delay: 0.3 }}
              />
              <motion.div
                className={`absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full ${phaseColors.bg} border-2 border-slate-900 z-20`}
                style={{ left: `${prediction.currentProgress}%`, marginLeft: '-6px' }}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.4, delay: 0.8 }}
              />
            </div>
            <p className="text-[10px] font-mono text-slate-400 text-center">
              비슷한 테마 평균 주기 대비 {Math.round(prediction.currentProgress)}% 경과
            </p>
          </motion.div>
        )}

        {/* 5. 통계 그리드 */}
        <motion.div variants={itemVariants} className="grid grid-cols-2 gap-3">
          <StatCell icon={<Clock className="w-4 h-4" />} label="경과일" value={prediction.daysSinceSpike > 365 ? '1년+' : `${prediction.daysSinceSpike}일`} color="#10B981" />
          <StatCell icon={<Target className="w-4 h-4" />} label="예상 정점" value={prediction.avgDaysToPeak > 0 ? `약 ${prediction.avgDaysToPeak}일 후` : '정점 부근'} color="#F59E0B" />
          <StatCell icon={<BarChart3 className="w-4 h-4" />} label="평균 유사도" value={`${Math.round(prediction.avgSimilarity * 100)}%`} color="#0EA5E9" />
          <MomentumCell momentum={prediction.momentum} />
        </motion.div>

        {/* 6. 시나리오 카드 (동일 테마 중복 시 축소) */}
        {(() => {
          const cards = getScenarioCards(prediction.scenarios)
          const gridClass = cards.length === 1
            ? 'grid grid-cols-1 gap-3'
            : cards.length === 2
              ? 'grid grid-cols-1 sm:grid-cols-2 gap-3'
              : 'grid grid-cols-1 sm:grid-cols-3 gap-3'

          return (
            <motion.div variants={itemVariants} className={gridClass}>
              {cards.map((card) => (
                <ScenarioCard
                  key={`${card.label}-${card.scenario.themeName}`}
                  label={card.label}
                  scenario={card.scenario}
                  accent={card.accent}
                />
              ))}
            </motion.div>
          )
        })()}

        {/* 7. 면책 조항 */}
        <motion.p variants={itemVariants} className="text-[10px] font-mono text-slate-500 text-center pt-1">
          비슷한 과거 테마({prediction.comparisonCount}개) 기반 참고 정보이며, 실제와 다를 수 있습니다
        </motion.p>
      </motion.div>
    </GlassCard>
  )
}

export default ThemePrediction
