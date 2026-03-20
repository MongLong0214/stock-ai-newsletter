import { createDefaultPolicyVersions } from '@/lib/tli/analog/types'
import {
  retrieveDtwBaseline,
  retrievePriceVolumeKnn,
  retrieveRegimeFilteredNn,
  type CorpusEpisode,
  type RetrievalCandidate,
  type RetrievalSurface,
} from '@/lib/tli/analog/baselines'
import { classifySectorProfile, extractFeatures } from '@/lib/tli/comparison/features'
import { findPeakDay, normalizeTimeline, normalizeValues, resampleCurve } from '@/lib/tli/comparison/timeline'
import type { ThemeStateHistoryV2, Stage } from '@/lib/tli/types/db'
import { batchQuery, batchUpsert, groupByThemeId } from '@/scripts/tli/shared/supabase-batch'
import { supabaseAdmin } from '@/scripts/tli/shared/supabase-admin'
import { getKSTDateString } from '@/lib/tli/date-utils'
import { buildAnalogEvidence } from '@/scripts/tli/comparison/analog-evidence'
import {
  buildLabelRow,
  buildQuerySnapshot,
  classifyReconstructionStatus,
} from '@/scripts/tli/comparison/build-query-snapshots'
import {
  buildEpisodesFromHistory,
  inferEpisodesFromScores,
  type DailyScore,
  type EpisodeCandidate,
} from '@/scripts/tli/themes/build-episode-registry'
import { backfillThemeStateHistory } from '@/scripts/tli/ops/run-theme-state-history-backfill'

interface ThemeRow {
  id: string
  name: string
  is_active: boolean
  first_spike_date: string | null
  created_at: string | null
  updated_at: string | null
}

interface ScoreRow {
  theme_id: string
  calculated_at: string
  score: number
  stage: Stage
}

interface InterestRow {
  theme_id: string
  time: string
  normalized: number
  raw_value?: number
}

interface NewsRow {
  theme_id: string
  time: string
  article_count: number
}

interface KeywordRow {
  theme_id: string
  keyword: string
}

interface PersistedEpisodeRow {
  id: string
  theme_id: string
  episode_number: number
  boundary_source_start: 'observed' | 'inferred-v1' | 'imported'
  boundary_source_end: 'observed' | 'inferred-v1' | 'imported' | null
  episode_start: string
  episode_end: string | null
  is_active: boolean
  multi_peak: boolean
  primary_peak_date: string | null
  peak_score: number | null
  policy_versions: Record<string, unknown>
}

interface PersistedQuerySnapshotRow {
  id: string
  episode_id: string
  theme_id: string
  snapshot_date: string
  source_data_cutoff: string
  features: Record<string, number>
  lifecycle_score: number
  stage: Stage
  days_since_episode_start: number
  policy_versions: Record<string, unknown>
  reconstruction_status: 'success' | 'partial' | 'failed'
  reconstruction_reason: string | null
}

interface PersistedLabelRow {
  episode_id: string
  theme_id: string
  boundary_source: 'observed' | 'inferred-v1' | 'imported'
  source_data_cutoff: string
  is_completed: boolean
  peak_date: string | null
  peak_score: number | null
  days_to_peak: number | null
  post_peak_drawdown_10d: number | null
  post_peak_drawdown_20d: number | null
  stage_at_peak: Stage | null
  is_promotion_eligible: boolean
  promotion_ineligible_reason: string | null
  policy_versions: Record<string, unknown>
}

interface EpisodeObservation {
  features: Record<string, number>
  curve: number[]
  stage: Stage
}

interface SnapshotFeatureBuildResult extends EpisodeObservation {
  hasInterest: boolean
  hasNews: boolean
  hasScore: boolean
}

interface AggregatedCandidate {
  candidateEpisodeId: string
  candidateThemeId: string
  retrievalSurface: RetrievalSurface
  similarityScore: number
  featureSim: number | null
  curveSim: number | null
  dtwDistance: number | null
  regimeMatch: boolean
  rank: number
}

interface EpisodeOutcomeSummary {
  observableEndDate: string
  totalDays: number
  peakDay: number
  finalStage: Stage
  postPeakDrawdown: number | null
}

export interface Phase0MaterializationResult {
  stateHistoryBackfillCount: number
  episodeCount: number
  querySnapshotCount: number
  labelCount: number
  analogCandidateCount: number
  analogEvidenceCount: number
}

