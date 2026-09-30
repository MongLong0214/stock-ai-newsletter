import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import { validateStockData } from '@/lib/llm/korea/stock-json'
import { addKoreanTradingDays } from '@/lib/tli/trading-calendar'
import { buildPriceBook, StockDataHandler } from '@/scripts/stock-picks/data-handler'
import { buildFeatureVector } from '@/scripts/stock-picks/features'
import type { TechnicalContext } from '@/scripts/stock-picks/technical-context'
import {
  buildRationale,
  buildAnalysisSummary,
  generatePicks,
  generatePicksWithMeta,
  getExpectedSignalDate,
  type StockPickMaster,
} from '@/scripts/stock-picks/generate-picks'
import * as strategies from '@/scripts/stock-picks/strategies'
import { BULLISH_TARGET_STRATEGY, FROZEN_BULLISH_TARGET_MODEL, PRODUCTION_STRATEGY } from '@/scripts/stock-picks/production-strategy'
import { scoreTargetModel } from '@/scripts/stock-picks/target-model'
import { TradingDayIndex } from '@/scripts/stock-picks/trading-days'
import type { StockDailyPriceRow } from '@/scripts/tli/prices/stock-daily-prices'

const SIGNAL_DATE = '2026-08-27'
const TODAY_KST = '2026-08-28'
const SYMBOLS = ['KOSPI:000010', 'KOSPI:000020', 'KOSDAQ:000030'] as const
const FOUR_SYMBOLS = [...SYMBOLS, 'KOSPI:000040'] as const

