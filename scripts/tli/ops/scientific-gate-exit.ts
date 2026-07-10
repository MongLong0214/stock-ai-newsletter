import type { PredictionParityReport } from '../comparison/prediction-parity-report'
import type { ThemeWatchlistReport } from './theme-watchlist-report'

/**
 * 과학 gate 스크립트의 exit code 규약.
 *
 * `continue-on-error: true`는 critical contract failure를 workflow success로 숨긴다.
 * 대신 severity를 exit code로 노출해 워크플로가 "일반 경고"와 "과학 gate 실패"를 구분하게 한다.
 * - 0 pass: 계약 충족
 * - 1 operationalFailure: 스크립트 크래시/인프라 실패 (non-fatal, 경고 주석)
 * - 2 warning: 계약 위반은 아니나 관측된 열화 (non-fatal, 경고 주석)
 * - 3 criticalContractFailure: 과학 계약 위반 (workflow fail)
 */
export const SCIENTIFIC_GATE_EXIT = {
  pass: 0,
  operationalFailure: 1,
  warning: 2,
  criticalContractFailure: 3,
} as const

export type ScientificGateSeverity = 'pass' | 'warning' | 'critical'

export const scientificGateExitCode = (severity: ScientificGateSeverity): number => (
  severity === 'critical'
    ? SCIENTIFIC_GATE_EXIT.criticalContractFailure
    : severity === 'warning'
      ? SCIENTIFIC_GATE_EXIT.warning
      : SCIENTIFIC_GATE_EXIT.pass
)

/** 스냅샷 재계산은 결정적이므로, 비교 대상이 있는데 parityRate<1이면 serving/코드가 어긋난 것이다. */
export function classifyPredictionParitySeverity(report: PredictionParityReport): ScientificGateSeverity {
  if (!Number.isFinite(report.parityRate) || !Number.isFinite(report.coverageRate)) return 'critical'
  if (report.coverageRate > 0 && report.parityRate < 1) return 'critical'
  if (report.coverageRate < 1 || report.freshnessBusinessDays > 2) return 'warning'
  return 'pass'
}

/** 예측 행이 있는데 확률이 하나도 없으면 serving 경로가 죽은 것이다 (abstain은 정상 경로). */
export function classifyThemeWatchlistSeverity(report: ThemeWatchlistReport): ScientificGateSeverity {
  const health = report.shadowHealth
  if (health.totalRows > 0 && health.nonNullPRiseCount === 0) return 'critical'
  if (health.totalRows === 0 || health.scoredMetricStatus === 'no_scored_rows_yet') return 'warning'
  return 'pass'
}