const TOP_ANALOGS = 5
const DELETE_CHUNK_SIZE = 300

const addDays = (date: string, days: number): string => {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next.toISOString().split('T')[0]
}

const daysBetween = (from: string, to: string): number => {
  const msPerDay = 86400000
  return Math.max(0, Math.floor((new Date(to).getTime() - new Date(from).getTime()) / msPerDay))
}

const roundMetric = (value: number | null): number | null => {
  if (value == null || !Number.isFinite(value)) return null
  return Math.round(value * 1000) / 1000
}

async function deleteRowsInChunks(
  table: string,
  column: string,
  values: string[],
) {
  if (values.length === 0) return
  for (let index = 0; index < values.length; index += DELETE_CHUNK_SIZE) {
    const batch = values.slice(index, index + DELETE_CHUNK_SIZE)
    const { error } = await supabaseAdmin
      .from(table)
      .delete()
      .in(column, batch)
    if (error) {
      throw new Error(`${table} cleanup failed: ${error.message}`)
    }
  }
}

export function computeCandidateConcentrationStats(similarities: number[]) {
  if (similarities.length === 0) {
    return { gini: 0, top1Weight: 0 }
  }

  const positive = similarities.map((value) => Math.max(0, value))
  const total = positive.reduce((sum, value) => sum + value, 0)
  if (total <= 0) {
    return { gini: 0, top1Weight: 0 }
  }

  const weights = positive.map((value) => value / total).sort((a, b) => a - b)
  const n = weights.length
  let weightedSum = 0
  for (let i = 0; i < n; i++) {
    weightedSum += (i + 1) * weights[i]
  }

  const gini = (2 * weightedSum) / (n * weights.reduce((sum, value) => sum + value, 0)) - (n + 1) / n

  return {
    gini: Math.max(0, Math.min(1, roundMetric(gini) ?? 0)),
    top1Weight: Math.max(...weights),
  }
}

export function aggregateRetrievalCandidates(input: {
  candidates: RetrievalCandidate[]
  topN?: number
}): AggregatedCandidate[] {
  const byEpisodeId = new Map<string, AggregatedCandidate>()

  for (const candidate of input.candidates) {
    const existing = byEpisodeId.get(candidate.episodeId)
    if (!existing) {
      byEpisodeId.set(candidate.episodeId, {
        candidateEpisodeId: candidate.episodeId,
        candidateThemeId: candidate.themeId,
        retrievalSurface: candidate.retrievalSurface,
        similarityScore: candidate.similarityScore,
        featureSim: candidate.featureSim,
        curveSim: candidate.curveSim,
        dtwDistance: candidate.dtwDistance,
        regimeMatch: candidate.regimeMatch,
        rank: candidate.rank,
      })
      continue
    }

    if (candidate.similarityScore > existing.similarityScore) {
      existing.similarityScore = candidate.similarityScore
      existing.retrievalSurface = candidate.retrievalSurface
    }
    existing.featureSim = Math.max(existing.featureSim ?? -Infinity, candidate.featureSim ?? -Infinity)
    existing.curveSim = Math.max(existing.curveSim ?? -Infinity, candidate.curveSim ?? -Infinity)
    existing.dtwDistance = existing.dtwDistance == null
      ? candidate.dtwDistance
      : (candidate.dtwDistance == null ? existing.dtwDistance : Math.min(existing.dtwDistance, candidate.dtwDistance))
    existing.regimeMatch = existing.regimeMatch || candidate.regimeMatch
  }

  return [...byEpisodeId.values()]
    .map((candidate) => ({
      ...candidate,
      featureSim: Number.isFinite(candidate.featureSim ?? NaN) ? candidate.featureSim : null,
      curveSim: Number.isFinite(candidate.curveSim ?? NaN) ? candidate.curveSim : null,
      dtwDistance: Number.isFinite(candidate.dtwDistance ?? NaN) ? candidate.dtwDistance : null,
    }))
    .sort((a, b) => b.similarityScore - a.similarityScore)
    .slice(0, input.topN ?? TOP_ANALOGS)
    .map((candidate, index) => ({
      ...candidate,
      rank: index + 1,
    }))
}

export function selectCandidateEpisodeCorpus(input: {
  completedEpisodes: PersistedEpisodeRow[]
  allEpisodes: PersistedEpisodeRow[]
  currentThemeId: string
}) {
  const pool = input.completedEpisodes.length > 0
    ? input.completedEpisodes
    : input.allEpisodes
  return pool.filter((candidate) => candidate.theme_id !== input.currentThemeId)
}

