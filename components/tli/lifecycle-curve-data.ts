import type { ChartConfig } from '@/components/ui/chart'

export interface LifecycleCurveProps {
  currentData: Array<{ date: string; score: number }>
  comparisonData?: Array<{
    themeName: string
    data: Array<{ day: number; value: number }>
    similarity: number
  }>
  newsTimeline?: Array<{ date: string; count: number }>
  interestTimeline?: Array<{ date: string; value: number }>
  height?: number
}

export const comparisonColors = ['#0EA5E9', '#F59E0B', '#8B5CF6']

export function prepareChartConfig(comparisonData?: LifecycleCurveProps['comparisonData']): ChartConfig {
  const chartConfig: ChartConfig = {
    current: {
      label: '현재 테마',
      color: '#10B981',
    },
    news: {
      label: '뉴스 볼륨',
      color: '#F59E0B',
    },
    interest: {
      label: '관심도',
      color: '#8B5CF6',
    },
  }

  comparisonData?.forEach((comp, idx) => {
    chartConfig[`comparison${idx}`] = {
      label: comp.themeName,
      color: comparisonColors[idx % comparisonColors.length],
    }
  })

  return chartConfig
}

export function mergeChartData(
  currentData: Array<{ date: string; score: number }>,
  newsTimeline?: Array<{ date: string; count: number }>,
  interestTimeline?: Array<{ date: string; value: number }>,
  comparisonData?: LifecycleCurveProps['comparisonData']
) {
  const newsMap = new Map(newsTimeline?.map(n => [n.date, n.count]))
  const interestMap = new Map(interestTimeline?.map(i => [i.date, i.value]))

  return currentData.map((item, idx) => {
    const merged: Record<string, string | number> = {
      date: item.date,
      current: item.score,
    }

    if (newsMap.has(item.date)) {
      merged.news = newsMap.get(item.date)!
    }

    if (interestMap.has(item.date)) {
      merged.interest = interestMap.get(item.date)!
    }

    comparisonData?.forEach((comp, compIdx) => {
      if (comp.data.length === 0) return

      // 현재 테마의 전체 기간 대비 비교 테마의 day를 비율로 매핑
      const currentTotalDays = currentData.length - 1
      const pastTotalDays = comp.data[comp.data.length - 1]?.day || 1

      // 현재 인덱스의 비율 위치
      const ratio = currentTotalDays > 0 ? idx / currentTotalDays : 0

      // 비교 테마에서 같은 비율의 day 찾기
      const targetDay = ratio * pastTotalDays

      // 가장 가까운 데이터 포인트 찾기
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

export function findPeakDate(currentData: Array<{ date: string; score: number }>): string | undefined {
  const peakIndex = currentData.reduce(
    (maxIdx, item, idx, arr) =>
      item.score > arr[maxIdx].score ? idx : maxIdx,
    0
  )
  return currentData[peakIndex]?.date
}

export function getMaxNewsCount(newsTimeline?: Array<{ date: string; count: number }>): number {
  return newsTimeline?.reduce((max, item) => Math.max(max, item.count), 0) ?? 0
}
