import { useMemo } from 'react'
import { sliceByTimeRange, calcRangeDelta, type TimeRange } from '@/components/tli/lifecycle-curve-time-range'
import type { ThemeDetail } from '@/lib/tli/types'

/** 시간 범위에 따라 차트용 타임라인 데이터를 슬라이싱 */
export function useSlicedTimelines(theme: ThemeDetail | undefined, timeRange: TimeRange) {
  const slicedCurve = useMemo(() => {
    if (!theme) return []
    return sliceByTimeRange(theme.lifecycleCurve, timeRange)
  }, [theme, timeRange])

  const slicedNews = useMemo(() => {
    if (!theme?.newsTimeline) return undefined
    return sliceByTimeRange(theme.newsTimeline, timeRange)
  }, [theme, timeRange])

  const slicedInterest = useMemo(() => {
    if (!theme?.interestTimeline) return undefined
    return sliceByTimeRange(theme.interestTimeline, timeRange)
  }, [theme, timeRange])

  const slicedCommunity = useMemo(() => {
    if (!theme?.communityTimeline) return undefined
    return sliceByTimeRange(theme.communityTimeline, timeRange)
  }, [theme, timeRange])

  const rangeDelta = useMemo(() => {
    if (slicedCurve.length < 2) return null
    return calcRangeDelta(slicedCurve, timeRange)
  }, [slicedCurve, timeRange])

  return { slicedCurve, slicedNews, slicedInterest, slicedCommunity, rangeDelta }
}
