import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { runBacktest, movingBlockBootstrapCi, type BacktestReport } from '@/scripts/stock-picks/backtest'
import { validateResearchDataset } from '@/scripts/stock-picks/data-contract'
import { loadPriceBook, StockDataHandler, type PriceBook } from '@/scripts/stock-picks/data-handler'
import type { StockFeatureVector } from '@/scripts/stock-picks/features'
import { hasCalculatedOutputMetrics } from '@/scripts/stock-picks/generate-picks'
import { precomputeFeatureMap } from '@/scripts/stock-picks/optimize'
import { LEGACY_VOLUME_BREAKOUT_STRATEGY, PRODUCTION_VOLUME_BREAKOUT_PARAMETERS } from '@/scripts/stock-picks/production-strategy'
import { loadStockMasterStates, rankTieredFillCandidates, type StockMasterState } from '@/scripts/stock-picks/strategies'
import { buildTechnicalContextMap, type TechnicalContext } from '@/scripts/stock-picks/technical-context'
import { loadTradingDayIndex, type TradingDayIndex } from '@/scripts/stock-picks/trading-days'

export type TechnicalExperiment = 'production' | 'confirmedFirstFill3' | 'confirmedBreakout' | 'confirmedBreakoutMarket'
const EXPERIMENTS: readonly TechnicalExperiment[] = ['production', 'confirmedFirstFill3', 'confirmedBreakout', 'confirmedBreakoutMarket']

/** 고정된 탐색 가설이다. 검증된 확률 모델이나 프로덕션 승격 조건이 아니다. */
export function passesTechnicalConfirmation(context: TechnicalContext | undefined, withMarket: boolean): boolean {
  if (!context
    || context.relativeReturn20PercentagePoints === null || context.relativeReturn20PercentagePoints <= 0
    || context.chaikinMoneyFlow21 === null || context.chaikinMoneyFlow21 <= 0
    || context.closeLocation === null || context.closeLocation < 0.5
  ) return false
  return !withMarket || (
    context.benchmarkSma20DistancePercent !== null && context.benchmarkSma20DistancePercent > 0
    && context.breadthAboveSma20 !== null && context.breadthAboveSma20 >= 0.5
  )
}

export function summarizeTechnicalReturns(report: BacktestReport, costBps: number) {
  const labels = report.daily.flatMap((day) => day.picks.flatMap((pick) => (
    pick.label && (pick.label.status === 'hit' || pick.label.status === 'miss') && pick.label.return5d !== null
      ? [pick.label] : []
  )))
  const values = labels.map((label) => label.return5d! - costBps / 10_000).sort((a, b) => a - b)
  const dailySlotNetReturns = report.daily.map((day) => day.picks.reduce((sum, pick) => (
    sum + (pick.label && (pick.label.status === 'hit' || pick.label.status === 'miss') && pick.label.return5d !== null
      ? pick.label.return5d - costBps / 10_000 : 0)
  ), 0) / 3)
  return {
    evaluablePicks: values.length,
    positiveRate: values.length > 0 ? values.filter((value) => value > 0).length / values.length : null,
    meanNetReturn: values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null,
    medianNetReturn: values.length > 0 ? (values[Math.floor((values.length - 1) / 2)]! + values[Math.floor(values.length / 2)]!) / 2 : null,
    worstNetReturn: values[0] ?? null,
    allThreeHitRate: report.totalDates > 0 ? report.daily.filter((day) => day.hits === 3).length / report.totalDates : null,
    dailySlotNetReturns,
  }
}

