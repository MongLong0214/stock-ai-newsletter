import type { ProspectiveExpectedThemeRow } from './prospective-gate-input-contract'

type CollectionStatus = 'complete' | 'partial' | 'failed'
type RawExpectedThemeRow = Omit<ProspectiveExpectedThemeRow, 'source_proof'>

interface ForecastRow {
  readonly id: string
  readonly forecast_cutoff: string
}

interface CollectionRunRow {
  readonly id: string
  readonly source: string
  readonly status: CollectionStatus
  readonly collected_at: string
  readonly completed_at: string | null
}

interface InterestObservationRow {
  readonly collection_run_id: string
  readonly theme_id: string
}

interface NewsObservationRow {
  readonly id: string
  readonly collection_run_id: string
  readonly collected_at: string
}

interface SourceProofInput {
  readonly rawExpectedThemes: readonly RawExpectedThemeRow[]
  readonly forecasts: readonly ForecastRow[]
  readonly interestRuns: readonly CollectionRunRow[]
  readonly interestObservations: readonly InterestObservationRow[]
  readonly newsObservations: readonly NewsObservationRow[]
  readonly newsRuns: readonly CollectionRunRow[]
}

const beforeCutoff = (value: string | null, cutoff: string): boolean => value !== null
  && Number.isFinite(Date.parse(value)) && Date.parse(value) <= Date.parse(cutoff)

const setFirst = <Row>(map: Map<string, Row>, key: string, row: Row): void => {
  if (!map.has(key)) map.set(key, row)
}

const interestKey = (runId: string, themeId: string): string => `${runId}\u0000${themeId}`

export function buildProspectiveExpectedThemes(input: SourceProofInput): ProspectiveExpectedThemeRow[] {
  const forecastsById = new Map<string, ForecastRow>()
  for (const row of input.forecasts) setFirst(forecastsById, row.id, row)

  const interestRunsById = new Map<string, CollectionRunRow>()
  for (const row of input.interestRuns) setFirst(interestRunsById, row.id, row)

  const newsRunsById = new Map<string, CollectionRunRow>()
  for (const row of input.newsRuns) setFirst(newsRunsById, row.id, row)

  const interestCounts = new Map<string, number>()
  for (const row of input.interestObservations) {
    const key = interestKey(row.collection_run_id, row.theme_id)
    interestCounts.set(key, (interestCounts.get(key) ?? 0) + 1)
  }

  const newsById = new Map<string, NewsObservationRow[]>()
  for (const row of input.newsObservations) {
    const rows = newsById.get(row.id)
    if (rows === undefined) newsById.set(row.id, [row])
    else rows.push(row)
  }

  const result: ProspectiveExpectedThemeRow[] = []
  for (const row of input.rawExpectedThemes) {
    const cutoff = forecastsById.get(row.forecast_origin_manifest_id)?.forecast_cutoff ?? ''
    const interestRun = row.forecast_interest_run_id === null
      ? null
      : interestRunsById.get(row.forecast_interest_run_id) ?? null
    const interestCount = row.forecast_interest_run_id === null
      ? 0
      : interestCounts.get(interestKey(row.forecast_interest_run_id, row.theme_id)) ?? 0
    const newsRows: NewsObservationRow[] = []
    for (const newsId of new Set(row.news_observation_ids)) {
      const matches = newsById.get(newsId)
      if (matches !== undefined) newsRows.push(...matches)
    }
    const newsStatuses = new Set<string>()
    let newsBeforeCutoff = newsRows.length === row.news_observation_ids.length
    for (const observation of newsRows) {
      const run = newsRunsById.get(observation.collection_run_id)
      newsStatuses.add(run?.status ?? 'missing')
      if (run === undefined || run.source !== 'naver_news'
          || !beforeCutoff(observation.collected_at, cutoff)
          || !beforeCutoff(run.collected_at, cutoff)
          || !beforeCutoff(run.completed_at, cutoff)) {
        newsBeforeCutoff = false
      }
    }
    result.push({
      ...row,
      source_proof: {
        interest_run_status: interestRun?.status ?? null,
        interest_run_source: interestRun?.source ?? null,
        interest_run_before_cutoff: interestRun !== null
          && beforeCutoff(interestRun.collected_at, cutoff)
          && beforeCutoff(interestRun.completed_at, cutoff),
        interest_observation_count: interestCount,
        interest_observation_run_count: interestCount > 0 ? 1 : 0,
        news_observation_count: newsRows.length,
        news_run_statuses: [...newsStatuses].sort(),
        news_before_cutoff: newsBeforeCutoff,
      },
    })
  }
  return result
}