export function buildRetrievalReason(input: {
  surface: RetrievalSurface
  featureSim: number | null
  curveSim: number | null
  regimeMatch: boolean
}) {
  const surfaceText: Record<RetrievalSurface, string> = {
    price_volume_knn: '피처 공간 근접도',
    dtw_baseline: '곡선 패턴 유사도',
    regime_filtered_nn: '레짐 일치 근접도',
    future_aligned_reranker: '미래 정렬 재랭킹',
  }

  const reasons = [surfaceText[input.surface]]
  if (input.regimeMatch) reasons.push('현재 레짐 일치')
  if (input.featureSim != null && input.featureSim >= 0.7) reasons.push(`feature ${input.featureSim.toFixed(2)}`)
  if (input.curveSim != null && input.curveSim >= 0.7) reasons.push(`curve ${input.curveSim.toFixed(2)}`)
  return reasons.join(' · ')
}

export function buildMismatchSummary(input: {
  queryDay: number
  candidatePeakDay: number | null
  candidateTotalDays: number
}) {
  const parts: string[] = []
  if (input.candidatePeakDay != null) {
    const peakGap = Math.abs(input.queryDay - input.candidatePeakDay)
    if (peakGap >= 20) parts.push(`정점 시점 차이 ${peakGap}일`)
  }
  const totalGap = Math.abs(input.queryDay - input.candidateTotalDays)
  if (totalGap >= 30) parts.push(`관측 길이 차이 ${totalGap}일`)
  return parts.length > 0 ? parts.join(' · ') : null
}

const selectLatestScoreAtOrBefore = (
  rows: ScoreRow[],
  lowerBound: string,
  upperBound: string,
) => {
  let latest: ScoreRow | null = null
  for (const row of rows) {
    const date = row.calculated_at.split('T')[0]
    if (date < lowerBound || date > upperBound) continue
    if (!latest || date > latest.calculated_at.split('T')[0]) {
      latest = row
    }
  }
  return latest
}

const getScoreRowsInRange = (
  rows: ScoreRow[],
  start: string,
  end: string | null,
) =>
  rows.filter((row) => {
    const date = row.calculated_at.split('T')[0]
    return date >= start && (end == null || date <= end)
  })

const getEpisodeObservableEndDate = (
  episode: PersistedEpisodeRow,
  scoreRows: ScoreRow[],
) => {
  if (episode.episode_end) return episode.episode_end
  return selectLatestScoreAtOrBefore(scoreRows, episode.episode_start, '9999-12-31')
    ?.calculated_at
    .split('T')[0] ?? episode.episode_start
}

const buildKeywordSupportCounts = (keywordRows: KeywordRow[]) => {
  const counts = new Map<string, number>()
  for (const row of keywordRows) {
    const normalized = row.keyword.toLowerCase()
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1)
  }
  return counts
}

const buildSnapshotFeatureSlice = (input: {
  themeId: string
  episodeStart: string
  snapshotDate: string
  interestRows: Map<string, InterestRow[]>
  newsRows: Map<string, NewsRow[]>
  keywordRows: Map<string, KeywordRow[]>
  scoreRows: Map<string, ScoreRow[]>
  keywordSupportCounts: Map<string, number>
}): SnapshotFeatureBuildResult => {
  const interest = (input.interestRows.get(input.themeId) ?? [])
    .filter((row) => row.time >= input.episodeStart && row.time <= input.snapshotDate)
    .sort((a, b) => a.time.localeCompare(b.time))
  const news = (input.newsRows.get(input.themeId) ?? [])
    .filter((row) => row.time >= input.episodeStart && row.time <= input.snapshotDate)
  const keywords = (input.keywordRows.get(input.themeId) ?? []).map((row) => row.keyword)
  const scores = input.scoreRows.get(input.themeId) ?? []
  const latestScore = selectLatestScoreAtOrBefore(scores, input.episodeStart, input.snapshotDate)
  const sectorProfile = classifySectorProfile(keywords)
  const features = extractFeatures({
    interestValues: interest.map((row) => row.normalized),
    totalNewsCount: news.reduce((sum, row) => sum + row.article_count, 0),
    activeDays: daysBetween(input.episodeStart, input.snapshotDate),
    keywords,
    keywordSupportCounts: input.keywordSupportCounts,
    sectorConfidence: sectorProfile.confidence,
  })
  const curve = normalizeTimeline(
    interest.map((row) => ({ date: row.time, value: row.normalized })),
    input.episodeStart,
  )

  return {
    features,
    curve: curve.length > 0 ? resampleCurve(normalizeValues(curve)) : [],
    stage: latestScore?.stage ?? 'Dormant',
    hasInterest: interest.length > 0,
    hasNews: news.length > 0,
    hasScore: latestScore != null,
  }
}

