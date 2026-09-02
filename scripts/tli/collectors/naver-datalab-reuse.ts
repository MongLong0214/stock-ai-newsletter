import { parseDatalabResponse, type NaverDatalabResponse } from './naver-datalab-api'
import {
  keysetOrExpression,
  paginateByKeyset,
  type KeysetCursor,
} from '../shared/keyset'

export interface ReusableDatalabRun {
  readonly id: string
  readonly source_max_date: string | null
  readonly response_payload: unknown
}

interface StoredDatalabRun extends ReusableDatalabRun {
  readonly request_sha256: string
  readonly completed_at: string
}

export type DatalabReuseTransport = (input: {
  readonly completedAfter: string
  readonly after: KeysetCursor | null
  readonly pageSize: number
}) => Promise<readonly StoredDatalabRun[]>

const DATALAB_REUSE_PAGE_SIZE = 1_000
// The shared primitive has a three-part cursor; repeating the unique id preserves the
// intended (completed_at, id) total order without introducing another sort key.
const DATALAB_REUSE_KEYSET = { first: 'completed_at', second: 'id', third: 'id' } as const

const supabaseReuseTransport: DatalabReuseTransport = async ({ completedAfter, after, pageSize }) => {
  const { supabaseAdmin } = await import('@/scripts/tli/shared/supabase-admin')
  let query = supabaseAdmin
    .from('tli_collection_runs')
    .select('id, request_sha256, source_max_date, response_payload, completed_at')
    .eq('source', 'naver_datalab')
    .eq('status', 'complete')
    .gte('completed_at', completedAfter)
  if (after !== null) query = query.or(keysetOrExpression(DATALAB_REUSE_KEYSET, after))
  const { data, error } = await query
    .order('completed_at')
    .order('id')
    .limit(pageSize)

  if (error) throw new Error(`오늘 DataLab run 조회 실패: ${error.message}`)
  return (data ?? []) as StoredDatalabRun[]
}

export const loadTodayCompleteDatalabRuns = async (input: {
  readonly kstDate: string
  readonly transport?: DatalabReuseTransport
}): Promise<Map<string, ReusableDatalabRun>> => {
  const completedAfter = `${input.kstDate}T00:00:00+09:00`
  const transport = input.transport ?? supabaseReuseTransport
  const rows = await paginateByKeyset({
    pageSize: DATALAB_REUSE_PAGE_SIZE,
    fetchPage: (after) => transport({
      completedAfter,
      after,
      pageSize: DATALAB_REUSE_PAGE_SIZE,
    }),
    keyOf: (row: StoredDatalabRun) => ({
      first: row.completed_at,
      second: row.id,
      third: row.id,
    }),
  })
  const runs = new Map<string, ReusableDatalabRun>()
  for (const row of rows) {
    // Keyset order is oldest to newest, so later rows replace older runs for the same request.
    runs.set(row.request_sha256, {
      id: row.id,
      source_max_date: row.source_max_date,
      response_payload: row.response_payload,
    })
  }
  return runs
}

export const isReusableRun = (
  run: ReusableDatalabRun,
  input: { readonly requestWindowEnd: string; readonly previousTradingDate: string },
): boolean => {
  const freshFloor = input.requestWindowEnd < input.previousTradingDate
    ? input.requestWindowEnd
    : input.previousTradingDate
  return run.source_max_date !== null && run.source_max_date >= freshFloor
}

export const parseReusableDatalabResponse = (run: ReusableDatalabRun): NaverDatalabResponse =>
  parseDatalabResponse(run.response_payload)

export const isDatalabForceRefresh = (
  value = process.env.TLI_DATALAB_FORCE_REFRESH,
): boolean => value === 'true'
