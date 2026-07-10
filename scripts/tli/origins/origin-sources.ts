// TLI v3 Todo 6: Monday cutoff 시점의 source 선택.
// cutoff **이하** source만 읽는다. 046 RPC가 동일 규칙으로 재검증하므로 여기서 고른 값이
// 하나라도 다르면 manifest 생성이 거부된다 (fail-closed).

import { compareUtf8Bytes } from '@/lib/tli/canonical-json'
import { addKoreanTradingDays, getKoreanTradingDateWindow } from '@/lib/tli/trading-calendar'
import { supabaseAdmin } from '@/scripts/tli/shared/supabase-admin'
import { keysetOrExpression, paginateByKeyset } from '@/scripts/tli/shared/keyset'
import { z } from 'zod'
import { keywordGroupSha256, type KeywordGroupSpec } from '@/scripts/tli/collectors/collection-run-contract'
import type { AttentionStudyContract } from '@/scripts/tli/collectors/babl-phase-snapshot'
import { forecastCutoffUtc, INTEREST_INPUT_SLOTS, NEWS_INPUT_SLOTS } from './forecast-origin-manifest'
import type { ForecastThemeSource, StudyBablCandidate } from './forecast-origin-manifest'

// ── Pure selectors ──

export interface PitInterestRunCandidate {
  readonly id: string
  readonly themeId: string
  readonly responseSha256: string
  readonly sourceMaxDate: string
  readonly collectedAt: string
  readonly completedAt: string
  readonly keywordGroupSpec: KeywordGroupSpec
  readonly keywordGroupSha256: string
  readonly tradingDates: readonly string[]
}

const recordedInterestRequestSchema = z.object({
  keywordGroups: z.array(z.object({ groupName: z.string().min(1), keywords: z.array(z.string().min(1)).min(1) })).min(1),
})

export const recordedKeywordGroupSpec = (
  requestPayload: unknown,
  expectedSha256: string,
): KeywordGroupSpec | null => {
  const request = recordedInterestRequestSchema.parse(requestPayload)
  const matches = request.keywordGroups
    .map((group) => ({ group_name: group.groupName, keywords: [...group.keywords] }))
    .filter((spec) => keywordGroupSha256(spec) === expectedSha256)
  return matches.length === 1 ? matches[0] : null
}

const tradingDatesEndingAt = (baseDate: string, slots: number): string[] =>
  getKoreanTradingDateWindow({ baseDate, startOffset: -(slots - 1), endOffset: 0 })

// WHY: current themes/theme_keywords는 지연 backfill 시점에 따라 바뀐다. expected universe와 keyword는
// origin cutoff 이하 immutable interest run 중 RPC가 받을 exact 20-slot 최신 run에서만 파생해야 한다.
export const selectPitForecastSources = (
  candidates: readonly PitInterestRunCandidate[],
  originDate: string,
): ForecastThemeSource[] => {
  const cutoffIso = forecastCutoffUtc(originDate)
  const previousTradingDate = addKoreanTradingDays(originDate, -1)
  const eligible = candidates.filter((candidate) => {
    const requiredDates = tradingDatesEndingAt(candidate.sourceMaxDate, INTEREST_INPUT_SLOTS)
    const observedDates = [...candidate.tradingDates].sort(compareUtf8Bytes)
    return candidate.collectedAt <= cutoffIso
      && candidate.completedAt <= cutoffIso
      && candidate.sourceMaxDate >= previousTradingDate
      && candidate.sourceMaxDate <= originDate
      && candidate.keywordGroupSha256 === keywordGroupSha256(candidate.keywordGroupSpec)
      && observedDates.length === requiredDates.length
      && observedDates.every((date, index) => date === requiredDates[index])
  }).sort((left, right) => {
    if (left.themeId !== right.themeId) return compareUtf8Bytes(left.themeId, right.themeId)
    if (left.sourceMaxDate !== right.sourceMaxDate) return left.sourceMaxDate < right.sourceMaxDate ? 1 : -1
    if (left.completedAt !== right.completedAt) return left.completedAt < right.completedAt ? 1 : -1
    return compareUtf8Bytes(right.id, left.id)
  })

  const latestByTheme = new Map<string, PitInterestRunCandidate>()
  for (const candidate of eligible) {
    if (!latestByTheme.has(candidate.themeId)) latestByTheme.set(candidate.themeId, candidate)
  }

  return [...latestByTheme.values()].map((candidate) => ({
    themeId: candidate.themeId,
    keywordGroupSpec: candidate.keywordGroupSpec,
    interestRun: { id: candidate.id, responseSha256: candidate.responseSha256 },
    newsObservationIds: null,
  }))
}

const newsObservationRowSchema = z.object({ id: z.string().uuid(), article_date: z.string(), collected_at: z.string() })
type NewsObservationRow = z.infer<typeof newsObservationRowSchema>
const NEWS_OBSERVATION_KEYSET = { first: 'article_date', second: 'collected_at', third: 'id' } as const

