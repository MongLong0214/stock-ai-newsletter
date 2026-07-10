import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  planMembershipHistoryDiff,
  selectMembershipAsOf,
  selectMembershipSymbolsAsOf,
  type MembershipHistoryDiff,
  type MembershipHistoryRow,
  type ObservedThemeStock,
} from '../themes/theme-membership-history'

const THEME = 'theme-a'
const OTHER_THEME = 'theme-z'
const SOURCE = 'naver'

const D1 = '2026-03-02'
const D2 = '2026-03-05'
const D3 = '2026-03-09'
const T1 = '2026-03-02T09:00:00.000Z'
const T2 = '2026-03-05T09:00:00.000Z'
const T3 = '2026-03-09T09:00:00.000Z'
const NOW = '2026-03-10T00:00:00.000Z'

const stock = (symbol: string, market = 'KOSPI'): ObservedThemeStock => ({
  themeId: THEME,
  symbol,
  relevance: 1.0,
  market,
})

/** in-memory 저장소: append-only + superseded_at 1회 close만 허용 (047 trigger와 동일 계약) */
class MembershipStore {
  private rows: MembershipHistoryRow[] = []
  private sequence = 0

  get all(): readonly MembershipHistoryRow[] {
    return this.rows
  }

  openRows(): MembershipHistoryRow[] {
    return this.rows.filter((row) => row.valid_to === null && row.superseded_at === null)
  }

  apply(diff: MembershipHistoryDiff): void {
    for (const insert of diff.opens) this.append(insert)
    for (const transition of diff.transitions) {
      const target = this.rows.find((row) => row.id === transition.close.id)
      if (!target) throw new Error(`close 대상 없음: ${transition.close.id}`)
      if (target.superseded_at !== null) throw new Error('closed row 재개방/재수정 시도')
      this.rows = this.rows.map((row) => (
        row.id === target.id ? { ...row, superseded_at: transition.close.superseded_at } : row
      ))
      for (const insert of transition.replacements) this.append(insert)
    }
    this.assertOpenUniqueness()
  }

  private append(insert: Omit<MembershipHistoryRow, 'id' | 'superseded_at'>): void {
    this.sequence += 1
    this.rows.push({ ...insert, id: `row-${this.sequence}`, superseded_at: null })
  }

  private assertOpenUniqueness(): void {
    const keys = this.openRows().map((row) => `${row.theme_id}|${row.symbol}`)
    if (new Set(keys).size !== keys.length) {
      throw new Error('uniq_theme_stock_membership_history_open 위반')
    }
  }
}

const collect = (
  store: MembershipStore,
  input: {
    observed: readonly ObservedThemeStock[]
    observedThemeIds?: readonly string[]
    observedDate: string
    recordedAt: string
  },
): MembershipHistoryDiff => {
  const diff = planMembershipHistoryDiff({
    observed: input.observed,
    observedThemeIds: input.observedThemeIds ?? [...new Set(input.observed.map((s) => s.themeId))],
    openRows: store.openRows(),
    observedDate: input.observedDate,
    recordedAt: input.recordedAt,
    source: SOURCE,
    collectionRunId: null,
  })
  store.apply(diff)
  return diff
}

/** add(D1) → remove B(D2) → reactivate B(D3) */
const buildAddRemoveReactivateStore = (): MembershipStore => {
  const store = new MembershipStore()
  collect(store, { observed: [stock('A'), stock('B')], observedDate: D1, recordedAt: T1 })
  collect(store, { observed: [stock('A')], observedDate: D2, recordedAt: T2 })
  collect(store, { observed: [stock('A'), stock('B')], observedDate: D3, recordedAt: T3 })
  return store
}

const symbolsAt = (store: MembershipStore, baseDate: string, cutoff = NOW): string[] =>
  selectMembershipSymbolsAsOf(store.all, { themeId: THEME, baseDate, cutoff })

