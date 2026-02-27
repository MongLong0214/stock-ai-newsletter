/** 예측 계산 헬퍼 함수들 — 3-Phase (Rising/Hot/Cooling) 기반 메시지 */

import type { Phase } from './prediction'

export function buildPhaseMessage(phase: Phase, avgDaysToPeak: number, score?: number): string {
  if (score !== undefined && score >= 75) return `점수 ${score}점 · 정점 구간 통과 중`
  if (score !== undefined && score >= 55) return `점수 ${score}점 · 성장 구간 진입`

  switch (phase) {
    case 'rising':
      return avgDaysToPeak > 0
        ? `정점까지 약 ${avgDaysToPeak}일 남음`
        : '상승 구간이에요'
    case 'hot':
      return '정점 구간을 지나고 있어요'
    case 'cooling':
      return '방향 전환 가능성이 있어요'
  }
}

export function buildKeyInsight(phase: Phase, avgDaysToPeak: number, score?: number): string {
  if (score !== undefined && score >= 75) {
    return `현재 점수 ${score}점으로 관심이 매우 높아요. 이후 하락 전환에 유의하세요`
  }
  if (score !== undefined && score >= 55) {
    return avgDaysToPeak > 0
      ? `현재 점수 ${score}점으로 성장 중이에요. 비슷한 테마 기준 정점까지 약 ${avgDaysToPeak}일 정도 남았어요`
      : `현재 점수 ${score}점으로 성장 중이에요`
  }
  switch (phase) {
    case 'rising':
      return avgDaysToPeak > 0
        ? `비슷한 테마 기준, 상승 단계로 정점까지 약 ${avgDaysToPeak}일 여유가 있어요`
        : '비슷한 테마 기준, 상승 단계로 정점까지 여유가 있어요'
    case 'hot':
      return '현재 정점 구간으로 보여요. 이후 하락 전환에 유의하세요'
    case 'cooling':
      return '관심도가 감소 추세예요. 참고 수준의 시그널입니다'
  }
}