const makeFixture = (symbols: readonly string[] = SYMBOLS, signalDate = SIGNAL_DATE) => {
  const dates = Array.from(
    { length: 320 },
    (_value, index) => addKoreanTradingDays(signalDate, index - 319),
  )
  const rows: StockDailyPriceRow[] = symbols.flatMap((symbol, symbolIndex) => dates.map((tradeDate, index) => {
    const base = 2_000 + symbolIndex * 100
    const isSignalDay = index === dates.length - 1
    // 프로덕션 게이트(excludeGapUp·60일 신고가 돌파)를 통과하는 신호일 캔들:
    // 시가 = 전일 종가(갭 0), 종가 = 직전 최고 종가(+10 홀수일 보정 포함) 대비 +0.3% 돌파
    const previousClose = base + (index - 1) * 2 + ((index - 1) % 2 === 1 ? 10 : -10)
    const priorMaxClose = base + (dates.length - 3) * 2 + 10
    const close = isSignalDay
      ? Math.round(priorMaxClose * (symbolIndex === 2 ? 0.995 : 1.003))
      : base + index * 2 + (index % 2 === 1 ? 10 : -10)
    return {
      symbol,
      trade_date: tradeDate,
      open: isSignalDay ? previousClose : close - 5,
      high: Math.max(close, isSignalDay ? previousClose : close - 5) + 15,
      low: Math.min(close, isSignalDay ? previousClose : close - 5) - 15,
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

const rationaleFeature = () => {
  const fixture = makeFixture([SYMBOLS[0]])
  const feature = buildFeatureVector(new StockDataHandler(fixture.prices, new TradingDayIndex(fixture.dates)).at(SIGNAL_DATE), SYMBOLS[0])
  return { ...feature, open: 10_300, high: 11_000, low: 9_000, close: 10_200,
    gapFromPreviousClosePercent: 3, sma20: 9_800, sma60: 10_500, atrPercent14: 3.2,
    volumeRatio20: 2.4, volumePercentile60: 88, rsi14: 62, macdHistogram: 51,
    averageTurnover20: 1_500_000_000, position52w: 0.8, position52wObservations: 252,
    position52wFullWindow: true, distanceFromHigh60: -20,
  }
}
const rationaleContext = (): TechnicalContext => ({
  version: 'technical-context-v1', benchmarkSymbol: 'KOSPI', return5Percent: -3.25,
  return20Percent: 12.345, return60Percent: null, relativeReturn20PercentagePoints: 4.567,
  relativeReturn60PercentagePoints: null, realizedVolatility20Percent: null,
  bollingerWidth20Percent: null, closeLocation: null, upperWickRatio: null,
  chaikinMoneyFlow21: null, distanceFromPriorHigh20Percent: -10,
  benchmarkReturn20Percent: 7.778, benchmarkSma20DistancePercent: null,
  breadthAboveSma20: null, breadthEligibleSymbols: 0, breadthUniverseSymbols: 0,
})

describe('stock analysis summary', () => {
  it('explains observed directions, lookback windows, price references and units', () => {
    const summary = buildAnalysisSummary(rationaleFeature(), rationaleContext()).split('|')
    expect(summary).toEqual([
      `${SIGNAL_DATE} 종가 10,200원`,
      '전일 대비 +2.0% 상승',
      '시가 대비 -1.0% 음봉',
      '20일선 9,800원·종가 4.1% 위',
      '60일선 10,500원·종가 2.9% 아래',
      '최근 5거래일 종가 -3.3%',
      '최근 20거래일 종가 +12.3%',
      '20거래일 KOSPI 대비 +4.6%p',
      '직전 20거래일 장중 고점 11,333원까지 +11.1%',
      '직전 60거래일 최고 종가 12,750원까지 +25.0%',
      '거래량 20일 평균의 2.40배',
      '최근 60거래일 중 거래량 상위 12.0%',
      '당일 범위 종가 60.0%·윗꼬리 35.0%',
      'ATR14 평균 변동폭 3.2%·약 326원(갭 포함)',
      'RSI14 62.0 강세',
      'MACD 모멘텀 +0.50%(종가 대비)',
      '20일 평균 거래대금 추정 15.0억원',
      '52주(252거래일) 종가 범위 80.0% 위치(저점0·고점100)',
    ])
  })

  it('omits missing context instead of fabricating zero returns or benchmark comparisons', () => {
    const feature = rationaleFeature()
    const summary = buildAnalysisSummary(feature)
    expect(summary.split('|').length).toBeGreaterThanOrEqual(12)
    expect(summary).not.toMatch(/최근 (5|20)거래일 종가|KOSPI|직전 20거래일 장중 고점|R2|ADX|OBV|골든크로스|순위|선정 목표|확률|NaN|undefined/)
    expect(buildAnalysisSummary(feature, { ...rationaleContext(), return5Percent: null,
      return20Percent: Number.NaN, relativeReturn20PercentagePoints: Number.POSITIVE_INFINITY,
      distanceFromPriorHigh20Percent: null,
    })).toBe(summary)
    expect(buildAnalysisSummary(feature, { ...rationaleContext(), benchmarkSymbol: 'KOSDAQ' })).not.toContain('KOSPI 대비')
  })

  it('names a partial history by its actual close-price window', () => {
    const summary = buildAnalysisSummary({ ...rationaleFeature(), position52wObservations: 80, position52wFullWindow: false })
    expect(summary).toContain('최근 80거래일 종가 범위 80.0% 위치')
    expect(summary).not.toContain('52주')
  })

  it('handles a flat candle without inventing a range position or wick ratio', () => {
    const summary = buildAnalysisSummary({ ...rationaleFeature(), open: 10_200, high: 10_200, low: 10_200 })
    expect(summary).toContain('시가 대비 0.0% 보합봉')
    expect(summary).toContain('당일 고가·저가 동일')
    expect(summary).not.toMatch(/당일 범위 종가|윗꼬리|NaN|Infinity/)
  })

  it('distinguishes breaking a prior high from reaching it and omits invalid high references', () => {
    const feature = { ...rationaleFeature(), distanceFromHigh60: 5 }
    expect(buildAnalysisSummary(feature, { ...rationaleContext(), distanceFromPriorHigh20Percent: 0 }))
      .toContain('직전 20거래일 장중 고점 10,200원 도달|직전 60거래일 최고 종가 9,714원·+5.0% 돌파')
    expect(buildAnalysisSummary({ ...feature, distanceFromHigh60: -100 },
      { ...rationaleContext(), distanceFromPriorHigh20Percent: Number.NaN }))
      .not.toMatch(/직전 (20|60)거래일/)
  })

  it('keeps legacy rationale available while the new summary contains observed facts', () => {
    const feature = rationaleFeature()
    expect(buildRationale(feature, 99, 'lowVolatility', 2)).toContain('변동성 안정 순위 2위|선정 경로 저변동 안정')
    expect(buildAnalysisSummary(feature, rationaleContext())).not.toMatch(/변동성 안정 순위|선정 경로 저변동 안정/)
  })
})

describe('production stock pick generator', () => {
  it('publishes summary returns and KOSPI comparison from the actual historical price rows', async () => {
    const fixture = makeFixture()
    const benchmarkRows: StockDailyPriceRow[] = fixture.dates.map((trade_date) => ({
      symbol: 'KOSPI', trade_date, open: 1_000, high: 1_005, low: 995, close: 1_000,
      volume: 1_000_000, source: 'kis',
    }))
    const result = await generatePicksWithMeta({ todayKst: TODAY_KST, dependencies: {
      loadTradingDays: async () => new TradingDayIndex(fixture.dates),
      loadPrices: async () => buildPriceBook([...fixture.rows, ...benchmarkRows]),
      loadMasters: async () => fixture.masters,
      loadRecentPublishedSymbols: async () => new Set<string>(),
    } })
    for (const pick of result.picks) {
      const rows = fixture.rows.filter((row) => row.symbol === pick.ticker)
      const close = rows.at(-1)!.close
      const return5 = (close / rows.at(-6)!.close - 1) * 100
      const return20 = (close / rows.at(-21)!.close - 1) * 100
      const priorHigh20 = Math.max(...rows.slice(-21, -1).map((row) => row.high!))
      expect(pick.rationale).toContain(`최근 5거래일 종가 +${return5.toFixed(1)}%`)
      expect(pick.rationale).toContain(`최근 20거래일 종가 +${return20.toFixed(1)}%`)
      expect(pick.rationale).toContain(`20거래일 KOSPI 대비 +${return20.toFixed(1)}%p`)
      expect(pick.rationale).toContain(`직전 20거래일 장중 고점 ${priorHigh20.toLocaleString('en-US')}원까지 +${((priorHigh20 / close - 1) * 100).toFixed(1)}%`)
    }
  })


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
        loadRecentPublishedSymbols: async () => new Set<string>(),
      },
    })
    const picks: unknown = JSON.parse(json)

    expect(validateStockData(picks)).toBe(true)
    expect(picks).toHaveLength(3)
    expect((picks as Array<{ ticker: string }>).map((pick) => pick.ticker).sort()).toEqual([...SYMBOLS].sort())
    expect((picks as Array<{ selection: unknown }>).map((pick) => pick.selection)).toEqual(
      [1, 2, 3].map((rank) => ({ strategy: 'lowVolatilityStable', rank,
        objective: 'lowVolatilityStable' })),
    )
    expect(loadPrices).toHaveBeenCalledWith({
      startDate: fixture.dates[0],
      endDate: SIGNAL_DATE,
    })
    for (const pick of picks as Array<{ rationale: string; signals: Record<string, number> }>) {
      expect(pick.rationale.split('|').length).toBeGreaterThanOrEqual(12)
      expect(pick.rationale.length).toBeGreaterThanOrEqual(50)
      expect(pick.rationale).not.toMatch(/공동 목표 모델 순위|선정 목표|변동성 안정 순위|선정 경로 저변동 안정/)
      expect(Object.values(pick.signals).every(Number.isInteger)).toBe(true)
    }
  })

  it('keeps production available before frozen-model labels are observable and skips only the target shadow', async () => {
    const todayKst = FROZEN_BULLISH_TARGET_MODEL.trainedLabelsThrough
    const signalDate = addKoreanTradingDays(todayKst, -1)
    const fixture = makeFixture(SYMBOLS, signalDate)
    const loadPrices = vi.fn(async () => fixture.prices)
    const rankTarget = vi.spyOn(strategies, 'rankBullishTargetCandidates')
    try {
      const result = await generatePicksWithMeta({ todayKst, dependencies: {
        loadTradingDays: async () => new TradingDayIndex(fixture.dates), loadPrices,
        loadMasters: async () => fixture.masters,
        loadRecentPublishedSymbols: async () => new Set<string>(),
      } })
      expect(result.picks).toHaveLength(3)
      expect(result.meta.signalDate).toBe(signalDate)
      expect(result.meta.strategy).toBe('lowVolatilityStable')
      expect(loadPrices).toHaveBeenCalledOnce()
      expect(rankTarget).not.toHaveBeenCalled()
      expect(result.meta.shadows.map((shadow) => shadow.strategy)).toEqual([
        'shadow:A-volumeBreakout-v1.1', 'shadow:B-random', 'shadow:J-randomConstrained',
      ])
    } finally {
      rankTarget.mockRestore()
    }
  })

  it('uses ATR order in production and retains frozen-model ordering only in its shadow', async () => {
    const fixture = makeFixture()
    const result = await generatePicksWithMeta({ todayKst: TODAY_KST, dependencies: {
      loadTradingDays: async () => new TradingDayIndex(fixture.dates),
      loadPrices: async () => fixture.prices, loadMasters: async () => fixture.masters,
      loadRecentPublishedSymbols: async () => new Set<string>(),
    } })
    const base = result.meta.rankedCandidates[0]!
    const candidates = [
      { ...base, symbol: 'KOSPI:000010', atrPercent14: 4, gapFromPreviousClosePercent: 8 },
      { ...base, symbol: 'KOSPI:000020', atrPercent14: 4, gapFromPreviousClosePercent: -7 },
    ]
    const masters = new Map(candidates.map((candidate) => [candidate.symbol,
      { symbol: candidate.symbol, is_active: true, status_flags: {} }]))
    const ranking = strategies.rankBullishTargetCandidates({ features: candidates, masters,
      parameters: strategies.BULLISH_TARGET_PARAMETERS, excludeSymbols: new Set(), model: FROZEN_BULLISH_TARGET_MODEL })
    expect(ranking.map((candidate) => candidate.symbol)).toEqual(['KOSPI:000020', 'KOSPI:000010'])
    expect(ranking[0]!.score).toBeGreaterThan(ranking[1]!.score)
    expect(result.meta.rankedCandidates.map((candidate) => candidate.score)).toEqual(
      result.meta.rankedCandidates.map((candidate) => candidate.atrPercent14),
    )
    const targetShadow = result.meta.shadows.find((shadow) => shadow.strategy === 'shadow:bullishTarget-v3')!
    expect(targetShadow).toMatchObject({
      strategyVersion: BULLISH_TARGET_STRATEGY.version,
      parametersHash: BULLISH_TARGET_STRATEGY.parametersHash,
    })
    expect(targetShadow.picks.map((candidate) => candidate.score)).toEqual(
      targetShadow.picks.map((candidate) => scoreTargetModel(candidate, FROZEN_BULLISH_TARGET_MODEL)),
    )
    expect(targetShadow.picks.map((candidate) => candidate.score)).toEqual(
      [...targetShadow.picks.map((candidate) => candidate.score)].sort((left, right) => right - left),
    )
  })

  it('selects three lower-ATR candidates ahead of an eligible high-ATR stock after an 18% fall', async () => {
    const fixture = makeFixture(FOUR_SYMBOLS)
    const distressedSymbol = FOUR_SYMBOLS[0]
    const rows = fixture.rows.map((row) => {
      if (row.symbol !== distressedSymbol) return row
      const close = row.trade_date === SIGNAL_DATE ? Math.round(row.open! * 0.82) : row.close
      return { ...row, close, high: Math.round(row.high! * 1.2),
        low: Math.round(Math.min(row.low!, close!) * 0.8) }
    })
    const result = await generatePicksWithMeta({ todayKst: TODAY_KST, dependencies: {
      loadTradingDays: async () => new TradingDayIndex(fixture.dates),
      loadPrices: async () => buildPriceBook(rows), loadMasters: async () => fixture.masters,
      loadRecentPublishedSymbols: async () => new Set<string>(),
    } })
    const distressed = result.meta.rankedCandidates.find((candidate) => candidate.symbol === distressedSymbol)!
    expect(distressed.atrPercent14).toBeGreaterThan(20)
    expect(distressed.close! / distressed.open! - 1).toBeCloseTo(-0.18, 2)
    expect(distressed.rank).toBe(4)
    expect(result.picks.map((pick) => pick.ticker).sort()).toEqual(FOUR_SYMBOLS.slice(1).sort())
    const candidates = result.meta.rankedCandidates
    expect(candidates.map((candidate) => candidate.score)).toEqual(
      [...candidates.map((candidate) => candidate.atrPercent14!)].sort((left, right) => left - right),
    )
    expect(result.meta).toMatchObject({
      strategy: PRODUCTION_STRATEGY.name,
      strategyVersion: PRODUCTION_STRATEGY.version,
      parameters: PRODUCTION_STRATEGY.parameters,
      parametersHash: PRODUCTION_STRATEGY.parametersHash,
    })
  })

  it('labels a down candle above the previous close as a positive daily return', async () => {
    const fixture = makeFixture()
    const result = await generatePicksWithMeta({
      todayKst: TODAY_KST,
      dependencies: {
        loadTradingDays: async () => new TradingDayIndex(fixture.dates),
        loadPrices: async () => fixture.prices,
        loadMasters: async () => fixture.masters,
        loadRecentPublishedSymbols: async () => new Set<string>(),
      },
    })
    const previousClose = 100
    const open = 103
    const close = 102
    const feature = {
      ...result.meta.rankedCandidates[0]!,
      open,
      close,
      gapFromPreviousClosePercent: (open / previousClose - 1) * 100,
    }

    expect(buildRationale(feature, 0, 'lowVolatility').split('|')[1]).toBe('당일 등락 2.0% 상승')
  })

  it('throws when the previous-close gap is missing from a rationale feature', async () => {
    const fixture = makeFixture()
    const result = await generatePicksWithMeta({
      todayKst: TODAY_KST,
      dependencies: {
        loadTradingDays: async () => new TradingDayIndex(fixture.dates),
        loadPrices: async () => fixture.prices,
        loadMasters: async () => fixture.masters,
        loadRecentPublishedSymbols: async () => new Set<string>(),
      },
    })
    const feature = { ...result.meta.rankedCandidates[0]!, gapFromPreviousClosePercent: null }

    expect(() => buildRationale(feature, 0, 'lowVolatility')).toThrow(
      `당일 등락 계산 불가: ${feature.symbol}`,
    )
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
        loadRecentPublishedSymbols: async () => new Set<string>(),
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
        loadRecentPublishedSymbols: async () => new Set<string>(),
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
        loadRecentPublishedSymbols: async () => new Set<string>(),
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
        loadRecentPublishedSymbols: async () => new Set<string>(),
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
        loadRecentPublishedSymbols: async () => new Set<string>(),
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
        loadRecentPublishedSymbols: async () => new Set<string>(),
      },
    })).rejects.toThrow(/저변동 후보 부족: 0\/3/)
  })

  it('emits funnel and generated observability without changing the pick contract', async () => {
    const fixture = makeFixture()
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const dependencies = {
      loadTradingDays: async () => new TradingDayIndex(fixture.dates),
      loadPrices: async () => fixture.prices,
      loadMasters: async () => fixture.masters,
        loadRecentPublishedSymbols: async () => new Set<string>(),
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
        strategy: 'lowVolatilityStable',
        strategyVersion: PRODUCTION_STRATEGY.version,
        picksByTier: { lowVolatility: 3 },
        picks: expect.arrayContaining([expect.objectContaining({ rank: 1, tier: 'lowVolatility' })]),
      })
      expect(result.meta.parametersHash).toMatch(/^[a-f0-9]{64}$/)
      expect(result.meta.rankedCandidates.map((candidate) => candidate.score)).toEqual(
        [...result.meta.rankedCandidates.map((candidate) => candidate.score)].sort((a, b) => a - b),
      )
      expect(result.meta.shadows.map((shadow) => shadow.strategy)).toEqual([
        'shadow:bullishTarget-v3', 'shadow:A-volumeBreakout-v1.1', 'shadow:B-random', 'shadow:J-randomConstrained',
      ])
      expect(result.meta.shadows.every((shadow) => shadow.picks.length === 3)).toBe(true)
      expect(result.meta.shadows.find((shadow) => shadow.strategy === 'shadow:A-volumeBreakout-v1.1')?.picks.map((pick) => pick.tier)).toEqual([
        'breakout', 'breakout', 'volumeOnly',
      ])
      for (const [index, pick] of result.picks.entries()) {
        const candidate = result.meta.rankedCandidates[index]!
        expect(pick.rationale.split('|')).toEqual(
          buildAnalysisSummary(candidate, candidate.technicalContext).split('|'),
        )
        expect(candidate.technicalContext?.return5Percent).not.toBeNull()
        expect(pick.rationale).toContain(`최근 5거래일 종가 +${candidate.technicalContext!.return5Percent!.toFixed(1)}%`)
        expect(pick.rationale).toContain(`최근 20거래일 종가 +${candidate.technicalContext!.return20Percent!.toFixed(1)}%`)
        expect(pick.rationale).not.toMatch(/공동 목표 모델 순위|선정 목표|변동성 안정 순위|선정 경로 저변동 안정/)
      }
      expect(events.find((event) => event.event === 'stock_picks_generated').shadows)
        .toEqual(result.meta.shadows.map((shadow) => ({ strategy: shadow.strategy,
          picks: shadow.picks.map((pick) => pick.symbol) })))
    } finally {
      logSpy.mockRestore()
    }
  })

  it('excludes recently published symbols from production and constrained random shadow', async () => {
    const fixture = makeFixture(FOUR_SYMBOLS)
    const loadRecentPublishedSymbols = vi.fn(async () => new Set<string>([FOUR_SYMBOLS[0]]))
    const result = await generatePicksWithMeta({ todayKst: TODAY_KST, dependencies: {
      loadTradingDays: async () => new TradingDayIndex(fixture.dates),
      loadPrices: async () => fixture.prices,
      loadMasters: async () => fixture.masters,
      loadRecentPublishedSymbols,
    } })
    expect(loadRecentPublishedSymbols).toHaveBeenCalledWith({
      signalDate: SIGNAL_DATE,
      tradingDays: expect.any(TradingDayIndex),
      lookbackTradingDays: 20,
    })
    expect(result.picks.map((pick) => pick.ticker)).not.toContain(FOUR_SYMBOLS[0])
    expect(result.meta.shadows.find((shadow) => shadow.strategy === 'shadow:J-randomConstrained')
      ?.picks.map((pick) => pick.symbol)).not.toContain(FOUR_SYMBOLS[0])
  })

  it.each([
    ['target', 'shadow:bullishTarget-v3'],
    ['A', 'shadow:A-volumeBreakout-v1.1'],
    ['B', 'shadow:B-random'],
    ['J', 'shadow:J-randomConstrained'],
  ] as const)('keeps three production picks and other shadows when shadow %s throws', async (target, strategy) => {
    const fixture = makeFixture()
    const dependencies = {
      loadTradingDays: async () => new TradingDayIndex(fixture.dates),
      loadPrices: async () => fixture.prices,
      loadMasters: async () => fixture.masters,
      loadRecentPublishedSymbols: async () => new Set<string>(),
    }
    const baseline = await generatePicksWithMeta({ todayKst: TODAY_KST, dependencies })
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const rankRandom = strategies.rankSeededRandomCandidates
    if (target === 'target') {
      vi.spyOn(strategies, 'rankBullishTargetCandidates').mockImplementation(() => { throw new Error('shadow failed') })
    } else if (target === 'A') {
      vi.spyOn(strategies, 'rankStrategyCandidates').mockImplementation(() => { throw new Error('shadow failed') })
    } else {
      vi.spyOn(strategies, 'rankSeededRandomCandidates').mockImplementation((input) => {
        if (input.seed.endsWith(`:${target}`)) throw new Error('shadow failed')
        return rankRandom(input)
      })
    }
    try {
      const result = await generatePicksWithMeta({ todayKst: TODAY_KST, dependencies })
      expect(result.picks).toHaveLength(3)
      expect(result.json).toBe(baseline.json)
      expect(result.meta.shadows.map((shadow) => shadow.strategy)).toEqual(
        baseline.meta.shadows.map((shadow) => shadow.strategy).filter((name) => name !== strategy),
      )
      expect(warning).toHaveBeenCalledWith(expect.stringContaining(`${strategy} 섀도우 계산 실패`),
        expect.any(Error))
    } finally {
      vi.restoreAllMocks()
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
        loadRecentPublishedSymbols: async () => new Set<string>(),
        },
      })
      const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'))

      expect(snapshot).toMatchObject({
        signalDate: SIGNAL_DATE,
        gitSha: 'fixture-sha',
        strategy: 'lowVolatilityStable',
        strategyVersion: PRODUCTION_STRATEGY.version,
        parametersHash: result.meta.parametersHash,
        funnel: result.meta.funnel,
      })
      expect(snapshot.picks).toHaveLength(3)
      expect(snapshot.picks[0]).toEqual(expect.objectContaining({
        symbol: expect.any(String),
        score: expect.any(Number),
        rank: 1,
        tier: 'lowVolatility',
        technicalContext: expect.objectContaining({
          version: 'technical-context-v1',
          chaikinMoneyFlow21: expect.any(Number),
          breadthUniverseSymbols: 3,
          // fixture에 없는 시장 지수를 보합으로 꾸며내지 않는다.
          relativeReturn20PercentagePoints: null,
        }),
      }))
      expect(snapshot.topCandidates).toHaveLength(3)
      expect(snapshot.topCandidates.map((candidate: { tier: string }) => candidate.tier)).toEqual([
        'lowVolatility',
        'lowVolatility',
        'lowVolatility',
      ])
    } finally {
      vi.unstubAllEnvs()
      logSpy.mockRestore()
      await rm(temporaryDirectory, { recursive: true, force: true })
    }
  })
})
