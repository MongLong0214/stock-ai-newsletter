import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import { validateStockData } from '@/lib/llm/korea/stock-json'
import { addKoreanTradingDays } from '@/lib/tli/trading-calendar'
import { buildPriceBook } from '@/scripts/stock-picks/data-handler'
import {
  generatePicks,
  generatePicksWithMeta,
  getExpectedSignalDate,
  type StockPickMaster,
} from '@/scripts/stock-picks/generate-picks'
import { TradingDayIndex } from '@/scripts/stock-picks/trading-days'
import type { StockDailyPriceRow } from '@/scripts/tli/prices/stock-daily-prices'

const SIGNAL_DATE = '2026-08-27'
const TODAY_KST = '2026-08-28'
const SYMBOLS = ['KOSPI:000001', 'KOSPI:000002', 'KOSDAQ:000003'] as const
const FOUR_SYMBOLS = [...SYMBOLS, 'KOSPI:000004'] as const

const makeFixture = (symbols: readonly string[] = SYMBOLS) => {
  const dates = Array.from(
    { length: 320 },
    (_value, index) => addKoreanTradingDays(SIGNAL_DATE, index - 319),
  )
  const rows: StockDailyPriceRow[] = symbols.flatMap((symbol, symbolIndex) => dates.map((tradeDate, index) => {
    const base = 2_000 + symbolIndex * 100
    const isSignalDay = index === dates.length - 1
    // 프로덕션 게이트(excludeGapUp·60일 신고가 돌파)를 통과하는 신호일 캔들:
    // 시가 = 전일 종가(갭 0), 종가 = 직전 최고 종가(+10 홀수일 보정 포함) 대비 +0.3% 돌파
    const previousClose = base + (index - 1) * 2 + ((index - 1) % 2 === 1 ? 10 : -10)
    const priorMaxClose = base + (dates.length - 3) * 2 + 10
    const close = isSignalDay
      ? Math.round(priorMaxClose * 1.003)
      : base + index * 2 + (index % 2 === 1 ? 10 : -10)
    return {
      symbol,
      trade_date: tradeDate,
      open: isSignalDay ? previousClose : close - 5,
      high: close + 15,
      low: close - 15,
      close,
      volume: isSignalDay ? 5_000_000 + symbolIndex * 100_000 : 1_000_000 + index * 1_000,
      source: 'kis',
    }
  }))
  const masters: StockPickMaster[] = symbols.map((symbol, index) => ({
    symbol,
    name: `테스트종목${index + 1}`,
    is_active: true,
    status_flags: {},
  }))
  return { dates, rows, prices: buildPriceBook(rows), masters }
}

