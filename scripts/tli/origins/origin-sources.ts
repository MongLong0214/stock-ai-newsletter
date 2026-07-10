/**
 * TLI v3 Todo 6: Monday cutoff 시점의 source 선택.
 *
 * cutoff **이하** source만 읽는다. 046 RPC가 동일 규칙으로 재검증하므로 여기서 고른 값이
 * 하나라도 다르면 manifest 생성이 거부된다 (fail-closed).
 */

import { compareUtf8Bytes } from '@/lib/tli/canonical-json'
import { supabaseAdmin } from '@/scripts/tli/shared/supabase-admin'
import {
  calendarDatesBetween,
  keywordGroupSha256,
  resolveThemeKeywordGroup,
  type KeywordGroupSpec,
} from '@/scripts/tli/collectors/collection-run-contract'
import type { AttentionStudyContract } from '@/scripts/tli/collectors/babl-phase-snapshot'
import {
  forecastCutoffUtc,
  INTEREST_INPUT_SLOTS,
  NEWS_INPUT_SLOTS,
  type ForecastThemeSource,
  type StudyBablCandidate,
} from './forecast-origin-manifest'

export interface OriginTheme {
  readonly id: string
  readonly name: string
  readonly naverKeywords: string[]
}

// ── Pure selectors ──

export interface InterestRunCandidate {
  readonly id: string
  readonly response_sha256: string
  readonly completed_at: string
  /** 이 run 안에서 해당 테마의 `trading_date <= origin_date` 관측 수 */
  readonly slotCount: number
}

/**
 * 046은 usable child의 run이 "20 slot을 가진 cutoff 이하 최신 complete single run"이기를 요구하고
 * `completed_at DESC, id DESC`로 그 최신 run을 스스로 다시 고른다. 정렬 규칙이 어긋나면 RPC가 거부한다.
 */
export const selectForecastInterestRun = (
  candidates: readonly InterestRunCandidate[],
): { readonly id: string; readonly responseSha256: string } | null => {
  const eligible = candidates
    .filter((candidate) => candidate.slotCount === INTEREST_INPUT_SLOTS)
    .sort((left, right) => {
      if (left.completed_at !== right.completed_at) {
        return left.completed_at < right.completed_at ? 1 : -1
      }
      return compareUtf8Bytes(right.id, left.id)
    })

  const latest = eligible.at(0)
  return latest ? { id: latest.id, responseSha256: latest.response_sha256 } : null
}

export interface NewsObservationRow {
  readonly id: string
  readonly article_date: string
  readonly collected_at: string
}

