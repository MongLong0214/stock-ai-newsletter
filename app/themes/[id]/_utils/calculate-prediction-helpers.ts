/** 예측 계산 헬퍼 함수들 */

import type { Phase, RiskLevel } from './calculate-prediction'

export function buildRiskMessage(risk: RiskLevel): string {
  const messages: Record<RiskLevel, string> = {
    low: '현재 위험도가 낮은 구간입니다',
    moderate: '주의가 필요한 구간에 진입하고 있습니다',
    high: '높은 주의가 필요한 구간입니다',
    critical: '매우 높은 위험 구간입니다. 신중한 판단이 필요합니다',
  }
  return messages[risk]
}

export function buildPhaseMessage(phase: Phase, avgDaysToPeak: number): string {
  switch (phase) {
    case 'pre-peak':
      return avgDaysToPeak > 0
        ? `Peak까지 약 ${avgDaysToPeak}일 남음`
        : 'Peak 이전 초기 성장 구간'
    case 'near-peak':
      return avgDaysToPeak > 0
        ? `약 ${avgDaysToPeak}일 내 Peak 도달 예상`
        : 'Peak 구간에 근접 중'
    case 'at-peak':
      return 'Peak 구간 통과 중'
    case 'post-peak':
      return 'Peak 이후 하락 전환 구간'
    case 'declining':
      return '하락 단계 진입'
  }
}

export function buildKeyInsight(phase: Phase, avgDaysToPeak: number): string {
  switch (phase) {
    case 'pre-peak':
      return avgDaysToPeak > 0
        ? `유사 테마 분석 기준, 성장 초기 단계로 피크까지 약 ${avgDaysToPeak}일 여유가 있습니다`
        : '유사 테마 분석 기준, 성장 초기 단계로 피크까지 여유가 있습니다'
    case 'near-peak':
      return avgDaysToPeak > 0
        ? `피크 구간에 근접하고 있습니다. 약 ${avgDaysToPeak}일 내 정점 도달이 예상됩니다`
        : '피크 구간에 근접하고 있습니다. 곧 정점 도달이 예상됩니다'
    case 'at-peak':
      return '현재 피크 구간으로 추정됩니다. 이후 하락 전환에 유의하세요'
    case 'post-peak':
      return '피크를 지난 것으로 보입니다. 하락세 전환 가능성이 높습니다'
    case 'declining':
      return '하락 단계에 진입한 것으로 보입니다. 신중한 접근이 필요합니다'
  }
}
