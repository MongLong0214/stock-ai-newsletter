/** Prepare integration E2E: real orchestration, risk policy, collector, indicators,
 * selector/model, JSON validation, CAS and email rendering. Only external providers/storage are in memory.
 * This proves execution behavior, not predictive accuracy or live provider availability.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MarketAssessmentSnapshot } from '@/lib/market-data/kis-market-assessment'
import type { StockPickMaster } from '@/scripts/stock-picks/generate-picks'
import type { StockDailyPriceRow } from '@/scripts/tli/prices/stock-daily-prices'
import type { StockData } from '@/lib/llm/_types/stock-data'

const state = vi.hoisted(() => ({
  rows: [] as StockDailyPriceRow[],
  stored: new Map<string, StockDailyPriceRow>(),
  masters: [] as StockPickMaster[],
  snapshot: null as MarketAssessmentSnapshot | null,
  newsletter: null as Record<string, unknown> | null,
  snapshots: [] as Record<string, unknown>[],
  corruptSelection: null as 'incomplete' | 'duplicate' | 'all-missing' | 'wrong-strategy' | 'wrong-objective' | 'wrong-ticker' | 'swapped-ranks' | 'wrong-price' | 'snapshot-price' | 'snapshot-name' | 'model-identity' | 'parameters' | null,
  fetchDaily: vi.fn(),
  refreshMaster: vi.fn(),
  alert: vi.fn(),
  model: vi.fn(),
}))

vi.mock('@google/genai', () => ({ GoogleGenAI: class { constructor() { state.model(); throw new Error('E2E must not call a model') } } }))
vi.mock('@/lib/newsletter/alert', () => ({ sendNewsletterAlertEmail: state.alert }))
vi.mock('@/lib/market-data/kis-market-assessment', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/market-data/kis-market-assessment')>(),
  getKisMarketAssessmentSnapshot: async () => structuredClone(state.snapshot),
}))
vi.mock('@/app/archive/_utils/api/kis/client', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/app/archive/_utils/api/kis/client')>(),
  ensureKisAccessToken: async () => ({ source: 'memory', expiresAt: Date.now() + 7_200_000 }),
  fetchDailyRangePriceRows: state.fetchDaily,
  fetchIndexDailyRangePriceRows: (_symbol: string, start: string, end: string) => state.fetchDaily('KOSPI', start, end),
}))
vi.mock('@/scripts/tli/prices/stock-daily-prices', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/scripts/tli/prices/stock-daily-prices')>()
  return {
    ...actual,
    loadActiveStockMasterSymbols: async () => state.masters.filter(master => master.is_active).map(master => master.symbol),
    upsertStockDailyPrices: async (inputs: Parameters<typeof actual.upsertStockDailyPrices>[0]) => {
      const rows = actual.dedupeStockDailyPriceRows(inputs)
      for (const row of rows) state.stored.set(`${row.symbol}|${row.trade_date}`, row)
      return rows.length
    },
  }
})
vi.mock('@/scripts/stock-picks/load-stock-master', () => ({ loadStockMaster: state.refreshMaster }))
vi.mock('@/scripts/stock-picks/data-handler', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/scripts/stock-picks/data-handler')>()
  return {
    ...actual,
    loadPriceBook: async ({ startDate, endDate }: { startDate: string; endDate: string }) => actual.buildPriceBook(
      [...state.stored.values()].filter(row => row.trade_date >= startDate && row.trade_date <= endDate),
    ),
  }
})
vi.mock('@/scripts/stock-picks/trading-days', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/scripts/stock-picks/trading-days')>()
  return { ...actual, loadTradingDayIndex: async () => actual.buildTradingDayIndex(
    [...state.stored.values()].filter(row => row.symbol === 'KOSPI'), [],
  ) }
})
vi.mock('@/scripts/stock-picks/generate-picks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/scripts/stock-picks/generate-picks')>()
  return { ...actual, generatePicksWithMeta: async (input: Parameters<typeof actual.generatePicksWithMeta>[0]) => {
    const result = await actual.generatePicksWithMeta({ ...input, dependencies: {
      loadMasters: async () => state.masters, loadRecentPublishedSymbols: async () => new Set<string>(),
    } })
    if (!state.corruptSelection) return result
    // Exercise Prepare's persisted-JSON boundary after the real selector/model succeeds.
    const picks = JSON.parse(result.json) as StockData[]
    if (state.corruptSelection === 'incomplete') delete picks[0]!.selection
    if (state.corruptSelection === 'duplicate') picks[0]!.selection = { ...picks[1]!.selection! }
    if (state.corruptSelection === 'all-missing') for (const pick of picks) delete pick.selection
    if (state.corruptSelection === 'wrong-strategy') for (const pick of picks) pick.selection!.strategy = 'wrong-model'
    if (state.corruptSelection === 'wrong-objective') {
      for (const pick of picks) pick.selection!.objective = 'bullishThenTouch10Within5TradingDays'
      return { ...result, picks, json: JSON.stringify(picks) }
    }
    if (state.corruptSelection === 'wrong-ticker') picks[0]!.ticker = 'KOSPI:999990'
    if (state.corruptSelection === 'swapped-ranks') {
      picks[0]!.selection!.rank = 2
      picks[1]!.selection!.rank = 1
    }
    if (state.corruptSelection === 'wrong-price') picks[0]!.close_price += 500
    if (state.corruptSelection === 'snapshot-price') return { ...result, meta: { ...result.meta,
      rankedCandidates: result.meta.rankedCandidates.map((candidate, index) => index === 0
        ? { ...candidate, close: candidate.close! + 500 } : candidate),
    } }
    if (state.corruptSelection === 'snapshot-name') return { ...result, meta: { ...result.meta,
      rankedCandidates: result.meta.rankedCandidates.map((candidate, index) => index === 0
        ? { ...candidate, name: '다른 회사' } : candidate),
    } }
    if (state.corruptSelection === 'model-identity') return { ...result, meta: { ...result.meta, parametersHash: 'wrong-model-hash' } }
    if (state.corruptSelection === 'parameters') return { ...result, meta: { ...result.meta,
      parameters: { ...result.meta.parameters, recentPickTradingDays: 0 },
    } }

    return { ...result, json: JSON.stringify(picks) }
  } }
})
const database = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => database }))
vi.mock('@/scripts/tli/shared/supabase-admin', () => ({ supabaseAdmin: database }))

import { validateStockData } from '@/lib/llm/korea/stock-json'
import { riskQuote, riskSnapshot, RISK_NOW } from '@/lib/market-data/__tests__/market-risk-fixture'
import { addKoreanTradingDays } from '@/lib/tli/trading-calendar'
import { generateNewsletterHTML } from '@/lib/sendgrid'
import { createKisApiError } from '@/app/archive/_utils/api/kis/client'
import { runPrepareNewsletterCli } from '@/scripts/prepare-newsletter'
import { DEFAULT_DAILY_COLLECTION_CALL_BUDGET } from '@/scripts/stock-picks/collect-daily'

const TARGET = '2026-09-09'
const SIGNAL = '2026-09-08'

describe('Prepare boundary-isolated E2E', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Keep real async timers for the collector's rate limiter; freeze only the wall clock.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(RISK_NOW))
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Unexpected external network in fixture E2E') }))
    vi.stubEnv('GOOGLE_CLOUD_PROJECT', '')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://fixture.invalid')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'fixture-only')
    vi.stubEnv('STOCK_PICKS_KIS_RATE_LIMIT_PER_SECOND', '10')
    vi.stubEnv('PREPARE_SUMMARY_PATH', '')
    vi.stubEnv('STOCK_PICKS_SNAPSHOT_PATH', '')
    state.newsletter = null
    state.snapshots = []
    state.corruptSelection = null
    state.snapshot = riskSnapshot()
    state.refreshMaster.mockResolvedValue(undefined)
    state.alert.mockResolvedValue(undefined)
    state.masters = Array.from({ length: 6 }, (_, index) => ({
      symbol: `KOSPI:${String((index + 1) * 10).padStart(6, '0')}`,
      name: `E2E종목${index + 1}`, is_active: true, status_flags: {},
    }))
    const dates = Array.from({ length: 320 }, (_, index) => addKoreanTradingDays(SIGNAL, index - 319))
    state.rows = ['KOSPI', ...state.masters.map(master => master.symbol)].flatMap((symbol, stockIndex) => (
      dates.map((trade_date, index) => {
        const base = 2_000 + stockIndex * 100
        const signalDay = trade_date === SIGNAL
        const previousClose = base + (index - 1) * 2 + ((index - 1) % 2 === 1 ? 10 : -10)
        const close = signalDay
          ? Math.round((base + 317 * 2 + 10) * (stockIndex > 2 ? 0.995 : 1.003))
          : base + index * 2 + (index % 2 === 1 ? 10 : -10)
        const open = signalDay ? previousClose : close - 5
        return { symbol, trade_date, open, high: Math.max(open, close) + 15,
          low: Math.min(open, close) - 15, close,
          volume: signalDay ? 5_000_000 + stockIndex * 100_000 : 1_000_000 + index * 1_000,
          source: 'kis' as const }
      })
    ))
    // The last seven sessions must actually flow through the collector to be available to picks.
    state.stored = new Map(state.rows.filter(row => row.trade_date < dates.at(-7)!)
      .map(row => [`${row.symbol}|${row.trade_date}`, row]))
    state.fetchDaily.mockImplementation(async (symbol: string, start: string, end: string) => state.rows
      .filter(row => row.symbol === symbol && row.trade_date.replaceAll('-', '') >= start && row.trade_date.replaceAll('-', '') <= end)
      .map(row => ({ date: row.trade_date, open: row.open, high: row.high, low: row.low, close: row.close, volume: row.volume })))
    database.from.mockImplementation((table: string) => {
      if (table === 'stock_pick_snapshots') return { upsert: async (row: Record<string, unknown>) => {
        state.snapshots.push(row); return { error: null }
      } }
      if (table !== 'newsletter_content') throw new Error(`Unexpected E2E table: ${table}`)
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: structuredClone(state.newsletter), error: null }) }) }),
        insert: (row: Record<string, unknown>) => ({ select: async () => {
          if (state.newsletter) return { error: { code: '23505' } }
          state.newsletter = { ...row, is_sent: false }; return { data: [row], error: null }
        } }),
        update: (row: Record<string, unknown>) => {
          const filters = new Map<string, unknown>()
          const builder = { eq: (key: string, value: unknown) => {
            filters.set(key, value)
            return builder
          }, select: async () => {
            // Apply the actual CAS predicates; an omitted is_sent filter must not be masked by the fixture.
            if (!state.newsletter || [...filters].some(([key, value]) => state.newsletter![key] !== value)) {
              return { data: [], error: null }
            }
            state.newsletter = { ...state.newsletter, ...row }; return { data: [row], error: null }
          } }
          return builder
        },
      }
    })
  })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

  it('collects finalized candles, calculates real features, ranks 3 and saves matching snapshot/newsletter', async () => {
    expect(await runPrepareNewsletterCli([`--target-date=${TARGET}`])).toBe(0)
    const picks = JSON.parse(String(state.newsletter?.gemini_analysis)) as StockData[]
    expect(validateStockData(picks)).toBe(true)
    expect(state.newsletter?.picks_source).toBe('code')
    expect(state.fetchDaily).toHaveBeenCalledTimes(7)
    expect(state.snapshots).toHaveLength(5)
    expect(state.snapshots.map((row) => row.strategy)).toEqual(expect.arrayContaining([
      'lowVolatilityStable', 'shadow:A-volumeBreakout-v1.1',
      'shadow:B-random', 'shadow:J-randomConstrained', 'shadow:bullishTarget-v3',
    ]))
    expect(state.snapshots.every((row) => (row.picks as unknown[]).length === 3)).toBe(true)
    const snapshot = state.snapshots[0]
    expect(snapshot.strategy).toBe('lowVolatilityStable')
    expect(snapshot.strategy_version).toBe('v2-2026-09-23')
    expect(snapshot.signal_date).toBe(SIGNAL)
    const candidates = snapshot.picks as Array<{ symbol: string; rank: number; close: number; technicalContext: unknown }>
    expect(candidates.map(row => row.symbol)).toEqual(picks.map((pick: { ticker: string }) => pick.ticker))
    expect(candidates.map(row => row.rank)).toEqual([1, 2, 3])
    expect(picks.map(pick => pick.selection)).toEqual([1, 2, 3].map(rank => ({
      strategy: 'lowVolatilityStable', rank, objective: 'lowVolatilityStable',
    })))
    expect(candidates.every(row => row.technicalContext)).toBe(true)
    for (const row of candidates) expect(row.close).toBe(state.stored.get(`${row.symbol}|${SIGNAL}`)?.close)
    const html = generateNewsletterHTML({
      date: TARGET, geminiAnalysis: String(state.newsletter?.gemini_analysis),
    }, 'reader@example.com')
    // Display order follows overall score while persisted selection metadata stays intact.
    const reorderedHtml = generateNewsletterHTML({
      date: TARGET, geminiAnalysis: JSON.stringify([...picks].reverse()),
    }, 'reader@example.com')
    for (const [rendered, inputPicks] of [[html, picks], [reorderedHtml, [...picks].reverse()]] as const) {
      const positions = [...inputPicks].sort((a, b) => b.signals.overall_score - a.signals.overall_score)
        .map(pick => rendered.indexOf(pick.name))
      expect(positions.every(position => position >= 0)).toBe(true)
      expect(positions[0]).toBeLessThan(positions[1])
      expect(positions[1]).toBeLessThan(positions[2])
    }
    expect(html.match(/종합 점수/g)).toHaveLength(3)
    for (const pick of picks) expect(html).toContain(`>${pick.signals.overall_score}점</span>`)
    for (const phrase of ['선정 순위', '선정 목표', '공동 목표 모델 순위', '기술 참고 점수',
      '추천일 양봉 마감', '추천일 포함 5거래일', '상승 확률이 아닙니다']) {
      expect(html).not.toContain(phrase)
    }
    expect(html).not.toMatch(/undefined|NaN/)
    expect(state.model).not.toHaveBeenCalled()
    expect(state.alert).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each(['incomplete', 'duplicate', 'all-missing', 'wrong-strategy', 'wrong-objective', 'wrong-ticker', 'swapped-ranks', 'wrong-price', 'snapshot-price', 'snapshot-name', 'model-identity', 'parameters'] as const)('rejects %s selection corruption before storing any output', async (corruptSelection) => {
    state.corruptSelection = corruptSelection
    expect(await runPrepareNewsletterCli([`--target-date=${TARGET}`])).toBe(1)
    expect(state.fetchDaily).toHaveBeenCalledTimes(7)
    expect(state.newsletter).toBeNull()
    expect(state.snapshots).toHaveLength(0)
    expect(state.model).not.toHaveBeenCalled()
    expect(state.alert).toHaveBeenCalledOnce()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('preserves a sent newsletter and skips all external acquisition', async () => {
    state.newsletter = { is_sent: true, picks_source: 'code', gemini_analysis: 'original' }
    expect(await runPrepareNewsletterCli([`--target-date=${TARGET}`])).toBe(0)
    expect(state.newsletter.gemini_analysis).toBe('original')
    expect(state.fetchDaily).not.toHaveBeenCalled()
    expect(state.snapshots).toHaveLength(0)
  })

  it('recovers a transient provider timeout through the real retry queue with identical picks', async () => {
    const initialPrices = new Map(state.stored)
    expect(await runPrepareNewsletterCli([`--target-date=${TARGET}`])).toBe(0)
    const expectedJson = state.newsletter!.gemini_analysis
    const expectedCandidates = structuredClone(state.snapshots[0]!.picks)
    const fetchDaily = state.fetchDaily.getMockImplementation()!
    const failedSymbol = state.masters[0]!.symbol
    state.newsletter = null
    state.snapshots = []
    state.stored = initialPrices
    state.fetchDaily.mockClear()
    let failedOnce = false
    state.fetchDaily.mockImplementation(async (symbol: string, start: string, end: string) => {
      if (symbol === failedSymbol && !failedOnce) {
        failedOnce = true
        throw createKisApiError('timeout', 'Temporary fixture provider timeout')
      }
      return fetchDaily(symbol, start, end)
    })
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    expect(await runPrepareNewsletterCli([`--target-date=${TARGET}`])).toBe(0)
    expect(state.fetchDaily).toHaveBeenCalledTimes(8)
    expect(state.fetchDaily.mock.calls.filter(([symbol]) => symbol === failedSymbol)).toHaveLength(2)
    expect(state.newsletter!.gemini_analysis).toBe(expectedJson)
    expect(state.snapshots).toHaveLength(5)
    expect(state.snapshots[0]!.picks).toEqual(expectedCandidates)
    const collectionLog = log.mock.calls.find(([line]) => typeof line === 'string'
      && line.startsWith('{"event":"stock_daily_collection",'))?.[0]
    expect(JSON.parse(String(collectionLog))).toMatchObject({
      attemptedCalls: 7, physicalCalls: 8, successCount: 7, failureCount: 0,
      retriedSymbols: [failedSymbol], recoveredSymbols: [failedSymbol], exactDateCoverageRate: 1,
    })
    expect(state.alert).not.toHaveBeenCalled()
    expect(state.model).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('fails closed when the real collector exhausts its call budget despite complete attempted-symbol coverage', async () => {
    // Prepare uses the production call budget. One more requested symbol than that budget must block publication.
    const providerRows = state.rows.filter(row => row.symbol === 'KOSPI'
      && row.trade_date >= addKoreanTradingDays(SIGNAL, -6))
      .map(row => ({ date: row.trade_date, open: row.open, high: row.high,
        low: row.low, close: row.close, volume: row.volume }))
    state.masters = Array.from({ length: DEFAULT_DAILY_COLLECTION_CALL_BUDGET }, (_, index) => ({
      symbol: `KOSPI:${String(index + 1).padStart(6, '0')}`,
      name: `Budget종목${index + 1}`, is_active: true, status_flags: {},
    }))
    state.fetchDaily.mockImplementation(async () => {
      // Advance only wall-clock time as though the provider used its 100 ms pacing interval.
      vi.setSystemTime(Date.now() + 100)
      return providerRows
    })
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    expect(await runPrepareNewsletterCli([`--target-date=${TARGET}`])).toBe(1)
    expect(state.fetchDaily).toHaveBeenCalledTimes(DEFAULT_DAILY_COLLECTION_CALL_BUDGET)
    const collectionLog = log.mock.calls.find(([line]) => typeof line === 'string'
      && line.startsWith('{"event":"stock_daily_collection",'))?.[0]
    expect(JSON.parse(String(collectionLog))).toMatchObject({
      callBudget: DEFAULT_DAILY_COLLECTION_CALL_BUDGET,
      attemptedCalls: DEFAULT_DAILY_COLLECTION_CALL_BUDGET,
      physicalCalls: DEFAULT_DAILY_COLLECTION_CALL_BUDGET,
      skippedForBudget: 1, successRate: 1, exactDateCoverageRate: 1,
    })
    expect(state.newsletter).toBeNull()
    expect(state.snapshots).toHaveLength(0)
    expect(state.alert).toHaveBeenCalledOnce()
    expect(state.model).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([false, true])('preserves a newsletter sent during acquisition across the CAS race (existing=%s)', async (existing) => {
    state.newsletter = existing ? {
      newsletter_date: TARGET, is_sent: false, picks_source: 'code', gemini_analysis: 'prior-unsent',
    } : null
    const competingNewsletter = {
      newsletter_date: TARGET, is_sent: true, picks_source: 'code', gemini_analysis: 'already-sent-by-competing-worker',
    }
    const fetchDaily = state.fetchDaily.getMockImplementation()!
    state.fetchDaily.mockImplementationOnce(async (symbol: string, start: string, end: string) => {
      state.newsletter = structuredClone(competingNewsletter)
      return fetchDaily(symbol, start, end)
    })

    expect(await runPrepareNewsletterCli([`--target-date=${TARGET}`])).toBe(0)
    expect(state.fetchDaily).toHaveBeenCalledTimes(7)
    expect(state.newsletter).toEqual(competingNewsletter)
    expect(state.snapshots).toHaveLength(0)
    expect(state.alert).not.toHaveBeenCalled()
    expect(state.model).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('skips acquisition on a backup run when unsent code picks already exist', async () => {
    const prepared = {
      newsletter_date: TARGET, is_sent: false, picks_source: 'code', gemini_analysis: 'already-prepared-code-picks',
    }
    state.newsletter = structuredClone(prepared)
    expect(await runPrepareNewsletterCli([`--target-date=${TARGET}`, '--backup-run'])).toBe(0)
    expect(state.newsletter).toEqual(prepared)
    expect(state.fetchDaily).not.toHaveBeenCalled()
    expect(state.refreshMaster).not.toHaveBeenCalled()
    expect(state.snapshots).toHaveLength(0)
    expect(state.alert).not.toHaveBeenCalled()
    expect(state.model).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('fails closed on an incomplete signal-day universe without switching to LLM stocks', async () => {
    state.rows = state.rows.filter(row => row.symbol !== state.masters[0].symbol || row.trade_date !== SIGNAL)
    expect(await runPrepareNewsletterCli([`--target-date=${TARGET}`])).toBe(1)
    expect(state.newsletter).toBeNull()
    expect(state.snapshots).toHaveLength(0)
    expect(state.model).not.toHaveBeenCalled()
    expect(state.alert).toHaveBeenCalledOnce()
  })

  it('does not manufacture a third pick when status filters leave only two', async () => {
    state.masters = state.masters.map((master, index) => ({ ...master,
      status_flags: index >= 2 ? { trading_suspended: 'Y' } : {},
    }))
    expect(await runPrepareNewsletterCli([`--target-date=${TARGET}`])).toBe(1)
    expect(state.newsletter).toBeNull()
    expect(state.snapshots).toHaveLength(0)
    expect(state.model).not.toHaveBeenCalled()
  })

  it('stores a numeric crash alert without stocks or a model even when other market sources are missing', async () => {
    state.snapshot!.indicators.sp500 = riskQuote('S&P 500', -6)
    state.snapshot!.indicators.nasdaqComposite = null
    state.snapshot!.indicators.dowJones = null
    expect(await runPrepareNewsletterCli([`--target-date=${TARGET}`])).toBe(0)
    const alert = JSON.parse(String(state.newsletter?.gemini_analysis))
    expect(state.newsletter?.picks_source).toBe('crash')
    expect(alert).toMatchObject({ type: 'crash_alert', severity: 'critical' })
    expect(alert.market_overview.sp500_close).toContain('-6.00%')
    expect(state.fetchDaily).not.toHaveBeenCalled()
    expect(state.refreshMaster).not.toHaveBeenCalled()
    expect(state.snapshots).toHaveLength(0)
    expect(state.model).not.toHaveBeenCalled()
  })

  it('stops unavailable markets before daily collection and persistence', async () => {
    state.snapshot!.indicators.sp500 = null
    state.snapshot!.indicators.nasdaqComposite = null
    state.snapshot!.indicators.dowJones = null
    expect(await runPrepareNewsletterCli([`--target-date=${TARGET}`])).toBe(1)
    expect(state.fetchDaily).not.toHaveBeenCalled()
    expect(state.newsletter).toBeNull()
    expect(state.snapshots).toHaveLength(0)
    expect(state.model).not.toHaveBeenCalled()
  })
})