const computeDrawdown = (
  scoreRows: ScoreRow[],
  peakDate: string | null,
  peakScore: number | null,
  horizonDays: number,
) => {
  if (!peakDate || peakScore == null || peakScore <= 0) return null
  const endDate = addDays(peakDate, horizonDays)
  const rows = scoreRows.filter((row) => {
    const date = row.calculated_at.split('T')[0]
    return date >= peakDate && date <= endDate
  })
  if (rows.length === 0) return null
  const minScore = Math.min(...rows.map((row) => row.score))
  return roundMetric(Math.max(0, 1 - minScore / peakScore))
}

const buildCorpusEpisodeObservation = (input: {
  queryDay: number
  episode: PersistedEpisodeRow
  interestRows: Map<string, InterestRow[]>
  newsRows: Map<string, NewsRow[]>
  keywordRows: Map<string, KeywordRow[]>
  scoreRows: Map<string, ScoreRow[]>
  keywordSupportCounts: Map<string, number>
}): CorpusEpisode => {
  const scoreRows = input.scoreRows.get(input.episode.theme_id) ?? []
  const observableEndDate = getEpisodeObservableEndDate(input.episode, scoreRows)
  const totalDays = daysBetween(input.episode.episode_start, observableEndDate)
  const observationDay = Math.max(0, Math.min(input.queryDay, totalDays))
  const observationDate = addDays(input.episode.episode_start, observationDay)
  const snapshot = buildSnapshotFeatureSlice({
    themeId: input.episode.theme_id,
    episodeStart: input.episode.episode_start,
    snapshotDate: observationDate,
    interestRows: input.interestRows,
    newsRows: input.newsRows,
    keywordRows: input.keywordRows,
    scoreRows: input.scoreRows,
    keywordSupportCounts: input.keywordSupportCounts,
  })

  return {
    episodeId: input.episode.id,
    themeId: input.episode.theme_id,
    episodeEnd: observationDate,
    features: snapshot.features,
    curve: snapshot.curve,
    stage: snapshot.stage,
    peakDay: input.episode.primary_peak_date
      ? daysBetween(input.episode.episode_start, input.episode.primary_peak_date)
      : 0,
    totalDays,
  }
}

const buildEpisodeOutcomeSummary = (input: {
  episode: PersistedEpisodeRow
  label: PersistedLabelRow | undefined
  scoreRows: ScoreRow[]
}): EpisodeOutcomeSummary => {
  const observableEndDate = getEpisodeObservableEndDate(input.episode, input.scoreRows)
  return {
    observableEndDate,
    totalDays: daysBetween(input.episode.episode_start, observableEndDate),
    peakDay: input.episode.primary_peak_date
      ? daysBetween(input.episode.episode_start, input.episode.primary_peak_date)
      : 0,
    finalStage: selectLatestScoreAtOrBefore(
      input.scoreRows,
      input.episode.episode_start,
      observableEndDate,
    )?.stage ?? 'Dormant',
    postPeakDrawdown: input.label?.post_peak_drawdown_20d
      ?? input.label?.post_peak_drawdown_10d
      ?? computeDrawdown(input.scoreRows, input.episode.primary_peak_date, input.episode.peak_score, 20),
  }
}

const loadAllThemes = async (): Promise<ThemeRow[]> => {
  const rows: ThemeRow[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabaseAdmin
      .from('themes')
      .select('id, name, is_active, first_spike_date, created_at, updated_at')
      .order('id')
      .range(from, from + 999)
    if (error) throw new Error(`theme load failed: ${error.message}`)
    if (!data?.length) break
    rows.push(...(data as ThemeRow[]))
    if (data.length < 1000) break
  }
  return rows
}

