import { createReadStream } from 'node:fs'
import { mkdir, open, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createInterface } from 'node:readline'

import { StockDataHandler, type PriceBook } from '@/scripts/stock-picks/data-handler'
import { buildFeatureSeries, type StockFeatureVector } from '@/scripts/stock-picks/features'
import { hasCalculatedOutputMetrics, type StockPickMaster } from '@/scripts/stock-picks/generate-picks'
import { labelEntryDay, labelPick } from '@/scripts/stock-picks/label'
import { LEGACY_VOLUME_BREAKOUT_STRATEGY, PRODUCTION_VOLUME_BREAKOUT_PARAMETERS } from '@/scripts/stock-picks/production-strategy'
import { isPreferredShare, LOW_VOLATILITY_STABLE_PARAMETERS, passesCommonGate, rankTieredFillCandidates } from '@/scripts/stock-picks/strategies'
import { TradingDayIndex } from '@/scripts/stock-picks/trading-days'
import type { StockDailyPriceRow } from '@/scripts/tli/prices/stock-daily-prices'

interface SnapshotMetadata extends Record<string, unknown> {
  readonly masters: readonly StockPickMaster[]
  readonly tradingDays: readonly string[]
  readonly history: readonly string[]
  readonly evaluationDates: readonly string[]
  readonly asOfDate: string
}

const isDate = (value: unknown): value is string => (
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
)

async function readMetadata(inputDirectory: string): Promise<SnapshotMetadata> {
  const metadata: SnapshotMetadata = JSON.parse(await readFile(resolve(inputDirectory, 'metadata.json'), 'utf8'))
  if (!metadata || !Array.isArray(metadata.masters) || !isDate(metadata.asOfDate)) {
    throw new Error('metadata.json requires masters and asOfDate')
  }
  for (const key of ['tradingDays', 'history', 'evaluationDates'] as const) {
    const dates = metadata[key]
    if (!Array.isArray(dates) || dates.length === 0 || !dates.every(isDate)
      || dates.some((date, index) => index > 0 && date <= dates[index - 1])) {
      throw new Error(`metadata.${key} must contain unique ascending dates`)
    }
  }
  if (metadata.masters.some((master) => !master || typeof master.symbol !== 'string'
    || typeof master.is_active !== 'boolean')
    || new Set(metadata.masters.map((master) => master.symbol)).size !== metadata.masters.length) {
    throw new Error('metadata.masters requires distinct symbols and is_active flags')
  }
  const calendar = new Set(metadata.tradingDays)
  const history = new Set(metadata.history)
  if (metadata.history.some((date) => !calendar.has(date) || date > metadata.asOfDate)
    || metadata.evaluationDates.some((date) => !history.has(date))) {
    throw new Error('history/evaluationDates must belong to the snapshot calendar through asOfDate')
  }
  return metadata
}

async function readPrices(inputDirectory: string, asOfDate: string): Promise<PriceBook> {
  const prices = new Map<string, Map<string, StockDailyPriceRow>>()
  const lines = createInterface({ input: createReadStream(resolve(inputDirectory, 'prices.ndjson')), crlfDelay: Infinity })
  for await (const line of lines) {
    if (!line.trim()) continue
    const [symbol, rows]: [string, StockDailyPriceRow[]] = JSON.parse(line)
    if (typeof symbol !== 'string' || !Array.isArray(rows) || prices.has(symbol)) {
      throw new Error('prices.ndjson requires distinct [symbol, rows] entries')
    }
    const byDate = new Map<string, StockDailyPriceRow>()
    for (const row of rows) {
      if (row.symbol !== symbol || !isDate(row.trade_date) || byDate.has(row.trade_date)) {
        throw new Error(`Invalid or duplicate price row for ${symbol}`)
      }
      if (row.trade_date <= asOfDate) byDate.set(row.trade_date, row)
    }
    prices.set(symbol, byDate)
  }
  return prices
}

