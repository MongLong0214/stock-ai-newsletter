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
} from 'lucide-react'
import Link from 'next/link'
import AnimatedBackground from '@/components/animated-background'
import { GlassCard } from '@/components/tli/glass-card'
import { SCORE_COMPONENTS } from '@/lib/tli/constants/score-config'
import { STAGE_CONFIG } from '@/lib/tli/types/stage'
import type { DisplayStage } from '@/lib/tli/types'

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
    method: '관련주 가격 변동률, 거래량 강도, 데이터 커버리지 교차 시그널.',
  },
}

const LIFECYCLE_STAGES: { stage: DisplayStage; description: string; criteria: string }[] = [
  {
    stage: 'Emerging',
    description: '새로운 테마가 관심을 받기 시작하는 단계입니다. 검색량이 기준선 대비 상승하기 시작하며, 뉴스 기사가 나타나기 시작합니다.',
    criteria: '관심도 상승 초기 + 뉴스 모멘텀 양(+)',
  },
  {
    stage: 'Growth',
    description: '관심이 빠르게 증가하는 성장 단계입니다. 검색량과 뉴스가 지속 증가하며, 관련주 거래량도 함께 늘어납니다.',
    criteria: '관심도 가속 상승 + 높은 뉴스 모멘텀',
  },
  {
    stage: 'Peak',
    description: '관심이 최고조에 달한 정점 단계입니다. 검색량이 피크에 도달했으며, 과열 신호에 주의가 필요합니다.',
    criteria: '관심도 정점 근처 + 모멘텀 둔화 시작',
  },
  {
    stage: 'Decline',
    description: '관심이 감소하고 있는 하락 단계입니다. 검색량과 뉴스 빈도가 줄어들고 있습니다.',
    criteria: '관심도 하락 추세 + 뉴스 모멘텀 음(-)',
  },
  {
    stage: 'Dormant',
    description: '관심이 거의 없는 휴면 단계입니다. 품질 게이트 기준 미달로 목록에서 제외됩니다.',
    criteria: '점수 50 미만 또는 신뢰도 low',
  },
  {
    stage: 'Reigniting',
    description: '하락 후 다시 관심이 증가하는 재점화 테마입니다. 과거 Decline/Dormant 이력이 있으면서 다시 성장세를 보입니다.',
    criteria: 'Decline/Dormant 이력 + 현재 관심도 재상승',
  },
]

const DATA_SOURCES = [
  { name: '네이버 DataLab', usage: '키워드별 검색 관심도 (상대값)', icon: Search },
  { name: '네이버 뉴스', usage: '테마 관련 기사 수 및 모멘텀', icon: Newspaper },
  { name: '네이버 증권', usage: '관련주 주가, 거래량, 시가총액', icon: BarChart3 },
]

const LIMITATIONS = [
  '네이버 DataLab은 배치당 5개 키워드 제한으로, 배치 간 상대값 차이를 자기 정규화로 보정합니다. 정밀도에 한계가 있습니다.',
  '과거 유사 테마 비교의 예측 적중률은 약 47%입니다. 이 한계를 인지하고, 예측이 아닌 현황 진단에 집중하고 있습니다.',
  '뉴스 모멘텀은 기사 수 기반이며, 기사의 긍정/부정 감성은 분석하지 않습니다.',
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

function MethodologyContent() {
  return (
    <div className="min-h-screen bg-black text-white relative">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
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
            <p className="text-sm text-emerald-500 uppercase tracking-wider mb-4 font-medium">
              Tracking Algorithm
            </p>
            <h1 className="text-3xl md:text-4xl font-extralight text-emerald-500/80 tracking-tight mb-4">
              테마 트래킹 알고리즘
            </h1>
            <p className="text-lg text-slate-300 font-light leading-relaxed">
              TLI(Theme Lifecycle Index) 점수 산출 과정을 완전히 공개합니다
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
                title="TLI란?"
                subtitle="Theme Lifecycle Index"
              />
              <p className="text-sm text-slate-300 leading-relaxed">
                TLI는 한국 주식시장 테마의 생명주기를 정량화한 지수입니다.
                검색 관심도, 뉴스 모멘텀, 변동성, 활동성 4개 요소를 가중 합산하여
                0~100 사이의 점수를 산출하고, 이를 바탕으로 테마의 생명주기 단계를 판정합니다.
                모든 데이터는 공개 소스에서 수집되며, 산출 과정을 투명하게 공개합니다.
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
              title="4요소 점수 산출"
              subtitle="각 요소의 가중치와 산출 방식"
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
                최종 점수 = (관심도 × 0.40) + (뉴스 모멘텀 × 0.35) + (변동성 × 0.10) + (활동성 × 0.15)
              </p>
            </div>
          </motion.section>

          {/* Section 3: Lifecycle Stages */}
          <motion.section
            {...FADE_UP}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mb-12"
          >
            <SectionHeader
              title="생명주기 5단계 + 재점화"
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
              subtitle="3-Pillar 유사도 분석"
            />
            <GlassCard className="p-6">
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-white mb-2">Feature Similarity (Mutual Rank)</h3>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    두 테마의 점수 구성 요소(관심도, 뉴스, 변동성, 활동성)를 비교하여
                    특성 프로필이 얼마나 유사한지 측정합니다. 상호 순위 기반으로
                    비대칭적 유사성도 포착합니다.
                  </p>
                </div>
                <div className="h-px bg-white/5" />
                <div>
                  <h3 className="text-sm font-semibold text-white mb-2">Curve Similarity (RMSE + Pearson)</h3>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    두 테마의 관심도 시계열 곡선 형태를 비교합니다.
                    RMSE로 절대 거리를, 피어슨 상관계수로 추세 방향 유사성을 측정하며,
                    최소 14일 이상의 데이터가 필요합니다.
                  </p>
                </div>
                <div className="h-px bg-white/5" />
                <div>
                  <h3 className="text-sm font-semibold text-white mb-2">Keyword Similarity</h3>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    두 테마의 키워드 구성을 비교하여 주제적 유사성을 측정합니다.
                    공통 키워드 비율과 키워드 가중치를 고려합니다.
                  </p>
                </div>
                <div className="h-px bg-white/5" />
                <div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    유사도 임계값은 자동 튜닝됩니다. 검증 데이터가 축적될수록
                    정확도가 높았던 비교의 특성을 학습하여 임계값을 조정합니다.
                    현재 기본 임계값은 0.40입니다.
                  </p>
                </div>
              </div>
            </GlassCard>
          </motion.section>

          {/* Section 5: Data Sources & Limitations */}
          <motion.section
            {...FADE_UP}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="mb-12"
          >
            <SectionHeader
              title="데이터 소스 & 한계"
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