export function evaluateTechnicalContexts(input: {
  readonly prices: PriceBook
  readonly tradingDays: TradingDayIndex
  readonly masters: readonly StockMasterState[]
  readonly dates: readonly string[]
  readonly features: ReadonlyMap<string, readonly StockFeatureVector[]>
  readonly contexts: ReadonlyMap<string, ReadonlyMap<string, TechnicalContext>>
  readonly costBps: number
}) {
  if (!Number.isFinite(input.costBps) || input.costBps < 0) throw new Error('costBps must be finite and nonnegative')
  if (input.dates.length === 0) throw new Error('No evaluation dates')
  const masters = new Map(input.masters.map((master) => [master.symbol, master]))
  const universe = input.masters.filter((master) => master.is_active).map((master) => master.symbol)
  const experiments = EXPERIMENTS.map((name) => {
    const backtest = runBacktest({
      strategyName: name, prices: input.prices, tradingDays: input.tradingDays, universe,
      startDate: input.dates[0], endDate: input.dates.at(-1),
      strategy: (handler, _universe, date) => {
        const keepsThree = name === 'production' || name === 'confirmedFirstFill3'
        const features = (input.features.get(date) ?? []).filter((feature) => (
          handler.get(feature.symbol, date)?.source === 'kis' && hasCalculatedOutputMetrics(feature)
          && (keepsThree || passesTechnicalConfirmation(
            input.contexts.get(date)?.get(feature.symbol), name === 'confirmedBreakoutMarket',
          ))
        ))
        const ranked = rankTieredFillCandidates({
          features, masters, parameters: PRODUCTION_VOLUME_BREAKOUT_PARAMETERS,
          tiers: keepsThree ? LEGACY_VOLUME_BREAKOUT_STRATEGY.fillTiers : ['breakout'],
          pickCount: name === 'confirmedFirstFill3' ? features.length : 3,
        })
        if (name === 'confirmedFirstFill3') {
          const confirmed = ranked.filter((pick) => pick.tier === 'breakout'
            && passesTechnicalConfirmation(input.contexts.get(date)?.get(pick.symbol), false))
          return [...new Set([...confirmed, ...ranked].map((pick) => pick.symbol))].slice(0, 3)
        }
        return ranked.map((pick) => pick.symbol)
      },
    })
    return { name, backtest, returns5d: summarizeTechnicalReturns(backtest, input.costBps) }
  })
  const baseline = experiments[0]!
  return experiments.map((experiment) => ({
    ...experiment,
    // 비추천 슬롯은 0, 오류 슬롯도 0으로 남기며 오류 건수는 backtest에 따로 노출한다.
    // 겹치는 5일 보유 수익이므로 실제 포트폴리오 수익률이나 Sharpe로 해석하지 않는다.
    pairedDailySlotNetReturnDelta95: movingBlockBootstrapCi(
      experiment.returns5d.dailySlotNetReturns.map((value, index) => value - baseline.returns5d.dailySlotNetReturns[index]!),
      { seed: 42, blockLength: 10, resamples: 2_000 },
    ),
  }))
}

