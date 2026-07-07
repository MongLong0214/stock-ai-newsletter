'use client'

import { motion } from 'framer-motion'
import {
  Search,
  Newspaper,
  Activity,
  BarChart3,
  ArrowRight,
  Database,
  AlertTriangle,
  Shield,
  TrendingUp,
} from 'lucide-react'
import Link from 'next/link'
import AnimatedBackground from '@/components/animated-background'
import { GlassCard } from '@/components/tli/glass-card'
import { SCORE_COMPONENTS } from '@/lib/tli/constants/score-config'
import { STAGE_CONFIG } from '@/lib/tli/types/stage'
import type { DisplayStage } from '@/lib/tli/types'
import type { MethodologyMetricsSummary } from '@/lib/tli/methodology-metrics'
import { ModelPerformanceSection } from './model-performance-section'

const FADE_UP = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
}

const COMPONENT_ICONS = {
  interest: Search,
  newsMomentum: Newspaper,
  volatility: Activity,
  activity: BarChart3,
} as const

const COMPONENT_DESCRIPTIONS: Record<string, { source: string; method: string }> = {
  interest: {
    source: '네이버 DataLab 검색량',
    method: '최근 7일 평균 vs 30일 기준선 비교. 배치 내 자기 정규화 적용.',
  },
  newsMomentum: {
    source: '네이버 뉴스 기사 수',
    method: '이번 주 기사 수 vs 지난 주 기사 수 증감률 기반 산출.',
  },
  volatility: {
    source: '관심도 시계열 표준편차',
    method: '관심도 변동 폭을 측정하여 테마의 안정성을 평가.',
  },
  activity: {
    source: '네이버 증권 주가/거래량',
    method: '관련주 가격 변동률, 거래량, 데이터 커버리지를 함께 반영.',
  },
}

const LIFECYCLE_STAGES: { stage: DisplayStage; description: string; criteria: string }[] = [
  {
    stage: 'Emerging',
    description: '새로운 테마가 관심을 받기 시작하는 단계입니다. 검색량이 기준선 대비 상승하기 시작하며, 뉴스 기사가 나타나기 시작합니다.',
    criteria: '다른 단계 조건에 해당하지 않는 초기 진입 테마',
  },
  {
    stage: 'Growth',
    description: '관심이 지속 증가하는 성장 단계입니다. 검색량과 뉴스가 꾸준히 늘며, 관련주 거래량도 함께 늘어납니다.',
    criteria: '중상위 점수 + 안정 또는 상승 추세',
  },
  {
    stage: 'Peak',
    description: '관심이 최고조에 달한 정점 단계입니다. 검색량이 피크에 도달했으며, 과열 신호에 주의가 필요합니다.',
    criteria: '최상위 점수 도달 또는 높은 점수 + 뉴스 폭증 복합 시그널',
  },
  {
    stage: 'Decline',
    description: '관심이 감소하고 있는 하락 단계입니다. 검색량과 뉴스 빈도가 줄어들고 있습니다.',
    criteria: '하락 추세 + 이전 대비 점수 하락 + 뉴스 감소',
  },
  {
    stage: 'Dormant',
    description: '관심이 거의 없는 휴면 단계입니다. 점수가 매우 낮고 상승 추세가 아닌 테마입니다.',
    criteria: '매우 낮은 점수 + 비상승 추세',
  },
  {
    stage: 'Reigniting',
    description: '하락 후 다시 관심이 증가하는 재점화 테마입니다. 과거 Decline/Dormant 이력이 있으면서 다시 성장세를 보입니다.',
    criteria: 'Decline 이력 + 현재 Emerging/Growth로 전환',
  },
]

const DATA_SOURCES = [
  { name: '네이버 DataLab', usage: '키워드별 검색 관심도 (상대값)', icon: Search },
  { name: '네이버 뉴스', usage: '테마 관련 기사 수 및 모멘텀', icon: Newspaper },
  { name: '네이버 증권', usage: '관련주 주가, 거래량, 시가총액', icon: BarChart3 },
]

const LIMITATIONS = [
  '네이버 DataLab은 배치당 5개 키워드 제한이 있어, 배치 간 상대값 차이를 보정해도 비교 기준에 한계가 있습니다.',
  '7일 전망은 방향 참고 신호이며, 실제 성과는 최근 90일 검증 결과에서 확인할 수 있습니다.',
  '뉴스 모멘텀은 기사 수 기반입니다. 기사 내용의 긍정·부정은 따로 분석하지 않습니다.',
  '데이터 수집 주기에 따라 최신 시장 변화가 즉시 반영되지 않을 수 있습니다.',
]

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-xl font-bold text-white mb-1">{title}</h2>
      <p className="text-sm text-slate-400">{subtitle}</p>
    </div>
  )
}

