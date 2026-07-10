/**
 * TLI v3 Todo 5: Theme-Stock Bitemporal Membership History — Pure Functions
 *
 * business time  : [valid_from, COALESCE(valid_to,'infinity'))
 * system-known   : [recorded_at, COALESCE(superseded_at,'infinity'))
 *
 * 수집 diff는 기존 version을 절대 덮어쓰지 않는다. 제거/변경은 열린 version을 한 번 닫고
 * (superseded_at) 대체 version을 append하므로, 이미 확정된 as-of 결과는 이후 수집으로 변하지 않는다.
 * 관측 이전 구간은 fabricated backfill 대신 absent로 남긴다.
 */

// ── Types ──

export interface MembershipHistoryRow {
  readonly id: string
  readonly theme_id: string
  readonly symbol: string
  readonly valid_from: string
  readonly valid_to: string | null
  readonly recorded_at: string
  readonly superseded_at: string | null
  readonly source: string
  readonly collection_run_id: string | null
  readonly relevance: number | null
  readonly market: string | null
}

export interface ObservedThemeStock {
  readonly themeId: string
  readonly symbol: string
  readonly relevance: number | null
  readonly market: string | null
}

export interface MembershipHistoryInsert {
  readonly theme_id: string
  readonly symbol: string
  readonly valid_from: string
  readonly valid_to: string | null
  readonly recorded_at: string
  readonly source: string
  readonly collection_run_id: string | null
  readonly relevance: number | null
  readonly market: string | null
}

export interface MembershipHistoryClose {
  readonly id: string
  readonly superseded_at: string
}

/** 한 (theme, symbol) 키의 원자적 전이: 기존 version을 닫고 대체 version들을 append */
export interface MembershipHistoryTransition {
  readonly themeId: string
  readonly symbol: string
  readonly close: MembershipHistoryClose
  readonly replacements: readonly MembershipHistoryInsert[]
}

export interface MembershipHistoryDiff {
  /** 열린 version이 없는 신규 매핑 — 충돌 없이 일괄 append 가능 */
  readonly opens: readonly MembershipHistoryInsert[]
  /** 제거/속성 변경 — close 후 replacement append (키 단위 순차 적용) */
  readonly transitions: readonly MembershipHistoryTransition[]
}

export interface PlanMembershipHistoryDiffInput {
  readonly observed: readonly ObservedThemeStock[]
  /** 이번 수집이 실제로 관측한 테마만 diff 대상 — 스크래핑 실패 테마의 매핑을 제거로 오판하지 않는다 */
  readonly observedThemeIds: readonly string[]
  /** valid_to IS NULL AND superseded_at IS NULL 인 행만 전달해야 한다 */
  readonly openRows: readonly MembershipHistoryRow[]
  readonly observedDate: string
  readonly recordedAt: string
  readonly source: string
  readonly collectionRunId: string | null
}

// ── Helpers ──

const membershipKey = (themeId: string, symbol: string): string => `${themeId}|${symbol}`

/** NUMERIC(3,2) 왕복 후에도 동일 판정이 되도록 2자리에서 비교한다 */
const normalizeRelevance = (relevance: number | null): number | null => (
  relevance === null || !Number.isFinite(relevance) ? null : Math.round(relevance * 100) / 100
)

const hasSameAttributes = (row: MembershipHistoryRow, observed: ObservedThemeStock): boolean => (
  normalizeRelevance(row.relevance) === normalizeRelevance(observed.relevance)
  && row.market === observed.market
)

const toEpochMs = (timestamp: string): number => {
  const millis = Date.parse(timestamp)
  if (!Number.isFinite(millis)) throw new Error(`잘못된 타임스탬프: ${timestamp}`)
  return millis
}

const buildReplacements = (input: {
  readonly row: MembershipHistoryRow
  readonly observed: ObservedThemeStock | null
  readonly observedDate: string
  readonly recordedAt: string
  readonly source: string
  readonly collectionRunId: string | null
}): MembershipHistoryInsert[] => {
  const replacements: MembershipHistoryInsert[] = []

  // 기존 version이 실제로 유효했던 business-time 구간만 닫힌 segment로 보존한다.
  // valid_from >= observedDate면 유효 구간이 비어 있으므로(system-time 정정) segment를 만들지 않는다.
  if (input.row.valid_from < input.observedDate) {
    replacements.push({
      theme_id: input.row.theme_id,
      symbol: input.row.symbol,
      valid_from: input.row.valid_from,
      valid_to: input.observedDate,
      recorded_at: input.recordedAt,
      source: input.source,
      collection_run_id: input.collectionRunId,
      relevance: input.row.relevance,
      market: input.row.market,
    })
  }

  if (input.observed !== null) {
    replacements.push({
      theme_id: input.row.theme_id,
      symbol: input.row.symbol,
      valid_from: input.observedDate,
      valid_to: null,
      recorded_at: input.recordedAt,
      source: input.source,
      collection_run_id: input.collectionRunId,
      relevance: input.observed.relevance,
      market: input.observed.market,
    })
  }

  return replacements
}

