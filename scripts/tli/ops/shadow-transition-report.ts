export const SHADOW_OBSERVATION_DAYS = 14
export const METRICS_STREAK_DAYS = 7

export type PredictionServingRole = 'champion' | 'challenger' | 'shadow'
export type ModelRegistryStatus = 'champion' | 'challenger' | 'rolled_back' | 'archived'

export interface ShadowPredictionObservation {
  readonly predictionDate: string
  readonly modelVersion: string
  readonly servingRole: PredictionServingRole
}

export interface ModelMetricObservation {
  readonly metricDate: string
  readonly modelVersion: string
  readonly brier: number | null
  readonly coverage: number | null
  readonly abstainRate: number | null
  readonly nScored: number
}

export interface ModelRegistryObservation {
  readonly modelVersion: string
  readonly status: ModelRegistryStatus
}

export interface ShadowTransitionReportInput {
  readonly asOfDate: string
  readonly shadowPredictions: readonly ShadowPredictionObservation[]
  readonly metrics: readonly ModelMetricObservation[]
  readonly registry: readonly ModelRegistryObservation[]
}

export interface GateReport {
  readonly status: 'pass' | 'fail'
  readonly reason: string
}

export interface ShadowObservationGate extends GateReport {
  readonly requiredDays: number
  readonly observedDays: number
  readonly windowStart: string
  readonly windowEnd: string
}

export interface MetricsStreakGate extends GateReport {
  readonly requiredDays: number
  readonly consecutiveDays: number
  readonly totalMetricRows: number
  readonly totalScored: number
  readonly windowStart: string
  readonly windowEnd: string
}

export interface RollbackTargetGate extends GateReport {
  readonly targetModelVersion: string | null
}

export interface ShadowTransitionReport {
  readonly reportVersion: 'tli-shadow-transition-report-v1'
  readonly asOfDate: string
  readonly championModelVersion: string | null
  readonly rollbackTarget: ModelRegistryObservation | null
  readonly gates: {
    readonly shadowObservation: ShadowObservationGate
    readonly metricsStreak: MetricsStreakGate
    readonly rollbackTarget: RollbackTargetGate
  }
  readonly transitionReadiness: 'ready_for_operator_cutover' | 'not_ready'
}

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/

const assertIsoDate = (date: string): void => {
  if (!isoDatePattern.test(date) || Number.isNaN(new Date(`${date}T00:00:00.000Z`).getTime())) {
    throw new Error(`날짜 형식이 올바르지 않습니다: ${date}`)
  }
}

const shiftUtcDate = (date: string, days: number): string => {
  assertIsoDate(date)
  const parsed = new Date(`${date}T00:00:00.000Z`)
  parsed.setUTCDate(parsed.getUTCDate() + days)
  return parsed.toISOString().slice(0, 10)
}

const buildWindow = (asOfDate: string, days: number) => ({
  start: shiftUtcDate(asOfDate, -(days - 1)),
  end: asOfDate,
})

const uniqueSortedDates = (dates: readonly string[]): string[] => [...new Set(dates)].sort()

const findChampion = (
  registry: readonly ModelRegistryObservation[],
): ModelRegistryObservation | null => registry.find((model) => model.status === 'champion') ?? null

const findRollbackTarget = (
  registry: readonly ModelRegistryObservation[],
): ModelRegistryObservation | null => (
  registry.find((model) => model.status === 'archived' || model.status === 'rolled_back') ?? null
)

const buildShadowGate = (
  input: ShadowTransitionReportInput,
  championModelVersion: string | null,
): ShadowObservationGate => {
  const window = buildWindow(input.asOfDate, SHADOW_OBSERVATION_DAYS)
  const observedDays = championModelVersion === null
    ? 0
    : uniqueSortedDates(input.shadowPredictions.flatMap((prediction) => (
        prediction.servingRole === 'shadow' &&
        prediction.modelVersion === championModelVersion &&
        prediction.predictionDate >= window.start &&
        prediction.predictionDate <= window.end
          ? [prediction.predictionDate]
          : []
      ))).length

  return {
    status: observedDays >= SHADOW_OBSERVATION_DAYS ? 'pass' : 'fail',
    reason: observedDays >= SHADOW_OBSERVATION_DAYS
      ? 'shadow_observation_window_complete'
      : 'shadow_observation_window_incomplete',
    requiredDays: SHADOW_OBSERVATION_DAYS,
    observedDays,
    windowStart: window.start,
    windowEnd: window.end,
  }
}

const countConsecutiveMetricDays = (
  metricDates: ReadonlySet<string>,
  asOfDate: string,
  requiredDays: number,
): number => {
  let count = 0
  for (let offset = 0; offset < requiredDays; offset += 1) {
    const date = shiftUtcDate(asOfDate, -offset)
    if (!metricDates.has(date)) return count
    count += 1
  }
  return count
}

const buildMetricsGate = (
  input: ShadowTransitionReportInput,
  championModelVersion: string | null,
): MetricsStreakGate => {
  const window = buildWindow(input.asOfDate, METRICS_STREAK_DAYS)
  const championMetrics = championModelVersion === null
    ? []
    : input.metrics.filter((metric) => (
        metric.modelVersion === championModelVersion &&
        metric.metricDate >= window.start &&
        metric.metricDate <= window.end
      ))
  const metricDates = new Set(championMetrics.map((metric) => metric.metricDate))
  const consecutiveDays = countConsecutiveMetricDays(metricDates, input.asOfDate, METRICS_STREAK_DAYS)
  const totalScored = championMetrics.reduce((sum, metric) => sum + metric.nScored, 0)

  return {
    status: consecutiveDays >= METRICS_STREAK_DAYS ? 'pass' : 'fail',
    reason: consecutiveDays >= METRICS_STREAK_DAYS
      ? 'model_metrics_daily_streak_complete'
      : 'model_metrics_daily_streak_incomplete',
    requiredDays: METRICS_STREAK_DAYS,
    consecutiveDays,
    totalMetricRows: championMetrics.length,
    totalScored,
    windowStart: window.start,
    windowEnd: window.end,
  }
}

const buildRollbackGate = (target: ModelRegistryObservation | null): RollbackTargetGate => ({
  status: target === null ? 'fail' : 'pass',
  reason: target === null ? 'rollback_target_missing' : 'rollback_target_available',
  targetModelVersion: target?.modelVersion ?? null,
})

export function buildShadowTransitionReport(input: ShadowTransitionReportInput): ShadowTransitionReport {
  assertIsoDate(input.asOfDate)
  const champion = findChampion(input.registry)
  const rollbackTarget = findRollbackTarget(input.registry)
  const gates = {
    shadowObservation: buildShadowGate(input, champion?.modelVersion ?? null),
    metricsStreak: buildMetricsGate(input, champion?.modelVersion ?? null),
    rollbackTarget: buildRollbackGate(rollbackTarget),
  }
  const ready = Object.values(gates).every((gate) => gate.status === 'pass')

  return {
    reportVersion: 'tli-shadow-transition-report-v1',
    asOfDate: input.asOfDate,
    championModelVersion: champion?.modelVersion ?? null,
    rollbackTarget,
    gates,
    transitionReadiness: ready ? 'ready_for_operator_cutover' : 'not_ready',
  }
}