/** Rebuilds local research input without database access or feature-cache reuse. */
export async function exportTargetResearch(input: {
  readonly inputDirectory: string
  readonly outputDirectory: string
}): Promise<{ readonly dates: number; readonly points: number }> {
  const inputDirectory = resolve(input.inputDirectory)
  const outputDirectory = resolve(input.outputDirectory)
  if (inputDirectory === outputDirectory) throw new Error('Use a separate output directory to preserve the raw snapshot')
  const metadata = await readMetadata(inputDirectory)
  const prices = await readPrices(inputDirectory, metadata.asOfDate)
  const tradingDays = new TradingDayIndex(metadata.tradingDays)
  const firstSignal = metadata.evaluationDates[0]!
  const lastSignal = metadata.evaluationDates.at(-1)!
  for (const signalDate of metadata.evaluationDates) {
    const maturityDate = tradingDays.nextTradingDay(signalDate, 5)
    if (!maturityDate || maturityDate > metadata.asOfDate) {
      throw new Error(`Unfinished five-day outcome window: ${signalDate}`)
    }
  }

  // buildFeatureSeries uses only each signal's prefix; the outcome window is never a feature input.
  const history = metadata.history.filter((date) => date <= lastSignal)
  const handler = new StockDataHandler(prices, tradingDays).at(lastSignal)
  const featuresByDate = new Map(metadata.evaluationDates.map((date) => [date, [] as StockFeatureVector[]]))
  const masters = new Map(metadata.masters.map((master) => [master.symbol, master]))
  for (const [index, master] of metadata.masters.entries()) {
    if (master.is_active) {
      const series = buildFeatureSeries({ handler, symbol: master.symbol, dates: history, includeFromDate: firstSignal })
      for (const feature of series) {
        if (prices.get(master.symbol)?.get(feature.simDate)?.source === 'kis' && hasCalculatedOutputMetrics(feature)) {
          featuresByDate.get(feature.simDate)?.push(feature)
        }
      }
    }
    if ((index + 1) % 100 === 0 || index + 1 === metadata.masters.length) {
      console.log(`Features ${index + 1}/${metadata.masters.length}`)
    }
  }

  await mkdir(outputDirectory, { recursive: true })
  const output = await open(resolve(outputDirectory, 'compact.ndjson'), 'w')
  let pointCount = 0
  try {
    for (const [date, features] of featuresByDate) {
      features.sort((left, right) => left.symbol.localeCompare(right.symbol))
      const legacy = rankTieredFillCandidates({
        features, masters, parameters: PRODUCTION_VOLUME_BREAKOUT_PARAMETERS,
        tiers: LEGACY_VOLUME_BREAKOUT_STRATEGY.fillTiers, pickCount: features.length,
      })
      // The frozen Python research input uses zero-based legacy ranks.
      const legacyRanks = new Map(legacy.map((pick, index) => [pick.symbol, index]))
      const entryDate = tradingDays.nextTradingDay(date, 1)!
      const points = features.filter((feature) => passesCommonGate(
        feature, masters.get(feature.symbol), LOW_VOLATILITY_STABLE_PARAMETERS.minTurnover,
        LOW_VOLATILITY_STABLE_PARAMETERS.maxRsi,
      )).map((feature) => {
        const entry = labelEntryDay(feature.symbol, entryDate, prices)
        const signalReturn = feature.close! / feature.open! - 1
        const previousCloseReturn = feature.gapFromPreviousClosePercent === null ? null
          : (1 + feature.gapFromPreviousClosePercent / 100) * feature.close! / feature.open! - 1
        return {
          symbol: feature.symbol,
          feature,
          eligible: !isPreferredShare(feature.symbol) && previousCloseReturn !== null
            && Number.isFinite(previousCloseReturn)
            && signalReturn < LOW_VOLATILITY_STABLE_PARAMETERS.maxSignalDayReturn
            && previousCloseReturn < LOW_VOLATILITY_STABLE_PARAMETERS.maxSignalDayReturn,
          legacyRank: legacyRanks.get(feature.symbol) ?? null,
          label: labelPick(feature.symbol, date, prices, tradingDays),
          entryBullish: entry?.entryBullish ?? null,
          entryReturn: entry?.entryReturn ?? null,
        }
      })
      pointCount += points.length
      await output.writeFile(`${JSON.stringify([date, points])}\n`)
    }
  } finally {
    await output.close()
  }
  await writeFile(resolve(outputDirectory, 'metadata.json'), `${JSON.stringify(metadata)}\n`, 'utf8')
  console.log(JSON.stringify({ outputDirectory, dates: featuresByDate.size, points: pointCount }))
  return { dates: featuresByDate.size, points: pointCount }
}

async function runCli(): Promise<void> {
  const args = process.argv.slice(2)
  const option = (name: string): string | undefined => {
    const index = args.indexOf(name)
    return index < 0 ? undefined : args[index + 1]
  }
  const inputDirectory = option('--input-dir')
  const outputDirectory = option('--output-dir')
  if (!inputDirectory || !outputDirectory) {
    throw new Error('Usage: tsx scripts/stock-picks/export-target-research.ts --input-dir /snapshot --output-dir /export')
  }
  await exportTargetResearch({ inputDirectory, outputDirectory })
}

if (/export-target-research\.(?:ts|js)$/.test(process.argv[1] ?? '')) {
  runCli().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