async function runCli() {
  const args = process.argv.slice(2)
  const option = (name: string): string | undefined => args.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1)
  const days = Number(option('--days') ?? 120)
  const costBps = Number(option('--cost-bps') ?? 30)
  const out = option('--out')
  if (!Number.isInteger(days) || days <= 0 || !Number.isFinite(costBps) || costBps < 0 || !out) {
    throw new Error('Usage: npm run stocks:research-context -- --days=120 --cost-bps=30 --out=output/context.json')
  }
  const [tradingDays, masters] = await Promise.all([loadTradingDayIndex(), loadStockMasterStates()])
  const dates = tradingDays.tradingDays.slice(0, -5).slice(-days)
  if (dates.length !== days) throw new Error(`Insufficient mature signal dates: ${dates.length}/${days}`)
  const startIndex = tradingDays.indexByDate.get(dates[0]!)!
  const historyDates = tradingDays.tradingDays.slice(Math.max(0, startIndex - 319), startIndex + dates.length)
  if (startIndex < 319) throw new Error('320-session production warmup is unavailable for the requested start date')
  const prices = await loadPriceBook({ startDate: historyDates[0], endDate: tradingDays.lastDate! })
  const dataQuality = validateResearchDataset({ prices, tradingDays, fromDate: historyDates[0]!, toDate: tradingDays.lastDate! })
  console.log(JSON.stringify({ event: 'technical_context_dataset', ...dataQuality }))
  if (!dataQuality.ok) throw new Error('Dataset has invalid OHLC, sparse dates or missing sessions; repair before comparison')
  const activeMasters = masters.filter((master) => master.is_active)
  const features = precomputeFeatureMap({
    prices, tradingDays, masters: activeMasters, historyDates, evaluationStart: dates[0]!,
    onProgress: (completed, total) => { if (completed % 200 === 0 || completed === total) console.log(`Features ${completed}/${total}`) },
  })
  const contexts = buildTechnicalContextMap({
    handler: new StockDataHandler(prices, tradingDays).at(dates.at(-1)!),
    symbols: activeMasters.map((master) => master.symbol), dates: historyDates, includeFromDate: dates[0],
  })
  const results = evaluateTechnicalContexts({ prices, tradingDays, masters, dates, features, contexts, costBps })
  const contextValues = [...contexts.values()].flatMap((day) => [...day.values()])
  const coverage = Object.fromEntries(Object.keys(contextValues[0] ?? {}).map((key) => [
    key, contextValues.filter((context) => context[key as keyof TechnicalContext] !== null).length,
  ]))
  const report = {
    generatedAt: new Date().toISOString(),
    evaluationScope: 'exploratory_historical_comparison_not_unseen_holdout',
    dates: { start: dates[0], end: dates.at(-1), signalDays: dates.length },
    productionStrategy: LEGACY_VOLUME_BREAKOUT_STRATEGY,
    execution: { entry: 'next_session_open', exit: 'fifth_holding_session_close', roundTripCostBps: costBps },
    hypotheses: {
      confirmedFirstFill3: 'confirmed breakout candidates first; fill remaining slots in original production order; exactly 3 when available',
      confirmedBreakout: 'production breakout only; relative return20 > 0pp, CMF21 > 0, close location >= 0.5; up to 3',
      confirmedBreakoutMarket: 'confirmedBreakout plus KOSPI above SMA20 and observed universe breadth above SMA20 >= 50%; up to 3',
    },
    data: { symbols: activeMasters.length, priceRows: [...prices.values()].reduce((sum, rows) => sum + rows.size, 0), contextObservations: contextValues.length, coverage, quality: dataQuality },
    caveats: [
      'Current stock_master and status_flags cause survivorship and historical-status bias.',
      'Historical rules and this experiment share previously inspected dates; no prospective accuracy guarantee.',
      'The fixed-three reranking comparison was added after observing the abstention results; it is also exploratory.',
      'This replays the code selector only, not prepare-newsletter market-assessment alerts or LLM fallback.',
      'KOSPI is the common benchmark even for KOSDAQ stocks; CMF is an OHLCV proxy, not investor flows.',
      'Adjusted daily prices may mix adjustment vintages; corporate actions and actual fills are not reconstructed.',
      'Abstention changes coverage. Compare conditional precision together with three-slot precision and costs.',
      'Returns overlap in time; slot returns are opportunity comparisons, not a funded portfolio equity curve.',
    ],
    sources: [
      'https://www.nber.org/papers/w7613', 'https://www.nber.org/papers/w20439',
      'https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/cmf',
      'https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/bollinger-band-width',
    ],
    results,
    latestCandidateContexts: (features.get(dates.at(-1)!) ?? []).filter(hasCalculatedOutputMetrics).map((feature) => ({
      symbol: feature.symbol, date: feature.simDate, context: contexts.get(feature.simDate)?.get(feature.symbol),
    })),
  }
  const path = resolve(out)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.table(results.map(({ name, backtest, returns5d }) => ({
    name, picks: backtest.totalPicks, coverage: backtest.slotCoverage, touchRate: backtest.precisionAt3,
    slotTouchRate: backtest.slotPrecisionAt3, positiveRate: returns5d.positiveRate,
    meanNetReturn: returns5d.meanNetReturn, dataErrors: backtest.statusCounts.data_error,
  })))
  console.log(`Saved ${path}`)
}

if (/research-technical-context\.(?:ts|js)$/.test(process.argv[1] ?? '')) {
  runCli().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1 })
}