describe('production stock pick generator', () => {
  it('uses the preceding Friday when todayKst is Sunday', () => {
    expect(getExpectedSignalDate('2026-08-30')).toBe('2026-08-28')
  })

  it('uses the preceding trading day when todayKst is a market holiday', () => {
    expect(getExpectedSignalDate('2026-01-01')).toBe('2025-12-30')
  })

  it('throws explicitly when todayKst belongs to an unregistered calendar year', () => {
    expect(() => getExpectedSignalDate('2028-01-05')).toThrow(/캘린더 미등록 연도: 2028/)
  })

  it('creates exactly three StockData picks from a synthetic PriceBook fixture', async () => {
    const fixture = makeFixture()
    const loadPrices = vi.fn(async () => fixture.prices)
    const json = await generatePicks({
      todayKst: TODAY_KST,
      dependencies: {
        loadTradingDays: async () => new TradingDayIndex(fixture.dates),
        loadPrices,
        loadMasters: async () => fixture.masters,
      },
    })
    const picks: unknown = JSON.parse(json)

    // Byte-level guard: research artifact refactors must not change production pick JSON.
    expect(createHash('sha256').update(json).digest('hex')).toBe(
      'ba54e73bfe9c357da082ef6064486576227c80dc17529951998a213492680799',
    )
    expect(validateStockData(picks)).toBe(true)
    expect(picks).toHaveLength(3)
    expect((picks as Array<{ ticker: string }>).map((pick) => pick.ticker)).toEqual([
      'KOSDAQ:000003',
      'KOSPI:000001',
      'KOSPI:000002',
    ])
    expect(loadPrices).toHaveBeenCalledWith({
      startDate: fixture.dates[0],
      endDate: SIGNAL_DATE,
    })
    for (const pick of picks as Array<{ rationale: string; signals: Record<string, number> }>) {
      expect(pick.rationale.split('|').length).toBeGreaterThanOrEqual(12)
      expect(pick.rationale.length).toBeGreaterThanOrEqual(50)
      expect(Object.values(pick.signals).every(Number.isInteger)).toBe(true)
    }
  })

  it('trims an incomplete current-day candle and keeps historyDates ending at signalDate', async () => {
    const fixture = makeFixture()
    const loadPrices = vi.fn(async () => fixture.prices)
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    try {
      const json = await generatePicks({
        todayKst: TODAY_KST,
        dependencies: {
          loadTradingDays: async () => new TradingDayIndex([...fixture.dates, TODAY_KST]),
          loadPrices,
          loadMasters: async () => fixture.masters,
        },
      })

      expect(JSON.parse(json)).toHaveLength(3)
      expect(loadPrices).toHaveBeenCalledWith({
        startDate: fixture.dates[0],
        endDate: SIGNAL_DATE,
      })
      expect(consoleWarnSpy).toHaveBeenCalledOnce()
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining(
        `당일 미완성 캔들 감지 → signalDate=${SIGNAL_DATE}로 트리밍`,
      ))
    } finally {
      consoleWarnSpy.mockRestore()
    }
  })

  it('throws when the last measured trading date is stale for today in KST', async () => {
    const fixture = makeFixture()
    await expect(generatePicks({
      todayKst: '2026-08-31',
      dependencies: {
        loadTradingDays: async () => new TradingDayIndex(fixture.dates),
        loadPrices: async () => fixture.prices,
        loadMasters: async () => fixture.masters,
      },
    })).rejects.toThrow(/신선도 게이트 실패/)
  })

  it('throws when the expected signal date is missing from the measured trading-day index', async () => {
    const fixture = makeFixture()
    const datesWithoutExpected = [
      ...fixture.dates.filter((date) => date !== SIGNAL_DATE),
      TODAY_KST,
    ]
    const loadPrices = vi.fn(async () => fixture.prices)
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    try {
      await expect(generatePicks({
        todayKst: TODAY_KST,
        dependencies: {
          loadTradingDays: async () => new TradingDayIndex(datesWithoutExpected),
          loadPrices,
          loadMasters: async () => fixture.masters,
        },
      })).rejects.toThrow(/expected=2026-08-27가 KOSPI 실측 거래일 인덱스에 없습니다/)
      expect(loadPrices).not.toHaveBeenCalled()
    } finally {
      consoleWarnSpy.mockRestore()
    }
  })

  it('naturally excludes a symbol with no signalDate row', async () => {
    const fixture = makeFixture(FOUR_SYMBOLS)
    const missingSymbol = FOUR_SYMBOLS[3]
    const prices = buildPriceBook(fixture.rows.filter((row) => (
      row.symbol !== missingSymbol || row.trade_date !== SIGNAL_DATE
    )))

    const json = await generatePicks({
      todayKst: TODAY_KST,
      dependencies: {
        loadTradingDays: async () => new TradingDayIndex(fixture.dates),
        loadPrices: async () => prices,
        loadMasters: async () => fixture.masters,
      },
    })
    const picks = JSON.parse(json) as Array<{ ticker: string }>

    expect(picks).toHaveLength(3)
    expect(picks.map((pick) => pick.ticker)).not.toContain(missingSymbol)
  })

  it('excludes a newly listed symbol with fewer than 60 history rows because its features are null', async () => {
    const fixture = makeFixture(FOUR_SYMBOLS)
    const newlyListedSymbol = FOUR_SYMBOLS[3]
    const listingStartDate = fixture.dates.at(-59)
    const prices = buildPriceBook(fixture.rows.filter((row) => (
      row.symbol !== newlyListedSymbol || (listingStartDate !== undefined && row.trade_date >= listingStartDate)
    )))

    const json = await generatePicks({
      todayKst: TODAY_KST,
      dependencies: {
        loadTradingDays: async () => new TradingDayIndex(fixture.dates),
        loadPrices: async () => prices,
        loadMasters: async () => fixture.masters,
      },
    })
    const picks = JSON.parse(json) as Array<{ ticker: string }>

    expect(picks).toHaveLength(3)
    expect(picks.map((pick) => pick.ticker)).not.toContain(newlyListedSymbol)
  })

  it('throws for insufficient candidates when only the index is fresh and every stock is stale', async () => {
    const fixture = makeFixture()
    const indexRow: StockDailyPriceRow = {
      ...fixture.rows[0],
      symbol: 'KOSPI',
      trade_date: SIGNAL_DATE,
    }
    const prices = buildPriceBook([
      ...fixture.rows.filter((row) => row.trade_date !== SIGNAL_DATE),
      indexRow,
    ])

    await expect(generatePicks({
      todayKst: TODAY_KST,
      dependencies: {
        loadTradingDays: async () => new TradingDayIndex(fixture.dates),
        loadPrices: async () => prices,
        loadMasters: async () => fixture.masters,
      },
    })).rejects.toThrow(/volumeBreakout 후보 부족: 0\/3/)
  })

  it('emits funnel and generated observability without changing the pick contract', async () => {
    const fixture = makeFixture()
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const dependencies = {
      loadTradingDays: async () => new TradingDayIndex(fixture.dates),
      loadPrices: async () => fixture.prices,
      loadMasters: async () => fixture.masters,
    }

    try {
      const result = await generatePicksWithMeta({ todayKst: TODAY_KST, dependencies })
      const legacyJson = await generatePicks({ todayKst: TODAY_KST, dependencies })
      const events = logSpy.mock.calls.map(([line]) => JSON.parse(String(line)))

      expect(result.json).toBe(legacyJson)
      expect(result.picks).toEqual(JSON.parse(legacyJson))
      expect(events.filter((event) => event.event === 'stock_picks_funnel')).toHaveLength(2)
      expect(events.find((event) => event.event === 'stock_picks_funnel')).toMatchObject({
        signalDate: SIGNAL_DATE,
        activeMasters: 3,
        withFreshKisRow: 3,
        withCompleteFeatures: 3,
        gatePassed: 3,
        picked: 3,
      })
      expect(events.find((event) => event.event === 'stock_picks_generated')).toMatchObject({
        signalDate: SIGNAL_DATE,
        strategy: 'volumeBreakoutNoGapUp',
        picks: expect.arrayContaining([expect.objectContaining({ rank: 1 })]),
      })
      expect(result.meta.parametersHash).toMatch(/^[a-f0-9]{64}$/)
    } finally {
      logSpy.mockRestore()
    }
  })

  it('writes a full stock-picks snapshot when configured', async () => {
    const fixture = makeFixture()
    const temporaryDirectory = await mkdtemp(join(tmpdir(), 'stock-picks-'))
    const snapshotPath = join(temporaryDirectory, 'nested', 'snapshot.json')
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.stubEnv('STOCK_PICKS_SNAPSHOT_PATH', snapshotPath)
    vi.stubEnv('GITHUB_SHA', 'fixture-sha')

    try {
      const result = await generatePicksWithMeta({
        todayKst: TODAY_KST,
        dependencies: {
          loadTradingDays: async () => new TradingDayIndex(fixture.dates),
          loadPrices: async () => fixture.prices,
          loadMasters: async () => fixture.masters,
        },
      })
      const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'))

      expect(snapshot).toMatchObject({
        signalDate: SIGNAL_DATE,
        gitSha: 'fixture-sha',
        strategy: 'volumeBreakoutNoGapUp',
        parametersHash: result.meta.parametersHash,
        funnel: result.meta.funnel,
      })
      expect(snapshot.picks).toHaveLength(3)
      expect(snapshot.picks[0]).toEqual(expect.objectContaining({
        symbol: expect.any(String),
        score: expect.any(Number),
        rank: 1,
      }))
      expect(snapshot.topCandidates).toHaveLength(3)
    } finally {
      vi.unstubAllEnvs()
      logSpy.mockRestore()
      await rm(temporaryDirectory, { recursive: true, force: true })
    }
  })
})