interface MethodologyContentProps {
  modelPerformance: MethodologyMetricsSummary
}

function MethodologyContent({ modelPerformance }: MethodologyContentProps) {
  return (
    <div className="min-h-screen bg-black text-white relative break-keep">
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <AnimatedBackground />
      </div>

      <div className="fixed inset-0 pointer-events-none z-1 opacity-[0.04]">
        <div
          className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(16,185,129,0.04)_50%)] bg-size-[100%_4px] animate-[matrix-scan_8s_linear_infinite]"
          aria-hidden="true"
        />
      </div>

      <main className="relative z-10 py-16 lg:py-20">
        <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">

          {/* Header */}
          <motion.div
            {...FADE_UP}
            transition={{ duration: 0.5 }}
            className="text-center mb-16"
          >
            <p className="text-sm text-emerald-500 mb-4 font-medium">
              테마 추적 방식
            </p>
            <h1 className="text-3xl md:text-4xl font-extralight text-emerald-500/80 tracking-tight mb-4">
              테마 추적 알고리즘
            </h1>
            <p className="text-lg text-slate-300 font-light leading-relaxed">
              테마 점수와 방향 전망이 어떻게 계산되는지 공개합니다
            </p>
          </motion.div>

          {/* Section 1: Overview */}
          <motion.section
            {...FADE_UP}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mb-12"
          >
            <GlassCard className="p-6">
              <SectionHeader
                title="테마 점수란?"
                subtitle="검색·뉴스·시장 활동을 종합한 지표"
              />
              <p className="text-sm text-slate-300 leading-relaxed">
                테마 점수는 한국 주식시장 테마의 흐름을 0~100으로 나타낸 지표입니다.
                검색 관심도, 뉴스 모멘텀, 변동성, 활동성 4개 요소를 가중 합산하여
                0~100 사이의 점수를 산출하고, 이를 바탕으로 테마의 생명주기 단계를 판정합니다.
                가중치는 과거 데이터로 조정하며, 사용한 데이터와 산출 과정을 공개합니다.
              </p>
            </GlassCard>
          </motion.section>

          {/* Section 2: 4 Score Components */}
          <motion.section
            {...FADE_UP}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="mb-12"
          >
            <SectionHeader
              title="점수를 이루는 4가지 요소"
              subtitle="각 요소의 반영 비중과 계산 방식"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {SCORE_COMPONENTS.map((comp) => {
                const Icon = COMPONENT_ICONS[comp.key]
                const desc = COMPONENT_DESCRIPTIONS[comp.key]

                return (
                  <GlassCard key={comp.key} className="p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <div
                        className="flex items-center justify-center w-9 h-9 rounded-lg"
                        style={{
                          backgroundColor: `${comp.color}15`,
                          border: `1px solid ${comp.color}30`,
                        }}
                      >
                        <Icon className="w-4 h-4" style={{ color: comp.color }} />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-white">{comp.label}</h3>
                        <span
                          className="text-xs font-mono font-bold"
                          style={{ color: comp.color }}
                        >
                          {comp.weightLabel}
                        </span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div>
                        <p className="text-[11px] text-slate-500 uppercase tracking-wider mb-0.5">데이터 소스</p>
                        <p className="text-xs text-slate-300">{desc.source}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-slate-500 uppercase tracking-wider mb-0.5">산출 방식</p>
                        <p className="text-xs text-slate-300">{desc.method}</p>
                      </div>
                    </div>
                  </GlassCard>
                )
              })}
            </div>

            <div className="mt-4 p-4 rounded-xl border border-white/5 bg-white/[0.02]">
              <p className="text-xs text-slate-400 text-center">
                최종 점수는 4개 요소를 가중 합산해 계산합니다. 검증 성과가 좋았던 조합을 우선 반영합니다.
              </p>
            </div>
          </motion.section>

          {/* Section 2.5: Score Stabilization */}
          <motion.section
            {...FADE_UP}
            transition={{ duration: 0.5, delay: 0.17 }}
            className="mb-12"
          >
            <SectionHeader
              title="점수 안정화"
              subtitle="일시적 흔들림은 줄이고, 의미 있는 변화는 반영합니다"
            />
            <div className="space-y-4">
              <GlassCard className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-sky-500/10 border border-sky-500/20">
                    <TrendingUp className="w-4 h-4 text-sky-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">과거 데이터로 가중치 조정</h3>
                    <span className="text-xs text-slate-500">검증 데이터 기반</span>
                  </div>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  과거 데이터를 학습 구간과 검증 구간으로 나눠, 실제 결과와 더 잘 맞았던 가중치 조합을 사용합니다.
                  운영 중의 성과는 최근 90일 검증 결과로 계속 공개합니다.
                </p>
              </GlassCard>

              <GlassCard className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                    <Shield className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">갑작스러운 하락 완충</h3>
                    <span className="text-xs text-slate-500">거짓 하락 방지</span>
                  </div>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  점수가 내려갈 때 관심도, 뉴스, 방향성 신호를 함께 확인합니다.
                  여러 신호가 동시에 약해질 때만 하락을 크게 반영해,
                  데이터 공백이나 하루짜리 노이즈로 단계가 흔들리는 일을 줄입니다.
                </p>
              </GlassCard>

              <GlassCard className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-purple-500/10 border border-purple-500/20">
                    <Activity className="w-4 h-4 text-purple-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">테마 나이에 맞춘 반응 속도</h3>
                    <span className="text-xs text-slate-500">신생 테마는 빠르게, 성숙 테마는 안정적으로</span>
                  </div>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  새로 뜬 테마는 변화에 빠르게 반응하고,
                  오래 관측된 테마는 하루 변동에 덜 흔들리도록 조정합니다.
                  같은 점수라도 관측 기간에 따라 반응 속도를 다르게 둡니다.
                </p>
              </GlassCard>
            </div>
          </motion.section>

          {/* Section 3: Lifecycle Stages */}
          <motion.section
            {...FADE_UP}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mb-12"
          >
            <SectionHeader
              title="테마 상태 5단계와 재점화"
              subtitle="점수와 추세 기반 단계 판정"
            />
            <div className="space-y-3">
              {LIFECYCLE_STAGES.map(({ stage, description, criteria }) => {
                const config = STAGE_CONFIG[stage]

                return (
                  <GlassCard key={stage} className="p-4">
                    <div className="flex items-start gap-3">
                      <div
                        className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                        style={{ backgroundColor: config.color }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-sm font-semibold" style={{ color: config.color }}>
                            {config.label}
                          </h3>
                          <span className="text-[11px] text-slate-500 font-mono">
                            {config.labelEn}
                          </span>
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed mb-2">
                          {description}
                        </p>
                        <div className="flex items-center gap-1.5">
                          <ArrowRight className="w-3 h-3 text-slate-500" />
                          <p className="text-[11px] text-slate-500">{criteria}</p>
                        </div>
                      </div>
                    </div>
                  </GlassCard>
                )
              })}
            </div>
          </motion.section>

          {/* Section 4: Comparison */}
          <motion.section
            {...FADE_UP}
            transition={{ duration: 0.5, delay: 0.25 }}
            className="mb-12"
          >
            <SectionHeader
              title="유사 테마 비교"
              subtitle="과거에 비슷하게 움직인 테마를 찾습니다"
            />
            <GlassCard className="p-6">
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-white mb-2">요소 패턴 비교</h3>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    두 테마의 점수 구성 요소(관심도, 뉴스, 변동성, 활동성)를 비교하여
                    현재 상태의 유사도를 확인하고, 한쪽에서만 비슷해 보이는 경우도 보정합니다.
                  </p>
                </div>
                <div className="h-px bg-white/5" />
                <div>
                  <h3 className="text-sm font-semibold text-white mb-2">관심도 곡선 비교</h3>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    두 테마의 관심도 시계열 곡선 형태를 비교합니다.
                    값의 거리와 추세 방향을 함께 보며, 최소 14일 이상의 데이터가 있을 때 비교합니다.
                  </p>
                </div>
                <div className="h-px bg-white/5" />
                <div>
                  <h3 className="text-sm font-semibold text-white mb-2">키워드 비교</h3>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    두 테마의 키워드 구성을 비교하여 주제적 유사성을 측정합니다.
                    공통 키워드 비율과 키워드 가중치를 고려합니다.
                  </p>
                </div>
                <div className="h-px bg-white/5" />
                <div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    유사도 임계값은 자동 튜닝됩니다. 검증 데이터가 축적될수록
                    실제로 도움이 됐던 비교의 특성을 반영해, 충분히 비슷한 경우만 화면에 보여줍니다.
                  </p>
                </div>
              </div>
            </GlassCard>
          </motion.section>

          {/* Section 5: 7-Day Forecast */}
          <motion.section
            {...FADE_UP}
            transition={{ duration: 0.5, delay: 0.28 }}
            className="mb-12"
          >
            <SectionHeader
              title="7일 전망 · 방향 요약"
              subtitle="복잡한 생명주기 단계를 세 가지 방향으로 읽기 쉽게 정리합니다"
            />
            <GlassCard className="p-6">
              <div className="space-y-4">
                <p className="text-xs text-slate-300 leading-relaxed">
                  5개 생명주기 단계를 상승, 과열, 냉각 세 방향으로 묶어
                  앞으로 약 1주일 동안의 관심도 흐름을 참고 신호로 제공합니다.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                    <h4 className="text-sm font-semibold text-emerald-400 mb-1">상승</h4>
                    <p className="text-[11px] text-slate-400 mb-2">관심 형성·성장</p>
                    <p className="text-xs text-slate-300">관심이 증가하는 구간. 실측 지표와 함께 확인하는 시그널입니다.</p>
                  </div>
                  <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-4">
                    <h4 className="text-sm font-semibold text-orange-400 mb-1">과열</h4>
                    <p className="text-[11px] text-slate-400 mb-2">관심 정점</p>
                    <p className="text-xs text-slate-300">관심이 정점에 달한 구간. 하락 전환 가능성에 주의가 필요합니다.</p>
                  </div>
                  <div className="rounded-xl border border-slate-500/20 bg-slate-500/5 p-4">
                    <h4 className="text-sm font-semibold text-slate-400 mb-1">냉각</h4>
                    <p className="text-[11px] text-slate-400 mb-2">관심 감소·휴면</p>
                    <p className="text-xs text-slate-300">관심이 감소하는 구간. 참고 수준의 시그널로 활용하세요.</p>
                  </div>
                </div>
                <div className="p-3 rounded-lg border border-white/5 bg-white/[0.02]">
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    방향 전망의 실제 성과는 최근 90일 검증 결과로 공개합니다.
                    방향 라벨은 생명주기 상태를 요약한 참고 신호입니다.
                    시스템의 예측 가능 지평은 약 3~7일이며,
                    이를 넘어서는 전망은 제공하지 않습니다.
                  </p>
                </div>
              </div>
            </GlassCard>
          </motion.section>

          <ModelPerformanceSection metrics={modelPerformance} />

          {/* Section 6: Data Sources & Limitations */}
          <motion.section
            {...FADE_UP}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="mb-12"
          >
            <SectionHeader
              title="데이터 출처와 한계"
              subtitle="투명하게 공개하는 데이터 출처와 한계점"
            />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
              {DATA_SOURCES.map(({ name, usage, icon: SourceIcon }) => (
                <GlassCard key={name} className="p-4 text-center">
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 mx-auto mb-3">
                    <SourceIcon className="w-4 h-4 text-emerald-400" />
                  </div>
                  <h3 className="text-sm font-semibold text-white mb-1">{name}</h3>
                  <p className="text-xs text-slate-400">{usage}</p>
                </GlassCard>
              ))}
            </div>

            <GlassCard className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-semibold text-amber-400">알려진 한계</h3>
              </div>
              <ul className="space-y-2">
                {LIMITATIONS.map((text) => (
                  <li key={text} className="flex items-start gap-2">
                    <Database className="w-3 h-3 text-slate-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-slate-400 leading-relaxed">{text}</p>
                  </li>
                ))}
              </ul>
            </GlassCard>
          </motion.section>

          {/* Disclaimer */}
          <motion.section
            {...FADE_UP}
            transition={{ duration: 0.5, delay: 0.35 }}
            className="mb-8"
          >
            <div className="rounded-2xl border border-amber-500/20 bg-slate-900/40 backdrop-blur-xl p-5">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-amber-400 mb-2">투자 유의사항</h3>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    본 알고리즘과 산출 결과는 정보 제공 목적이며, 투자 자문이나 권유가 아닙니다.
                    높은 점수가 투자 적기를 의미하지 않으며, 오히려 과열 신호일 수 있습니다.
                    투자 판단은 본인의 책임 하에 신중히 결정하시기 바랍니다.
                  </p>
                </div>
              </div>
            </div>
          </motion.section>

          {/* Back link */}
          <motion.div
            {...FADE_UP}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="text-center"
          >
            <Link
              href="/themes"
              className="inline-flex items-center gap-2 text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              <ArrowRight className="w-4 h-4 rotate-180" />
              테마 목록으로 돌아가기
            </Link>
          </motion.div>
        </div>
      </main>
    </div>
  )
}

export default MethodologyContent
