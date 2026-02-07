/** 테마 비교 및 분석 모듈 */

import { daysBetween } from './normalize';

interface TimeSeriesPoint {
  day: number;
  value: number;
}

export function normalizeTimeline(
  data: Array<{ date: string; value: number }>,
  firstSpikeDate: string,
): TimeSeriesPoint[] {
  return data.map(d => ({
    day: daysBetween(firstSpikeDate, d.date),
    value: d.value,
  }));
}

export function normalizeValues(data: TimeSeriesPoint[]): TimeSeriesPoint[] {
  const peak = Math.max(...data.map(d => d.value), 1);
  return data.map(d => ({ day: d.day, value: d.value / peak }));
}

export function pearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 7) return 0; // 1주 미만 데이터로는 패턴 비교 불가

  const xSlice = x.slice(0, n);
  const ySlice = y.slice(0, n);

  const avgX = xSlice.reduce((a, b) => a + b, 0) / n;
  const avgY = ySlice.reduce((a, b) => a + b, 0) / n;

  // 상수 타임라인 스킵 (변동 없는 데이터는 상관분석 무의미)
  // 값이 0-1 정규화 범위이므로 임계값도 그에 맞춤 (0.01 = 1% 이내 변동은 상수 취급)
  const stdX = Math.sqrt(xSlice.reduce((s, v) => s + (v - avgX) ** 2, 0) / n);
  const stdY = Math.sqrt(ySlice.reduce((s, v) => s + (v - avgY) ** 2, 0) / n);
  if (stdX < 0.01 || stdY < 0.01) return 0;

  let num = 0;
  let denX = 0;
  let denY = 0;

  for (let i = 0; i < n; i++) {
    const dx = xSlice[i] - avgX;
    const dy = ySlice[i] - avgY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }

  const denominator = Math.sqrt(denX * denY);
  if (denominator === 0) return 0;

  return num / denominator;
}

export function findPeakDay(data: TimeSeriesPoint[]): number {
  if (data.length === 0) return 0;
  let maxIdx = 0;
  for (let i = 1; i < data.length; i++) {
    if (data[i].value > data[maxIdx].value) {
      maxIdx = i;
    }
  }
  return data[maxIdx].day;
}

const MAX_LIFECYCLE_DAYS = 365;

export function compareThemes(
  currentData: TimeSeriesPoint[],
  pastData: TimeSeriesPoint[],
  pastThemeName: string,
): {
  similarity: number;
  currentDay: number;
  pastPeakDay: number;
  pastTotalDays: number;
  estimatedDaysToPeak: number;
  message: string;
} {
  const normalizedCurrent = normalizeValues(currentData);
  const normalizedPast = normalizeValues(pastData);

  // 최소 공통 길이 사용 (짧은 쪽에 맞춤)
  const commonLength = Math.min(normalizedCurrent.length, normalizedPast.length);
  if (commonLength < 7) {
    return { similarity: 0, currentDay: 0, pastPeakDay: 0, pastTotalDays: 0, estimatedDaysToPeak: 0, message: '' };
  }

  const currentValues = normalizedCurrent.slice(0, commonLength).map(d => d.value);
  const pastValues = normalizedPast.slice(0, commonLength).map(d => d.value);

  const similarity = pearsonCorrelation(currentValues, pastValues);
  const currentDay = currentData.length > 0 ? currentData[currentData.length - 1].day : 0;
  const pastPeakDay = findPeakDay(normalizedPast);
  // pastTotalDays 상한 365일
  const pastTotalDays = pastData.length > 0
    ? Math.min(pastData[pastData.length - 1].day, MAX_LIFECYCLE_DAYS)
    : 0;
  const estimatedDaysToPeak = Math.max(0, pastPeakDay - currentDay);

  const similarityPercent = Math.round(Math.abs(similarity) * 100);
  const message = estimatedDaysToPeak > 0
    ? `${pastThemeName}과(와) ${similarityPercent}% 유사. Peak까지 약 ${estimatedDaysToPeak}일 예상.`
    : `${pastThemeName}과(와) ${similarityPercent}% 유사. 이미 Peak 구간 통과.`;

  return {
    similarity: Math.round(similarity * 1000) / 1000,
    currentDay,
    pastPeakDay,
    pastTotalDays,
    estimatedDaysToPeak,
    message,
  };
}