/** 046은 각 date의 최신 `(collected_at, id)` 1건을 article_date 오름차순으로 고정한다. */
export const selectNewsObservationIds = (
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

/** origin_date 기준 14개 달력일 (046 `origin_date - (13 - offset)`와 동일) */
export const newsExpectedDates = (originDate: string): string[] => {
  const dates = calendarDatesBetween(
    new Date(Date.parse(`${originDate}T00:00:00.000Z`) - 13 * 86_400_000).toISOString().slice(0, 10),
    originDate,
  )
  return dates
}

export interface BablObservationRow {
  readonly id: string
  readonly payload_hash: string
  readonly candidate_pool: string
  readonly computed_at: string
  readonly run: { readonly status: string; readonly collected_at: string; readonly completed_at: string } | null
  readonly snapshot: {
    readonly candidate_pool: string
    readonly created_at: string
    readonly comparison_run: { readonly status: string; readonly candidate_pool: string } | null
  } | null
}

/** 046 `bind_tli_study_origin`이 적격성을 판정하는 세 조건을 그대로 계산한다. */
export const toStudyBablCandidate = (row: BablObservationRow, cutoffIso: string): StudyBablCandidate => {
  const sourceRunComplete = row.run?.status === 'complete'
  const withinCutoff =
    row.computed_at <= cutoffIso
    && (row.run?.collected_at ?? '') <= cutoffIso
    && (row.run?.completed_at ?? '') <= cutoffIso
    && (row.snapshot?.created_at ?? '') <= cutoffIso
  const poolMatchesSource =
    row.snapshot !== null
    && row.candidate_pool === row.snapshot.candidate_pool
    && row.snapshot.comparison_run !== null
    && row.snapshot.candidate_pool === row.snapshot.comparison_run.candidate_pool
    && ['complete', 'published'].includes(row.snapshot.comparison_run.status)

  return {
    observationId: row.id,
    payloadHash: row.payload_hash,
    candidatePool: row.candidate_pool,
    sourceRunComplete,
    withinCutoff,
    poolMatchesSource,
  }
}

// ── Supabase IO ──

const interestRunCandidates = async (input: {
  readonly themeId: string
  readonly keywordGroupSha256: string
  readonly originDate: string
  readonly cutoffIso: string
}): Promise<InterestRunCandidate[]> => {
  const { data: runs, error } = await supabaseAdmin
    .from('tli_collection_runs')
    .select('id, response_sha256, completed_at, request_window_start, request_window_end')
    .eq('source', 'naver_datalab')
    .eq('status', 'complete')
    .eq('keyword_group_hash', input.keywordGroupSha256)
    .lte('collected_at', input.cutoffIso)
    .lte('completed_at', input.cutoffIso)
    .lte('source_max_date', input.originDate)
    .order('completed_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(5)

  if (error) throw new Error(`interest run 조회 실패: ${error.message}`)

  const candidates: InterestRunCandidate[] = []
  for (const run of runs ?? []) {
    const { count, error: countError } = await supabaseAdmin
      .from('tli_interest_observations')
      .select('*', { count: 'exact', head: true })
      .eq('collection_run_id', run.id)
      .eq('theme_id', input.themeId)
      .eq('source', 'naver_datalab')
      .gte('trading_date', run.request_window_start)
      .lte('trading_date', run.request_window_end)
      .lte('trading_date', input.originDate)

    if (countError) throw new Error(`interest observation 카운트 실패: ${countError.message}`)
    if (run.response_sha256 === null) continue

    candidates.push({
      id: run.id,
      response_sha256: run.response_sha256,
      completed_at: run.completed_at,
      slotCount: count ?? 0,
    })
  }

  return candidates
}

const newsObservationRows = async (input: {
  readonly themeId: string
  readonly keywordGroupSha256: string
  readonly expectedDates: readonly string[]
  readonly cutoffIso: string
}): Promise<NewsObservationRow[]> => {
  const { data, error } = await supabaseAdmin
    .from('tli_news_observations')
    .select('id, article_date, collected_at, run:tli_collection_runs!inner(status, collected_at, completed_at)')
    .eq('theme_id', input.themeId)
    .eq('query_hash', input.keywordGroupSha256)
    .gte('article_date', input.expectedDates[0])
    .lte('article_date', input.expectedDates[input.expectedDates.length - 1])
    .lte('collected_at', input.cutoffIso)
    .eq('run.status', 'complete')
    .lte('run.collected_at', input.cutoffIso)
    .lte('run.completed_at', input.cutoffIso)

  if (error) throw new Error(`news observation 조회 실패: ${error.message}`)
  return (data ?? []) as unknown as NewsObservationRow[]
}

export const loadForecastThemeSources = async (input: {
  readonly originDate: string
  readonly themes: readonly OriginTheme[]
}): Promise<ForecastThemeSource[]> => {
  const cutoffIso = forecastCutoffUtc(input.originDate)
  const expectedDates = newsExpectedDates(input.originDate)
  const sources: ForecastThemeSource[] = []

  for (const theme of input.themes) {
    const spec: KeywordGroupSpec = resolveThemeKeywordGroup(theme)
    const kwSha = keywordGroupSha256(spec)

    const interestRun = selectForecastInterestRun(
      await interestRunCandidates({ themeId: theme.id, keywordGroupSha256: kwSha, originDate: input.originDate, cutoffIso }),
    )

    const newsObservationIds = interestRun
      ? selectNewsObservationIds(
          await newsObservationRows({ themeId: theme.id, keywordGroupSha256: kwSha, expectedDates, cutoffIso }),
          expectedDates,
        )
      : null

    sources.push({ themeId: theme.id, keywordGroupSpec: spec, interestRun, newsObservationIds })
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
  for (const row of (data ?? []) as unknown as Array<BablObservationRow & { theme_id: string }>) {
    const candidates = byTheme.get(row.theme_id) ?? []
    candidates.push(toStudyBablCandidate(row, cutoffIso))
    byTheme.set(row.theme_id, candidates)
  }

  return byTheme
}
