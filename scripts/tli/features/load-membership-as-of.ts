import { supabaseAdmin } from '@/scripts/tli/shared/supabase-admin'
import {
  selectMembershipAsOf,
  selectMembershipSymbolsAsOf,
  type MembershipHistoryRow,
} from '@/scripts/tli/themes/theme-membership-history'

export const MEMBERSHIP_HISTORY_COLUMNS =
  'id, theme_id, symbol, valid_from, valid_to, recorded_at, superseded_at, source, collection_run_id, relevance, market'

export interface LoadMembershipAsOfRequest {
  readonly themeId: string
  /** business time 기준일 */
  readonly baseDate: string
  /** system-known time 기준 forecast cutoff (ISO timestamp) */
  readonly cutoff: string
}

interface QueryError {
  readonly message: string
}

interface RangeQuery<T> {
  range(from: number, to: number): PromiseLike<{
    readonly data: readonly T[] | null
    readonly error: QueryError | null
  }>
}

const PAGE_SIZE = 1000

const fetchAllRows = async <T>(createQuery: () => RangeQuery<T>): Promise<T[]> => {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await createQuery().range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(`membership as-of 로딩 실패: ${error.message}`)
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE_SIZE) return rows
  }
}

/**
 * bitemporal as-of membership 조회.
 * `valid_from <= base_date < COALESCE(valid_to,'infinity')` 와
 * `recorded_at <= cutoff < COALESCE(superseded_at,'infinity')` 를 모두 만족하는 version만 반환한다.
 *
 * theme_stocks(current cache)와 is_active는 참조하지 않는다. current 활성 상태는 과거 시점의
 * 사실이 아니므로 이를 PIT 근거로 쓰면 membership leakage가 발생한다.
 * 관측 이전 구간에 행이 없으면 그 시점 membership은 absent가 정답이며 추정 backfill하지 않는다.
 */
export async function loadThemeStockMembershipAsOf(
  request: LoadMembershipAsOfRequest,
): Promise<MembershipHistoryRow[]> {
  const rows = await fetchAllRows<MembershipHistoryRow>(() => supabaseAdmin
    .from('theme_stock_membership_history')
    .select(MEMBERSHIP_HISTORY_COLUMNS)
    .eq('theme_id', request.themeId)
    .lte('valid_from', request.baseDate)
    .lte('recorded_at', request.cutoff)
    .or(`valid_to.is.null,valid_to.gt.${request.baseDate}`)
    .or(`superseded_at.is.null,superseded_at.gt.${request.cutoff}`)
    .order('valid_from', { ascending: true })
    .order('symbol', { ascending: true })
    .order('id', { ascending: true }))

  // 서버 필터는 인덱스 활용용이고, 계약 판정은 항상 순수 predicate가 다시 강제한다.
  return selectMembershipAsOf(rows, {
    themeId: request.themeId,
    baseDate: request.baseDate,
    cutoff: request.cutoff,
  })
}

/** as-of 시점의 종목 심볼 집합 */
export async function loadThemeStockSymbolsAsOf(
  request: LoadMembershipAsOfRequest,
): Promise<string[]> {
  const rows = await loadThemeStockMembershipAsOf(request)
  return selectMembershipSymbolsAsOf(rows, {
    themeId: request.themeId,
    baseDate: request.baseDate,
    cutoff: request.cutoff,
  })
}
