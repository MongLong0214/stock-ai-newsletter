export interface ThemePredictionV3PendingRow {
  readonly id: string
  readonly theme_id: string
  readonly prediction_date: string
  readonly model_version: string
  readonly labeler_version: string
  readonly p_rise: number | null
  readonly abstain: boolean
}

export interface GtALabelScoreRow {
  readonly theme_id: string
  readonly base_date: string
  readonly labeler_version: string
  readonly label_status: 'pending' | 'final' | 'censored' | 'excluded'
  readonly g_log_ratio: number | null
  readonly y_binary: boolean | null
}

export interface ThemePredictionV3ScoreUpdate {
  readonly id: string
  readonly actual_g: number | null
  readonly actual_y: boolean | null
  readonly scored_at: string
  readonly score_status: 'scored' | 'censored' | 'excluded'
}

export interface ModelMetricDailyKey {
  readonly metricDate: string
  readonly modelVersion: string
}

export interface ThemePredictionV3ScoringPlan {
  readonly updates: readonly ThemePredictionV3ScoreUpdate[]
  readonly touchedMetricKeys: readonly ModelMetricDailyKey[]
  readonly skippedPending: number
}

const key = (themeId: string, date: string, labelerVersion: string): string =>
  `${themeId}|${date}|${labelerVersion}`
const metricKey = (date: string, modelVersion: string): string => `${date}|${modelVersion}`

export function buildThemePredictionV3ScoringPlan(input: {
  readonly predictions: readonly ThemePredictionV3PendingRow[]
  readonly labels: readonly GtALabelScoreRow[]
  readonly scoredAt: string
}): ThemePredictionV3ScoringPlan {
  const labelsByKey = new Map(input.labels.map((label) => [
    key(label.theme_id, label.base_date, label.labeler_version), label,
  ]))
  const touchedKeys = new Map<string, ModelMetricDailyKey>()
  const updates: ThemePredictionV3ScoreUpdate[] = []
  let skippedPending = 0

  for (const prediction of input.predictions) {
    const label = labelsByKey.get(key(
      prediction.theme_id, prediction.prediction_date, prediction.labeler_version,
    ))
    if (!label || label.label_status === 'pending') {
      skippedPending++
      continue
    }

    if (label.label_status === 'final') {
      if (label.y_binary === null) {
        throw new Error('final GT-A label requires a non-null y_binary')
      }
      updates.push({
        id: prediction.id,
        actual_g: label.g_log_ratio,
        actual_y: label.y_binary,
        scored_at: input.scoredAt,
        score_status: 'scored',
      })
      const groupKey = metricKey(prediction.prediction_date, prediction.model_version)
      touchedKeys.set(groupKey, { metricDate: prediction.prediction_date, modelVersion: prediction.model_version })
      continue
    }

    updates.push({
      id: prediction.id,
      actual_g: label.g_log_ratio,
      actual_y: label.y_binary,
      scored_at: input.scoredAt,
      score_status: label.label_status,
    })
  }

  return { updates, touchedMetricKeys: [...touchedKeys.values()], skippedPending }
}
