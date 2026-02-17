/** 예측 계산 헬퍼 함수들 — Stage-derived Phase 기반 메시지 */

import type { Phase } from './prediction'

export function buildPhaseMessage(phase: Phase, avgDaysToPeak: number, score?: number): string {
  if (score !== undefined && score >= 75) return `점수 ${score}점 · 정점 구간 통과 중`
  if (score !== undefined && score >= 55) return `점수 ${score}점 · 성장 구간 진입`

  switch (phase) {
    case 'pre-peak':
      return avgDaysToPeak > 0
        ? `정점까지 약 ${avgDaysToPeak}일 남음`
        : '아직 초기 성장 구간이에요'
    case 'near-peak':
      return avgDaysToPeak > 0
        ? `약 ${avgDaysToPeak}일 내 정점 도달 예상`
        : '정점 구간에 가까워지고 있어요'
    case 'at-peak':
      return '정점 구간을 지나고 있어요'
    case 'post-peak':
      return '정점을 지나 하락 구간이에요'
    case 'declining':
      return '하락 단계에 접어들었어요'
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
    case 'pre-peak':
      return avgDaysToPeak > 0
        ? `비슷한 테마 기준, 초기 성장 단계로 정점까지 약 ${avgDaysToPeak}일 여유가 있어요`
        : '비슷한 테마 기준, 초기 성장 단계로 정점까지 여유가 있어요'
    case 'near-peak':
      return avgDaysToPeak > 0
        ? `정점 구간에 가까워지고 있어요. 약 ${avgDaysToPeak}일 내 정점 도달이 예상돼요`
        : '정점 구간에 가까워지고 있어요. 곧 정점에 도달할 것으로 보여요'
    case 'at-peak':
      return '현재 정점 구간으로 보여요. 이후 하락 전환에 유의하세요'
    case 'post-peak':
      return '정점을 지난 것으로 보여요. 하락 전환 가능성이 높아요'
    case 'declining':
      return '하락 단계에 접어든 것으로 보여요. 신중한 접근이 필요해요'
  }
}