const loadThemeStateHistory = async (themeIds: string[]) =>
  batchQuery<ThemeStateHistoryV2>(
    'theme_state_history_v2',
    'theme_id, effective_from, effective_to, is_active, closed_at, first_spike_date, state_version',
    themeIds,
    (query) => query.order('effective_from', { ascending: true }),
    'theme_id',
    { failOnError: true },
  )

const loadLifecycleScores = async (themeIds: string[]) =>
  batchQuery<ScoreRow>(
    'lifecycle_scores',
    'theme_id, calculated_at, score, stage',
    themeIds,
    (query) => query.order('calculated_at', { ascending: true }),
    'theme_id',
    { failOnError: true },
  )

const loadInterestRows = async (themeIds: string[]) =>
  batchQuery<InterestRow>(
    'interest_metrics',
    'theme_id, time, normalized, raw_value',
    themeIds,
    (query) => query.order('time', { ascending: true }),
    'theme_id',
    { failOnError: true },
  )

const loadNewsRows = async (themeIds: string[]) =>
  batchQuery<NewsRow>(
    'news_metrics',
    'theme_id, time, article_count',
    themeIds,
    (query) => query.order('time', { ascending: true }),
    'theme_id',
    { failOnError: true },
  )

const loadKeywordRows = async (themeIds: string[]) =>
  batchQuery<KeywordRow>(
    'theme_keywords',
    'theme_id, keyword',
    themeIds,
    undefined,
    'theme_id',
    { failOnError: true },
  )

const loadPersistedEpisodes = async (themeIds: string[]) =>
  batchQuery<PersistedEpisodeRow>(
    'episode_registry_v1',
    'id, theme_id, episode_number, boundary_source_start, boundary_source_end, episode_start, episode_end, is_active, multi_peak, primary_peak_date, peak_score, policy_versions',
    themeIds,
    (query) => query.order('episode_number', { ascending: true }),
    'theme_id',
    { failOnError: true },
  )

const loadPersistedQuerySnapshots = async (themeIds: string[]) =>
  batchQuery<PersistedQuerySnapshotRow>(
    'query_snapshot_v1',
    'id, episode_id, theme_id, snapshot_date, source_data_cutoff, features, lifecycle_score, stage, days_since_episode_start, policy_versions, reconstruction_status, reconstruction_reason',
    themeIds,
    (query) => query.order('snapshot_date', { ascending: false }),
    'theme_id',
    { failOnError: true },
  )

const loadPersistedLabels = async (themeIds: string[]) =>
  batchQuery<PersistedLabelRow>(
    'label_table_v1',
    'episode_id, theme_id, boundary_source, source_data_cutoff, is_completed, peak_date, peak_score, days_to_peak, post_peak_drawdown_10d, post_peak_drawdown_20d, stage_at_peak, is_promotion_eligible, promotion_ineligible_reason, policy_versions',
    themeIds,
    undefined,
    'theme_id',
    { failOnError: true },
  )