describe('planMembershipHistoryDiff', () => {
  it('opens a new version for a newly observed mapping', () => {
    const store = new MembershipStore()
    const diff = collect(store, { observed: [stock('A')], observedDate: D1, recordedAt: T1 })

    expect(diff.transitions).toHaveLength(0)
    expect(diff.opens).toEqual([{
      theme_id: THEME,
      symbol: 'A',
      valid_from: D1,
      valid_to: null,
      recorded_at: T1,
      source: SOURCE,
      collection_run_id: null,
      relevance: 1.0,
      market: 'KOSPI',
    }])
  })

  it('is idempotent when the same mapping is observed again unchanged', () => {
    const store = new MembershipStore()
    collect(store, { observed: [stock('A')], observedDate: D1, recordedAt: T1 })
    const diff = collect(store, { observed: [stock('A')], observedDate: D2, recordedAt: T2 })

    expect(diff).toEqual({ opens: [], transitions: [] })
    expect(store.all).toHaveLength(1)
  })

  it('closes a removed mapping once and appends the closed business-time segment', () => {
    const store = new MembershipStore()
    collect(store, { observed: [stock('A'), stock('B')], observedDate: D1, recordedAt: T1 })
    const diff = collect(store, { observed: [stock('A')], observedDate: D2, recordedAt: T2 })

    expect(diff.opens).toHaveLength(0)
    expect(diff.transitions).toHaveLength(1)
    expect(diff.transitions[0]?.symbol).toBe('B')
    expect(diff.transitions[0]?.close.superseded_at).toBe(T2)
    expect(diff.transitions[0]?.replacements).toEqual([{
      theme_id: THEME,
      symbol: 'B',
      valid_from: D1,
      valid_to: D2,
      recorded_at: T2,
      source: SOURCE,
      collection_run_id: null,
      relevance: 1.0,
      market: 'KOSPI',
    }])
  })

  it('supersedes and re-segments an attribute change', () => {
    const store = new MembershipStore()
    collect(store, { observed: [stock('A', 'KOSPI')], observedDate: D1, recordedAt: T1 })
    const diff = collect(store, { observed: [stock('A', 'KOSDAQ')], observedDate: D2, recordedAt: T2 })

    expect(diff.transitions).toHaveLength(1)
    expect(diff.transitions[0]?.replacements).toEqual([
      expect.objectContaining({ valid_from: D1, valid_to: D2, market: 'KOSPI' }),
      expect.objectContaining({ valid_from: D2, valid_to: null, market: 'KOSDAQ' }),
    ])
  })

  it('emits no empty business-time segment when a same-day version is corrected', () => {
    const store = new MembershipStore()
    collect(store, { observed: [stock('A', 'KOSPI')], observedDate: D1, recordedAt: T1 })
    const diff = collect(store, { observed: [stock('A', 'KOSDAQ')], observedDate: D1, recordedAt: T2 })

    expect(diff.transitions[0]?.replacements).toEqual([
      expect.objectContaining({ valid_from: D1, valid_to: null, market: 'KOSDAQ' }),
    ])
  })

  it('emits no replacement when a same-day version is removed', () => {
    const store = new MembershipStore()
    collect(store, { observed: [stock('A'), stock('B')], observedDate: D1, recordedAt: T1 })
    const diff = collect(store, { observed: [stock('A')], observedDate: D1, recordedAt: T2 })

    expect(diff.transitions[0]?.symbol).toBe('B')
    expect(diff.transitions[0]?.replacements).toEqual([])
  })

  it('never closes mappings of themes this collection did not observe', () => {
    const store = new MembershipStore()
    collect(store, {
      observed: [stock('A'), { themeId: OTHER_THEME, symbol: 'Z', relevance: 1.0, market: 'KOSPI' }],
      observedDate: D1,
      recordedAt: T1,
    })

    // 이번 수집은 theme-a만 관측 (theme-z 스크래핑 실패)
    const diff = collect(store, {
      observed: [stock('A')],
      observedThemeIds: [THEME],
      observedDate: D2,
      recordedAt: T2,
    })

    expect(diff).toEqual({ opens: [], transitions: [] })
    expect(symbolsAt(store, D2)).toEqual(['A'])
    expect(selectMembershipSymbolsAsOf(store.all, { themeId: OTHER_THEME, baseDate: D2, cutoff: NOW }))
      .toEqual(['Z'])
  })

  it('fabricates no pre-observation history: valid_from never precedes the observation date', () => {
    const store = buildAddRemoveReactivateStore()

    const earliest = store.all.map((row) => row.valid_from).sort()[0]
    expect(earliest).toBe(D1)
    expect(symbolsAt(store, '2026-03-01')).toEqual([])
  })
})

