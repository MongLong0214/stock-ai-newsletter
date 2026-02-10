/**
 * 타임라인 처리 — 날짜 기반 데이터를 상대 일수로 변환 및 정규화
 */

import { daysBetween } from '../normalize'

// ---------------------------------------------------------------------------
// 타입 정의
// ---------------------------------------------------------------------------

export interface TimeSeriesPoint {
  day: number
  value: number
}

// ---------------------------------------------------------------------------
// 타임라인 처리
// ---------------------------------------------------------------------------

/** 날짜 기반 데이터를 first_spike_date 기준 상대 일수로 변환 */
export function normalizeTimeline(
  data: Array<{ date: string; value: number }>,
  firstSpikeDate: string,
): TimeSeriesPoint[] {
  return data.map(d => ({
    day: daysBetween(firstSpikeDate, d.date),
    value: d.value,
  }))
}

/** peak 값 기준으로 0-1 정규화 */
export function normalizeValues(data: TimeSeriesPoint[]): TimeSeriesPoint[] {
  let peak = 1
  for (const d of data) {
    if (d.value > peak) peak = d.value
  }
  return data.map(d => ({ day: d.day, value: d.value / peak }))
}

/** 타임라인에서 최대값의 day를 반환. 데이터 없음 또는 모든 값 0이면 -1 반환 */
export function findPeakDay(data: TimeSeriesPoint[]): number {
  if (data.length === 0) return -1
  let maxIdx = 0
  for (let i = 1; i < data.length; i++) {
    if (data[i].value > data[maxIdx].value) {
      maxIdx = i
    }
  }
  if (data[maxIdx].value === 0) return -1
  return data[maxIdx].day
}

const RESAMPLE_POINTS = 50

/**
 * 곡선을 lifecycle 백분율 기반으로 리샘플링 (위상 정렬).
 * 두 곡선의 길이가 달라도 동일한 lifecycle 비율 구간끼리 비교 가능.
 */
export function resampleCurve(curve: TimeSeriesPoint[], numPoints: number = RESAMPLE_POINTS): number[] {
  if (curve.length === 0) return new Array(numPoints).fill(0)
  if (curve.length === 1) return new Array(numPoints).fill(curve[0].value)
  const maxDay = curve[curve.length - 1].day
  if (maxDay <= 0) return new Array(numPoints).fill(curve[0].value)

  const resampled: number[] = []
  for (let i = 0; i < numPoints; i++) {
    const targetDay = (i / (numPoints - 1)) * maxDay
    let lo = 0
    let hi = curve.length - 1
    while (lo < hi - 1) {
      const mid = Math.floor((lo + hi) / 2)
      if (curve[mid].day <= targetDay) lo = mid
      else hi = mid
    }
    if (curve[hi].day <= targetDay || lo === hi) {
      resampled.push(curve[hi].value)
    } else {
      const span = curve[hi].day - curve[lo].day
      const t = span > 0 ? (targetDay - curve[lo].day) / span : 0
      resampled.push(curve[lo].value * (1 - t) + curve[hi].value * t)
    }
  }
  return resampled
}