export async function materializePhase0Artifacts(): Promise<Phase0MaterializationResult> {
  const { insertedCount } = await backfillThemeStateHistory()
  const policyVersions = createDefaultPolicyVersions()
  const today = getKSTDateString()
  const themes = await loadAllThemes()
  const themeIds = themes.map((theme) => theme.id)

  const [stateHistoryRows, lifecycleScoreRows, interestRows, newsRows, keywordRows] = await Promise.all([
    loadThemeStateHistory(themeIds),
    loadLifecycleScores(themeIds),
    loadInterestRows(themeIds),
    loadNewsRows(themeIds),
    loadKeywordRows(themeIds),
  ])

  const stateHistoryByTheme = groupByThemeId(stateHistoryRows)
  const lifecycleScoresByTheme = groupByThemeId(lifecycleScoreRows)
  const interestByTheme = groupByThemeId(interestRows)
  const newsByTheme = groupByThemeId(newsRows)
  const keywordByTheme = groupByThemeId(keywordRows)
  const keywordSupportCounts = buildKeywordSupportCounts(keywordRows)

  const existingQuerySnapshots = await loadPersistedQuerySnapshots(themeIds)
  const existingSnapshotIds = existingQuerySnapshots.map((snapshot) => snapshot.id)
  if (existingSnapshotIds.length > 0) {
    await deleteRowsInChunks('analog_evidence_v1', 'query_snapshot_id', existingSnapshotIds)
    await deleteRowsInChunks('analog_candidates_v1', 'query_snapshot_id', existingSnapshotIds)
  }
  await deleteRowsInChunks('query_snapshot_v1', 'theme_id', themeIds)
  await deleteRowsInChunks('label_table_v1', 'theme_id', themeIds)
  await deleteRowsInChunks('episode_registry_v1', 'theme_id', themeIds)

  const episodeSeeds: EpisodeCandidate[] = []
  for (const theme of themes) {
    const history = stateHistoryByTheme.get(theme.id) ?? []
    const scores = (lifecycleScoresByTheme.get(theme.id) ?? []).map<DailyScore>((row) => ({
      date: row.calculated_at.split('T')[0],
      score: row.score,
    }))
    const historyEpisodes = buildEpisodesFromHistory(theme.id, history, scores)
    const hasCompletedHistoryEpisode = historyEpisodes.some((episode) => !episode.is_active && episode.episode_end != null)
    if (hasCompletedHistoryEpisode || history.length > 1) {
      episodeSeeds.push(...historyEpisodes)
      continue
    }

    const inferredEpisodes = inferEpisodesFromScores(theme.id, scores, theme.is_active)
    episodeSeeds.push(...(inferredEpisodes.length > 0 ? inferredEpisodes : historyEpisodes))
  }

  await batchUpsert(
    'episode_registry_v1',
    episodeSeeds.map((episode) => ({
      ...episode,
      updated_at: new Date().toISOString(),
    })),
    'theme_id,episode_number',
    'phase0 episode registry',
  )

  const persistedEpisodes = await loadPersistedEpisodes(themeIds)
  const persistedEpisodeKey = new Map(
    persistedEpisodes.map((episode) => [`${episode.theme_id}:${episode.episode_number}`, episode]),
  )

  const labelRows: Record<string, unknown>[] = []
  const querySnapshotRows: Record<string, unknown>[] = []

  for (const episodeSeed of episodeSeeds) {
    const persistedEpisode = persistedEpisodeKey.get(`${episodeSeed.theme_id}:${episodeSeed.episode_number}`)
    if (!persistedEpisode) continue

    const scoreRows = lifecycleScoresByTheme.get(episodeSeed.theme_id) ?? []
    const episodeScoreRows = getScoreRowsInRange(scoreRows, persistedEpisode.episode_start, persistedEpisode.episode_end)
    const sourceDataCutoff = persistedEpisode.episode_end
      ?? episodeScoreRows.at(-1)?.calculated_at.split('T')[0]
      ?? today
    const stageAtPeak = persistedEpisode.primary_peak_date
      ? selectLatestScoreAtOrBefore(scoreRows, persistedEpisode.episode_start, persistedEpisode.primary_peak_date)?.stage ?? null
      : null

    labelRows.push(buildLabelRow({
      episodeId: persistedEpisode.id,
      themeId: persistedEpisode.theme_id,
      boundarySource: persistedEpisode.boundary_source_end ?? persistedEpisode.boundary_source_start,
      sourceDataCutoff,
      isCompleted: !persistedEpisode.is_active && persistedEpisode.episode_end != null,
      peakDate: persistedEpisode.primary_peak_date,
      peakScore: persistedEpisode.peak_score,
      daysToPeak: persistedEpisode.primary_peak_date
        ? daysBetween(persistedEpisode.episode_start, persistedEpisode.primary_peak_date)
        : null,
      postPeakDrawdown10d: computeDrawdown(episodeScoreRows, persistedEpisode.primary_peak_date, persistedEpisode.peak_score, 10),
      postPeakDrawdown20d: computeDrawdown(episodeScoreRows, persistedEpisode.primary_peak_date, persistedEpisode.peak_score, 20),
      stageAtPeak,
      policyVersions,
    }))

    const snapshotDate = persistedEpisode.is_active
      ? episodeScoreRows.at(-1)?.calculated_at.split('T')[0] ?? today
      : (persistedEpisode.episode_end ?? sourceDataCutoff)

    const snapshotFeatureSlice = buildSnapshotFeatureSlice({
      themeId: persistedEpisode.theme_id,
      episodeStart: persistedEpisode.episode_start,
      snapshotDate,
      interestRows: interestByTheme,
      newsRows: newsByTheme,
      keywordRows: keywordByTheme,
      scoreRows: lifecycleScoresByTheme,
      keywordSupportCounts,
    })
    const latestScore = selectLatestScoreAtOrBefore(scoreRows, persistedEpisode.episode_start, snapshotDate)
    const reconstruction = classifyReconstructionStatus({
      hasInterest: snapshotFeatureSlice.hasInterest,
      hasNews: snapshotFeatureSlice.hasNews,
      hasScore: snapshotFeatureSlice.hasScore,
    })

    querySnapshotRows.push(buildQuerySnapshot({
      episodeId: persistedEpisode.id,
      themeId: persistedEpisode.theme_id,
      snapshotDate,
      sourceDataCutoff: snapshotDate,
      episodeStart: persistedEpisode.episode_start,
      lifecycleScore: latestScore?.score ?? 0,
      stage: latestScore?.stage ?? 'Dormant',
      features: snapshotFeatureSlice.features,
      policyVersions,
      reconstructionStatus: reconstruction.status,
      reconstructionReason: reconstruction.reason ?? undefined,
    }))
  }

  await batchUpsert(
    'label_table_v1',
    labelRows,
    'episode_id',
    'phase0 label table',
  )
  await batchUpsert(
    'query_snapshot_v1',
    querySnapshotRows,
    'episode_id,snapshot_date',
    'phase0 query snapshots',
  )

  const persistedQuerySnapshots = await loadPersistedQuerySnapshots(themeIds)
  const latestSnapshotByEpisodeId = new Map<string, PersistedQuerySnapshotRow>()
  for (const snapshot of persistedQuerySnapshots) {
    if (!latestSnapshotByEpisodeId.has(snapshot.episode_id)) {
      latestSnapshotByEpisodeId.set(snapshot.episode_id, snapshot)
    }
  }

  const activeEpisodes = persistedEpisodes.filter((episode) => episode.is_active)
  const completedEpisodes = persistedEpisodes.filter((episode) => !episode.is_active && episode.episode_end != null)
  const labelsByEpisodeId = new Map((await loadPersistedLabels(themeIds)).map((row) => [row.episode_id, row]))

  const analogCandidateRows: Record<string, unknown>[] = []
  const analogEvidenceRows: Record<string, unknown>[] = []

  for (const episode of activeEpisodes) {
    const snapshot = latestSnapshotByEpisodeId.get(episode.id)
    if (!snapshot || snapshot.reconstruction_status === 'failed') continue

    const queryObservation = buildSnapshotFeatureSlice({
      themeId: episode.theme_id,
      episodeStart: episode.episode_start,
      snapshotDate: snapshot.snapshot_date,
      interestRows: interestByTheme,
      newsRows: newsByTheme,
      keywordRows: keywordByTheme,
      scoreRows: lifecycleScoresByTheme,
      keywordSupportCounts,
    })

    const candidateEpisodes = selectCandidateEpisodeCorpus({
      completedEpisodes,
      allEpisodes: persistedEpisodes,
      currentThemeId: episode.theme_id,
    })
      .map((candidate) => buildCorpusEpisodeObservation({
        queryDay: snapshot.days_since_episode_start,
        episode: candidate,
        interestRows: interestByTheme,
        newsRows: newsByTheme,
        keywordRows: keywordByTheme,
        scoreRows: lifecycleScoresByTheme,
        keywordSupportCounts,
      }))
      .filter((candidate) => candidate.episodeEnd != null && candidate.episodeEnd <= snapshot.snapshot_date)
      .filter((candidate) => candidate.totalDays >= 7)
      .filter((candidate) => candidate.curve.length > 0 || Object.keys(candidate.features).length > 0)

    if (candidateEpisodes.length === 0) continue

    const retrievalCandidates = [
      ...retrievePriceVolumeKnn({
        episodeId: snapshot.episode_id,
        themeId: snapshot.theme_id,
        snapshotDate: snapshot.snapshot_date,
        features: snapshot.features,
        curve: queryObservation.curve,
        stage: snapshot.stage,
      }, candidateEpisodes, { topN: TOP_ANALOGS }),
      ...retrieveDtwBaseline({
        episodeId: snapshot.episode_id,
        themeId: snapshot.theme_id,
        snapshotDate: snapshot.snapshot_date,
        features: snapshot.features,
        curve: queryObservation.curve,
        stage: snapshot.stage,
      }, candidateEpisodes, { topN: TOP_ANALOGS }),
      ...retrieveRegimeFilteredNn({
        episodeId: snapshot.episode_id,
        themeId: snapshot.theme_id,
        snapshotDate: snapshot.snapshot_date,
        features: snapshot.features,
        curve: queryObservation.curve,
        stage: snapshot.stage,
      }, candidateEpisodes, { topN: TOP_ANALOGS }),
    ]

    const aggregated = aggregateRetrievalCandidates({
      candidates: retrievalCandidates,
      topN: TOP_ANALOGS,
    })

    if (aggregated.length === 0) continue

    const { gini, top1Weight } = computeCandidateConcentrationStats(
      aggregated.map((candidate) => candidate.similarityScore),
    )

    const candidateIdByEpisodeId = new Map<string, string>()
    for (const candidate of aggregated) {
      const candidateId = crypto.randomUUID()
      candidateIdByEpisodeId.set(candidate.candidateEpisodeId, candidateId)
      analogCandidateRows.push({
        id: candidateId,
        query_snapshot_id: snapshot.id,
        query_theme_id: snapshot.theme_id,
        candidate_episode_id: candidate.candidateEpisodeId,
        candidate_theme_id: candidate.candidateThemeId,
        rank: candidate.rank,
        retrieval_surface: candidate.retrievalSurface,
        similarity_score: candidate.similarityScore,
        feature_sim: candidate.featureSim,
        curve_sim: candidate.curveSim,
        keyword_sim: null,
        dtw_distance: candidate.dtwDistance,
        regime_match: candidate.regimeMatch,
        is_future_aligned: false,
        reranker_score: null,
        reranker_version: null,
        policy_versions: policyVersions,
      })
    }

    for (const candidate of aggregated) {
      const candidateEpisode = persistedEpisodes.find((episodeRow) => episodeRow.id === candidate.candidateEpisodeId)
      const label = labelsByEpisodeId.get(candidate.candidateEpisodeId)
      if (!candidateEpisode || !label) continue
      const candidateScoreRows = lifecycleScoresByTheme.get(candidateEpisode.theme_id) ?? []
      const outcome = buildEpisodeOutcomeSummary({
        episode: candidateEpisode,
        label,
        scoreRows: candidateScoreRows,
      })

      analogEvidenceRows.push(buildAnalogEvidence({
        querySnapshotId: snapshot.id,
        queryThemeId: snapshot.theme_id,
        candidateId: candidateIdByEpisodeId.get(candidate.candidateEpisodeId) ?? crypto.randomUUID(),
        candidateEpisodeId: candidate.candidateEpisodeId,
        analogFuturePathSummary: {
          peak_day: outcome.peakDay,
          total_days: outcome.totalDays,
          final_stage: outcome.finalStage,
          post_peak_drawdown: outcome.postPeakDrawdown,
        },
        retrievalReason: buildRetrievalReason({
          surface: candidate.retrievalSurface,
          featureSim: candidate.featureSim,
          curveSim: candidate.curveSim,
          regimeMatch: candidate.regimeMatch,
        }),
        mismatchSummary: buildMismatchSummary({
          queryDay: snapshot.days_since_episode_start,
          candidatePeakDay: outcome.peakDay,
          candidateTotalDays: outcome.totalDays,
        }),
        analogSupportCount: aggregated.length,
        candidateConcentrationGini: gini,
        top1AnalogWeight: top1Weight,
        policyVersions,
      }))
    }
  }

  if (analogCandidateRows.length > 0) {
    await batchUpsert(
      'analog_candidates_v1',
      analogCandidateRows,
      'query_snapshot_id,candidate_episode_id,retrieval_surface',
      'phase0 analog candidates',
    )
  }

  if (analogEvidenceRows.length > 0) {
    console.log('\n💾 phase0 analog evidence 저장 중...')
    for (let index = 0; index < analogEvidenceRows.length; index += 500) {
      const batch = analogEvidenceRows.slice(index, index + 500)
      const { error } = await supabaseAdmin
        .from('analog_evidence_v1')
        .insert(batch)
      if (error) {
        throw new Error(`phase0 analog evidence insert failed: ${error.message}`)
      }
    }
    console.log(`   ✅ ${analogEvidenceRows.length}개 phase0 analog evidence 저장 완료`)
  }

  return {
    stateHistoryBackfillCount: insertedCount,
    episodeCount: episodeSeeds.length,
    querySnapshotCount: querySnapshotRows.length,
    labelCount: labelRows.length,
    analogCandidateCount: analogCandidateRows.length,
    analogEvidenceCount: analogEvidenceRows.length,
  }
}