// 046은 각 date의 최신 `(collected_at, id)` 1건을 article_date 오름차순으로 고정한다.
const selectNewsObservationIds = (
  rows: readonly NewsObservationRow[],
  expectedDates: readonly string[],
): string[] | null => {
  const latestByDate = new Map<string, NewsObservationRow>()

  for (const row of rows) {
    const current = latestByDate.get(row.article_date)
    if (
      !current
      || row.collected_at > current.collected_at
      || (row.collected_at === current.collected_at && compareUtf8Bytes(row.id, current.id) > 0)
    ) {
      latestByDate.set(row.article_date, row)
    }
  }

  const ordered: string[] = []
  for (const date of expectedDates) {
    const row = latestByDate.get(date)
    // row 부재는 0건이 아니라 source missing이다.
    if (!row) return null
    ordered.push(row.id)
  }

  return ordered.length === NEWS_INPUT_SLOTS ? ordered : null
}

// 046 RPC와 같은 origin_date 이하 최근 14개 KOSPI 거래일.
export const newsExpectedDates = (originDate: string): string[] =>
  tradingDatesEndingAt(originDate, NEWS_INPUT_SLOTS)

const bablObservationRowSchema = z.object({
  id: z.string().uuid(), theme_id: z.string().uuid(), payload_hash: z.string(),
  candidate_pool: z.string(), computed_at: z.string(),
  run: z.object({ status: z.string(), collected_at: z.string(), completed_at: z.string() }).nullable(),
  snapshot: z.object({
    candidate_pool: z.string(), created_at: z.string(),
    comparison_run: z.object({ status: z.string(), candidate_pool: z.string() }).nullable(),
  }).nullable(),
})
type BablObservationRow = z.infer<typeof bablObservationRowSchema>

// 046 `bind_tli_study_origin`이 적격성을 판정하는 세 조건을 그대로 계산한다.
const toStudyBablCandidate = (row: BablObservationRow, cutoffIso: string): StudyBablCandidate => ({
  observationId: row.id,
  payloadHash: row.payload_hash,
  candidatePool: row.candidate_pool,
  sourceRunComplete: row.run?.status === 'complete',
  withinCutoff: row.computed_at <= cutoffIso
    && (row.run?.collected_at ?? '') <= cutoffIso
    && (row.run?.completed_at ?? '') <= cutoffIso
    && (row.snapshot?.created_at ?? '') <= cutoffIso,
  poolMatchesSource: row.snapshot !== null
    && row.candidate_pool === row.snapshot.candidate_pool
    && row.snapshot.comparison_run !== null
    && row.snapshot.candidate_pool === row.snapshot.comparison_run.candidate_pool
    && ['complete', 'published'].includes(row.snapshot.comparison_run.status),
})

// ── Supabase IO ──

const interestRunRowSchema = z.object({
  id: z.string().uuid(),
  response_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  source_max_date: z.string(),
  collected_at: z.string(),
  completed_at: z.string(),
  keyword_group_hash: z.string().regex(/^[0-9a-f]{64}$/),
  request_payload: z.unknown(),
})

const interestObservationRowSchema = z.object({ theme_id: z.string().uuid(), trading_date: z.string() })
type InterestRunRow = z.infer<typeof interestRunRowSchema>

const INTEREST_RUN_KEYSET = { first: 'source_max_date', second: 'completed_at', third: 'id' } as const

const loadPitInterestRunRows = (input: { readonly originDate: string; readonly cutoffIso: string }): Promise<InterestRunRow[]> => paginateByKeyset({
  pageSize: 1000,
  keyOf: (row: InterestRunRow) => ({ first: row.source_max_date, second: row.completed_at, third: row.id }),
  fetchPage: async (after) => {
    let query = supabaseAdmin.from('tli_collection_runs')
      .select('id, response_sha256, source_max_date, collected_at, completed_at, keyword_group_hash, request_payload')
      .eq('source', 'naver_datalab').eq('status', 'complete')
      .lte('collected_at', input.cutoffIso).lte('completed_at', input.cutoffIso)
      .gte('source_max_date', addKoreanTradingDays(input.originDate, -1)).lte('source_max_date', input.originDate)
    if (after !== null) query = query.or(keysetOrExpression(INTEREST_RUN_KEYSET, after))
    const { data, error } = await query.order('source_max_date').order('completed_at').order('id').limit(1000)
    if (error) throw new Error(`interest run 조회 실패: ${error.message}`)
    return interestRunRowSchema.array().parse(data ?? [])
  },
})