// ── Collector Diff ──

/**
 * 이번 관측과 열린 version을 대조해 append-only 전이 계획을 만든다.
 * - 신규: open row append
 * - 제거: 기존 version supersede + 닫힌 business-time segment append
 * - 속성 변경: 기존 version supersede + 닫힌 segment + 새 open segment append
 */
export const planMembershipHistoryDiff = (
  input: PlanMembershipHistoryDiffInput,
): MembershipHistoryDiff => {
  const observedThemeIds = new Set(input.observedThemeIds)
  const observedByKey = new Map<string, ObservedThemeStock>()
  for (const observed of input.observed) {
    if (!observedThemeIds.has(observed.themeId)) continue
    observedByKey.set(membershipKey(observed.themeId, observed.symbol), observed)
  }

  const openByKey = new Map<string, MembershipHistoryRow>()
  for (const row of input.openRows) {
    if (row.valid_to !== null || row.superseded_at !== null) continue
    if (!observedThemeIds.has(row.theme_id)) continue
    openByKey.set(membershipKey(row.theme_id, row.symbol), row)
  }

  const opens: MembershipHistoryInsert[] = []
  const transitions: MembershipHistoryTransition[] = []

  for (const [key, observed] of observedByKey) {
    const openRow = openByKey.get(key)

    if (!openRow) {
      opens.push({
        theme_id: observed.themeId,
        symbol: observed.symbol,
        valid_from: input.observedDate,
        valid_to: null,
        recorded_at: input.recordedAt,
        source: input.source,
        collection_run_id: input.collectionRunId,
        relevance: observed.relevance,
        market: observed.market,
      })
      continue
    }

    if (hasSameAttributes(openRow, observed)) continue

    transitions.push({
      themeId: observed.themeId,
      symbol: observed.symbol,
      close: { id: openRow.id, superseded_at: input.recordedAt },
      replacements: buildReplacements({
        row: openRow,
        observed,
        observedDate: input.observedDate,
        recordedAt: input.recordedAt,
        source: input.source,
        collectionRunId: input.collectionRunId,
      }),
    })
  }

  for (const [key, openRow] of openByKey) {
    if (observedByKey.has(key)) continue

    transitions.push({
      themeId: openRow.theme_id,
      symbol: openRow.symbol,
      close: { id: openRow.id, superseded_at: input.recordedAt },
      replacements: buildReplacements({
        row: openRow,
        observed: null,
        observedDate: input.observedDate,
        recordedAt: input.recordedAt,
        source: input.source,
        collectionRunId: input.collectionRunId,
      }),
    })
  }

  return { opens, transitions }
}

// ── Bitemporal As-Of Query ──

export interface MembershipAsOfQuery {
  /** 생략 시 전체 테마 */
  readonly themeId?: string
  readonly baseDate: string
  readonly cutoff: string
}

/**
 * base_date의 business time과 cutoff의 system-known time을 동시에 만족하는 version만 반환한다.
 * 현재 theme_stocks.is_active를 절대 참조하지 않으므로 이후 활성/비활성 변경이 과거 결과를 바꾸지 못한다.
 */
export const selectMembershipAsOf = (
  rows: readonly MembershipHistoryRow[],
  query: MembershipAsOfQuery,
): MembershipHistoryRow[] => {
  const cutoffMs = toEpochMs(query.cutoff)

  return rows.filter((row) => {
    if (query.themeId !== undefined && row.theme_id !== query.themeId) return false
    if (row.valid_from > query.baseDate) return false
    if (row.valid_to !== null && query.baseDate >= row.valid_to) return false
    if (toEpochMs(row.recorded_at) > cutoffMs) return false
    if (row.superseded_at !== null && cutoffMs >= toEpochMs(row.superseded_at)) return false
    return true
  })
}

/** as-of 시점의 종목 심볼 집합 (오름차순 정렬, 중복 제거) */
export const selectMembershipSymbolsAsOf = (
  rows: readonly MembershipHistoryRow[],
  query: MembershipAsOfQuery,
): string[] => [
  ...new Set(selectMembershipAsOf(rows, query).map((row) => row.symbol)),
].sort((left, right) => left.localeCompare(right))
