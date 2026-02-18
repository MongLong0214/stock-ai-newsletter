import type { ChartConfig } from '@/components/ui/chart'
import { COMPARISON_COLORS } from '@/lib/tli/constants/comparison-colors'
import { STAGE_CONFIG } from '@/lib/tli/types/stage'
import type { DisplayStage } from '@/lib/tli/types'

/** 레이어 토글 키 */
export type LayerKey = 'news' | 'interest' | 'comparison' | 'zones' | 'community'

export interface LifecycleCurveProps {
  currentData: Array<{ date: string; score: number }>
  comparisonData?: Array<{
    themeName: string
    data: Array<{ day: number; value: number }>
    similarity: number
  }>
  newsTimeline?: Array<{ date: string; count: number }>
  interestTimeline?: Array<{ date: string; value: number }>
  communityTimeline?: Array<{ date: string; blog: number; discussion: number }>
  height?: number
  showZones?: boolean
  visibleLayers?: Set<LayerKey>
  hoveredLayer?: LayerKey | null
  reduceMotion?: boolean
}

/* ─── 스테이지 구간 상수 ─── */

export const STAGE_ZONES = [
  { y1: 0,  y2: 20, stage: 'Dormant' as const,  color: STAGE_CONFIG.Dormant.color },
  { y1: 20, y2: 40, stage: 'Decline' as const,  color: STAGE_CONFIG.Decline.color },
  { y1: 40, y2: 60, stage: 'Emerging' as const,  color: STAGE_CONFIG.Emerging.color },
  { y1: 60, y2: 80, stage: 'Growth' as const,   color: STAGE_CONFIG.Growth.color },
  { y1: 80, y2: 100, stage: 'Peak' as const,     color: STAGE_CONFIG.Peak.color },
] as const

/** 존 중앙 라벨 (각 구간 중심에 배치) */
export const ZONE_LABELS = [
  { y: 10, label: '휴면',  color: STAGE_CONFIG.Dormant.color },
  { y: 30, label: '하락',  color: STAGE_CONFIG.Decline.color },
  { y: 50, label: '초기',  color: STAGE_CONFIG.Emerging.color },
  { y: 70, label: '성장',  color: STAGE_CONFIG.Growth.color },
  { y: 90, label: '정점',  color: STAGE_CONFIG.Peak.color },
] as const

export const comparisonColors = COMPARISON_COLORS

/* ─── 공유 유틸리티 ─── */

/** 점수 → 스테이지 판정 (차트 + 툴팁 공용) */
export function scoreToStage(score: number): DisplayStage {
  if (score >= 80) return 'Peak'
  if (score >= 60) return 'Growth'
  if (score >= 40) return 'Emerging'
  if (score >= 20) return 'Decline'
  return 'Dormant'
}

/** 데이터 최고점 (날짜 + 점수) */
export function findPeak(
  currentData: Array<{ date: string; score: number }>
): { date: string; score: number } | undefined {
  if (currentData.length === 0) return undefined
  const peakIndex = currentData.reduce(
    (maxIdx, item, idx, arr) => (item.score > arr[maxIdx].score ? idx : maxIdx),
    0
  )
  const peak = currentData[peakIndex]
  return peak ? { date: peak.date, score: peak.score } : undefined
}

export function getMaxNewsCount(newsTimeline?: Array<{ date: string; count: number }>): number {
  return newsTimeline?.reduce((max, item) => Math.max(max, item.count), 0) ?? 0
}

/* ─── 차트 데이터 준비 ─── */

export function prepareChartConfig(
  comparisonData?: LifecycleCurveProps['comparisonData'],
  hasCommunity?: boolean
): ChartConfig {
  const chartConfig: ChartConfig = {
    current: { label: '현재 테마', color: '#10B981' },
    news: { label: '뉴스 볼륨', color: '#0EA5E9' },
    interest: { label: '관심도', color: '#8B5CF6' },
  }

  if (hasCommunity) {
    chartConfig.communityBlog = { label: '블로그', color: '#EC4899' }
    chartConfig.communityDiscussion = { label: '토론', color: '#A855F7' }
  }

  comparisonData?.forEach((comp, idx) => {
    chartConfig[`comparison${idx}`] = {
      label: comp.themeName,
      color: comparisonColors[idx % comparisonColors.length],
    }
  })

  return chartConfig
}

/** 차트용 병합 데이터 생성 (현재 점수 + 뉴스 + 관심도 + 커뮤니티 + 비교 테마) */
export function mergeChartData(
  currentData: Array<{ date: string; score: number }>,
  newsTimeline?: Array<{ date: string; count: number }>,
  interestTimeline?: Array<{ date: string; value: number }>,
  comparisonData?: LifecycleCurveProps['comparisonData'],
  communityTimeline?: Array<{ date: string; blog: number; discussion: number }>
) {
  const newsMap = new Map(newsTimeline?.map(n => [n.date, n.count]))
  const interestMap = new Map(interestTimeline?.map(i => [i.date, i.value]))
  const communityMap = new Map(communityTimeline?.map(c => [c.date, c]))

  return currentData.map((item, idx) => {
    const merged: Record<string, string | number | null> = {
      date: item.date,
      current: item.score,
      prevScore: idx > 0 ? currentData[idx - 1].score : null,
    }

    if (newsMap.has(item.date)) merged.news = newsMap.get(item.date)!
    if (interestMap.has(item.date)) merged.interest = interestMap.get(item.date)!

    const community = communityMap.get(item.date)
    if (community) {
      merged.communityBlog = community.blog
      merged.communityDiscussion = community.discussion
    }

    // 비교 테마: 비율 기반 매핑
    comparisonData?.forEach((comp, compIdx) => {
      if (comp.data.length === 0) return
      const currentTotalDays = currentData.length - 1
      const pastTotalDays = comp.data[comp.data.length - 1]?.day || 1
      const ratio = currentTotalDays > 0 ? idx / currentTotalDays : 0
      const targetDay = ratio * pastTotalDays

      let closest = comp.data[0]
      let minDist = Math.abs(closest.day - targetDay)
      for (const point of comp.data) {
        const dist = Math.abs(point.day - targetDay)
        if (dist < minDist) {
          minDist = dist
          closest = point
        }
      }
      merged[`comparison${compIdx}`] = closest.value
    })

    return merged
  })
}