const loadPitInterestRunCandidates = async (input: { readonly originDate: string; readonly cutoffIso: string }): Promise<PitInterestRunCandidate[]> => {
  const candidates: PitInterestRunCandidate[] = []
  for (const run of await loadPitInterestRunRows(input)) {
    const { data: observations, error: observationError } = await supabaseAdmin
      .from('tli_interest_observations')
      .select('theme_id, trading_date')
      .eq('collection_run_id', run.id)
      .eq('source', 'naver_datalab')
      .order('trading_date', { ascending: true })

    if (observationError) throw new Error(`interest observation 조회 실패: ${observationError.message}`)
    const rows = interestObservationRowSchema.array().parse(observations ?? [])
    const themeIds = [...new Set(rows.map((row) => row.theme_id))]
    const spec = recordedKeywordGroupSpec(run.request_payload, run.keyword_group_hash)
    if (themeIds.length !== 1 || spec === null) continue
    candidates.push({
      id: run.id,
      themeId: themeIds[0],
      responseSha256: run.response_sha256,
      sourceMaxDate: run.source_max_date,
      collectedAt: run.collected_at,
      completedAt: run.completed_at,
      keywordGroupSpec: spec,
      keywordGroupSha256: run.keyword_group_hash,
      tradingDates: rows.map((row) => row.trading_date),
    })
  }

  return candidates
}

const loadNewsObservationIds = async (input: {
  readonly themeId: string; readonly keywordGroupSha256: string
  readonly expectedDates: readonly string[]; readonly cutoffIso: string
}): Promise<string[] | null> => {
  const rows = await paginateByKeyset<NewsObservationRow>({
    pageSize: 1000,
    keyOf: (row) => ({ first: row.article_date, second: row.collected_at, third: row.id }),
    fetchPage: async (after) => {
      let query = supabaseAdmin.from('tli_news_observations')
        .select('id, article_date, collected_at, run:tli_collection_runs!inner(status, collected_at, completed_at)')
        .eq('theme_id', input.themeId).eq('query_hash', input.keywordGroupSha256)
        .gte('article_date', input.expectedDates[0]).lte('article_date', input.expectedDates[input.expectedDates.length - 1])
        .lte('collected_at', input.cutoffIso).eq('run.status', 'complete')
        .lte('run.collected_at', input.cutoffIso).lte('run.completed_at', input.cutoffIso)
      if (after !== null) query = query.or(keysetOrExpression(NEWS_OBSERVATION_KEYSET, after))
      const { data, error } = await query.order('article_date').order('collected_at').order('id').limit(1000)
      if (error) throw new Error(`news observation 조회 실패: ${error.message}`)
      return newsObservationRowSchema.array().parse(data ?? [])
    },
  })
  return selectNewsObservationIds(rows, input.expectedDates)
}

export const loadForecastThemeSources = async (
  input: { readonly originDate: string },
): Promise<ForecastThemeSource[]> => {
  const cutoffIso = forecastCutoffUtc(input.originDate)
  const expectedDates = newsExpectedDates(input.originDate)
  const selectedSources = selectPitForecastSources(
    await loadPitInterestRunCandidates({ originDate: input.originDate, cutoffIso }),
    input.originDate,
  )
  const sources: ForecastThemeSource[] = []

  for (const source of selectedSources) {
    const newsObservationIds = await loadNewsObservationIds({
      themeId: source.themeId,
      keywordGroupSha256: keywordGroupSha256(source.keywordGroupSpec),
      expectedDates,
      cutoffIso,
    })
    sources.push({ ...source, newsObservationIds })
  }

  return sources
}

export const loadStudyBablCandidates = async (input: {
  readonly originDate: string
  readonly themeIds: readonly string[]
  readonly study: AttentionStudyContract
}): Promise<Map<string, StudyBablCandidate[]>> => {
  const cutoffIso = forecastCutoffUtc(input.originDate)

  const { data, error } = await supabaseAdmin
    .from('tli_babl_phase_observations')
    .select(`
      id, theme_id, payload_hash, candidate_pool, computed_at,
      run:tli_collection_runs!inner(status, collected_at, completed_at),
      snapshot:prediction_snapshots_v2!inner(
        candidate_pool, created_at, run_type,
        comparison_run:theme_comparison_runs_v2!inner(status, candidate_pool)
      )
    `)
    .eq('snapshot_date', input.originDate)
    .eq('algorithm_version', input.study.babl_algorithm_version)
    .eq('comparison_spec_version', input.study.babl_comparison_spec_version)
    .eq('evaluation_horizon_days', input.study.babl_evaluation_horizon_days)
    .eq('snapshot.run_type', 'prod')
    .in('theme_id', [...input.themeIds])

  if (error) throw new Error(`B-Abl observation 조회 실패: ${error.message}`)

  const byTheme = new Map<string, StudyBablCandidate[]>()
  for (const row of bablObservationRowSchema.array().parse(data ?? [])) {
    const candidates = byTheme.get(row.theme_id) ?? []
    candidates.push(toStudyBablCandidate(row, cutoffIso))
    byTheme.set(row.theme_id, candidates)
  }

  return byTheme
}