describe('selectMembershipAsOf — add/remove/reactivate at four instants', () => {
  it('returns the expected membership at each of the four instants', () => {
    const store = buildAddRemoveReactivateStore()

    expect(symbolsAt(store, D1)).toEqual(['A', 'B'])       // both added
    expect(symbolsAt(store, '2026-03-04')).toEqual(['A', 'B']) // still open before removal
    expect(symbolsAt(store, D2)).toEqual(['A'])            // B removed (valid_to exclusive)
    expect(symbolsAt(store, D3)).toEqual(['A', 'B'])       // B reactivated
  })

  it('keeps every past as-of answer stable after the current mapping changes', () => {
    const store = new MembershipStore()
    collect(store, { observed: [stock('A'), stock('B')], observedDate: D1, recordedAt: T1 })
    const before = symbolsAt(store, D1)

    // B가 theme_stocks에서 is_active=false 처리되는 시점의 수집
    collect(store, { observed: [stock('A')], observedDate: D2, recordedAt: T2 })
    expect(symbolsAt(store, D1)).toEqual(before)

    // 재활성화 이후에도 과거 비활성 구간은 그대로다
    collect(store, { observed: [stock('A'), stock('B')], observedDate: D3, recordedAt: T3 })
    expect(symbolsAt(store, D1)).toEqual(['A', 'B'])
    expect(symbolsAt(store, '2026-03-06')).toEqual(['A'])
  })

  it('honours the system-known-time predicate independently of business time', () => {
    const store = buildAddRemoveReactivateStore()

    // T1 시점의 지식으로는 B가 아직 열려 있었다
    expect(symbolsAt(store, '2026-03-04', '2026-03-02T12:00:00.000Z')).toEqual(['A', 'B'])
    // T2 이후 지식에서도 같은 base date 답은 유지된다 (닫힌 segment가 대체)
    expect(symbolsAt(store, '2026-03-04', '2026-03-05T12:00:00.000Z')).toEqual(['A', 'B'])
    // 재활성화는 T3 이전 cutoff에서 보이지 않는다
    expect(symbolsAt(store, D3, '2026-03-09T08:59:59.999Z')).toEqual(['A'])
    expect(symbolsAt(store, D3, T3)).toEqual(['A', 'B'])
  })

  it('excludes a version at exactly its valid_to and superseded_at boundaries', () => {
    const store = buildAddRemoveReactivateStore()
    const closedSegment = store.all.find((row) => row.symbol === 'B' && row.valid_to === D2)
    const supersededRow = store.all.find((row) => row.symbol === 'B' && row.superseded_at === T2)

    expect(closedSegment).toBeDefined()
    expect(supersededRow).toBeDefined()

    // valid_to는 배타적 상한
    expect(selectMembershipAsOf([closedSegment as MembershipHistoryRow], { baseDate: D2, cutoff: NOW })).toEqual([])
    // superseded_at은 배타적 상한
    expect(selectMembershipAsOf([supersededRow as MembershipHistoryRow], { baseDate: D1, cutoff: T2 })).toEqual([])
    expect(selectMembershipAsOf([supersededRow as MembershipHistoryRow], { baseDate: D1, cutoff: T1 })).toHaveLength(1)
  })

  it('returns absent for instants before any observation', () => {
    const store = buildAddRemoveReactivateStore()
    expect(symbolsAt(store, '2026-02-01')).toEqual([])
    expect(symbolsAt(store, D1, '2026-03-02T08:59:59.999Z')).toEqual([])
  })
})

describe('current-active-table loader is not a valid as-of source', () => {
  /** theme_stocks(current cache)만 읽는 loader 재현 — 계약 위반을 증명하기 위한 실패 fixture */
  const currentActiveSymbols = (cache: ReadonlyArray<{ symbol: string; is_active: boolean }>): string[] =>
    cache.filter((row) => row.is_active).map((row) => row.symbol).sort()

  it('fails to reproduce the historical membership that the bitemporal query returns', () => {
    const store = buildAddRemoveReactivateStore()
    // D3 재활성화 이후의 current cache 상태
    const cache = [{ symbol: 'A', is_active: true }, { symbol: 'B', is_active: true }]

    const asOfDuringRemoval = symbolsAt(store, '2026-03-06')
    expect(asOfDuringRemoval).toEqual(['A'])

    // current active table만 쓰면 B가 비활성이던 과거 구간을 복원하지 못한다
    expect(currentActiveSymbols(cache)).not.toEqual(asOfDuringRemoval)
    expect(currentActiveSymbols(cache)).toEqual(['A', 'B'])
  })

  it('keeps the as-of loader free of theme_stocks and is_active', () => {
    const loaderSource = readFileSync(
      join(process.cwd(), 'scripts/tli/features/load-membership-as-of.ts'),
      'utf8',
    )
    const executable = loaderSource
      .replace(/\/\*\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')

    expect(executable).not.toMatch(/from\(['"]theme_stocks['"]\)/)
    expect(executable).not.toMatch(/is_active/)
    expect(executable).toContain('theme_stock_membership_history')
    expect(executable).toContain('selectMembershipAsOf')
  })
})
