import type { Scenario } from '@/lib/tli/prediction'
import type { Phase } from '@/lib/tli/prediction'
import type { PredictionApiItem } from '@/lib/tli/predictions-v3-contract'

export interface ScenarioCardConfig {
  readonly label: string
  readonly accent: 'emerald' | 'slate' | 'red'
  readonly scenario: Scenario
}

export interface PeakTimingStat {
  readonly label: string
  readonly value: string
}

export interface PredictionSnapshotCardView {
  readonly statusLabel: string
  readonly probabilityLabel: string
  readonly ciLabel: string
  readonly trailingPrecisionLabel: string
  readonly phaseLabel: string
  readonly reasonLabel: string | null
}

export interface PredictionFallbackCardView {
  readonly statusLabel: string
  readonly stageLabel: string
  readonly directionLabel: '상승' | '보합' | '하락'
  readonly guidanceLabel: string
}

export type PredictionCardView = PredictionSnapshotCardView | PredictionFallbackCardView

type PredictionFallbackInput = {
  readonly stageKo: string
  readonly change7d: number
}

export function getPredictionSnapshotForPresentation(
  snapshot: PredictionApiItem | null | undefined,
  queryState: { readonly isLoading: boolean; readonly isError: boolean },
): PredictionApiItem | null | undefined {
  if (snapshot === null && (queryState.isLoading || queryState.isError)) return undefined
  return snapshot
}

export function shouldRenderPredictionPanel(
  firstSpikeDate: string | null,
  comparisonCount: number,
): boolean {
  return Boolean(firstSpikeDate) && comparisonCount >= 3
}

export function getScenarioCards(scenarios: {
  readonly best: Scenario
  readonly median: Scenario
  readonly worst: Scenario
}): ScenarioCardConfig[] {
  const { best, median, worst } = scenarios
  const allSame = best.themeName === median.themeName && median.themeName === worst.themeName
  const bestMedianSame = best.themeName === median.themeName
  const medianWorstSame = median.themeName === worst.themeName

  if (allSame) {
    return [
      { label: '참고 경로', scenario: median, accent: 'slate' },
    ]
  }

  if (bestMedianSame || medianWorstSame) {
    return [
      { label: '빠른 경로', scenario: best, accent: 'emerald' },
      { label: '긴 경로', scenario: worst, accent: 'red' },
    ]
  }

  return [
    { label: '빠른 경로', scenario: best, accent: 'emerald' },
    { label: '기준 경로', scenario: median, accent: 'slate' },
    { label: '긴 경로', scenario: worst, accent: 'red' },
  ]
}

export function getPeakTimingStat(input: {
  readonly phase: Phase
  readonly avgDaysToPeak: number
  readonly avgPeakDay: number
}): PeakTimingStat {
  if (input.phase === 'cooling') {
    return {
      label: '기록상 정점',
      value: input.avgPeakDay > 0 ? `${input.avgPeakDay}일차 부근` : '정점 이후',
    }
  }

  return {
    label: '예상 정점',
    value: input.avgDaysToPeak > 0 ? `약 ${input.avgDaysToPeak}일 후` : '정점 부근',
  }
}

export function formatPredictionSnapshotCard(
  snapshot: null,
  fallback: PredictionFallbackInput,
): PredictionFallbackCardView
export function formatPredictionSnapshotCard(
  snapshot: PredictionApiItem | undefined,
  fallback: PredictionFallbackInput,
): PredictionSnapshotCardView
export function formatPredictionSnapshotCard(
  snapshot: PredictionApiItem | null | undefined,
  fallback: PredictionFallbackInput,
): PredictionCardView
export function formatPredictionSnapshotCard(
  snapshot: PredictionApiItem | null | undefined,
  fallback: PredictionFallbackInput,
): PredictionCardView {
  if (snapshot === null) {
    return {
      statusLabel: '현재 상태',
      stageLabel: fallback.stageKo,
      directionLabel: fallback.change7d > 0 ? '상승' : fallback.change7d < 0 ? '하락' : '보합',
      guidanceLabel: '상세 안내는 검증 완료 후 제공됩니다',
    }
  }

  if (snapshot === undefined) {
    return {
      statusLabel: '평가 준비 중',
      probabilityLabel: '대기',
      ciLabel: '예상 범위 준비 중',
      trailingPrecisionLabel: '최근 검증: 아직 표시할 표본이 부족해요',
      phaseLabel: '준비 중',
      reasonLabel: null,
    }
  }

  return {
    statusLabel: snapshot.abstain ? buildAbstainStatus(snapshot.abstainReasons) : '상승 가능성',
    probabilityLabel: snapshot.pRise === null ? '대기' : formatPercent(snapshot.pRise),
    ciLabel: formatCi(snapshot),
    trailingPrecisionLabel: formatTrailingPrecision(snapshot.trailing90d),
    phaseLabel: formatPhase(snapshot.phase),
    reasonLabel: snapshot.abstain ? formatAbstainReasons(snapshot.abstainReasons) : null,
  }
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`
}

function formatCi(snapshot: PredictionApiItem): string {
  if (snapshot.ciLower === null || snapshot.ciUpper === null) return '예상 범위 준비 중'
  return `${formatPercentNumber(snapshot.ciLower)}-${formatPercent(snapshot.ciUpper)}`
}

function formatTrailingPrecision(
  trailing90d: PredictionApiItem['trailing90d'],
): string {
  if (trailing90d.topSignalPrecision === null) {
    return trailing90d.n > 0
      ? `최근 검증: 표본 ${trailing90d.n}개 집계 중`
      : '최근 검증: 아직 표시할 표본이 부족해요'
  }
  return `최근 검증: 상위 신호 ${formatPercent(trailing90d.topSignalPrecision)} 적중 (표본 ${trailing90d.n}개)`
}

function formatPercentNumber(value: number): number {
  return Math.round(value * 100)
}

function formatPhase(phase: PredictionApiItem['phase']): string {
  switch (phase) {
    case 'rising':
      return '상승'
    case 'hot':
      return '과열'
    case 'cooling':
      return '냉각'
    case null:
      return '준비 중'
  }
}

function buildAbstainStatus(reasons: readonly string[]): string {
  return reasons.includes('interest_history_lt_7') || reasons.includes('data_age_lt_7d')
    ? '데이터 7일 확보 중'
    : '평가 준비 중'
}

function formatAbstainReasons(reasons: readonly string[]): string | null {
  if (reasons.length === 0) return null
  return reasons.map(formatAbstainReason).join(', ')
}

function formatAbstainReason(reason: string): string {
  switch (reason) {
    case 'interest_history_lt_7':
    case 'data_age_lt_7d':
      return '관심도 데이터가 7일 미만'
    case 'missing_features_gt_3':
      return '필수 데이터가 부족함'
    case 'feature_missing_gt_30pct':
      return '누락 데이터가 많음'
    default:
      return '데이터 확인 필요'
  }
}
