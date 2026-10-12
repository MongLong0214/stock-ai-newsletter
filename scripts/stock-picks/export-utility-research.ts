import { createReadStream } from 'node:fs'
import { mkdir, open, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createInterface } from 'node:readline'

import { buildPriceBook, StockDataHandler } from '@/scripts/stock-picks/data-handler'
import { buildFeatureSeries } from '@/scripts/stock-picks/features'
import { hasCalculatedOutputMetrics, type StockPickMaster } from '@/scripts/stock-picks/generate-picks'
import { labelPick } from '@/scripts/stock-picks/label'
import { buildObservedInputs50, OBSERVED_INPUT_NAMES, validateModelMarketSources } from '@/scripts/stock-picks/observed-inputs'
import { LOW_VOLATILITY_STABLE_PARAMETERS, rankUtilityScoreCandidates } from '@/scripts/stock-picks/strategies'
import { buildTechnicalContextMap } from '@/scripts/stock-picks/technical-context'
import { TradingDayIndex } from '@/scripts/stock-picks/trading-days'
import type { StockDailyPriceRow } from '@/scripts/tli/prices/stock-daily-prices'

/** Local files only. Never filters candidates using a future outcome. */
async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const option = (name: string): string => {
    const i = args.indexOf(name)
    if (i < 0 || !args[i + 1] || args[i + 1]!.startsWith('--')) throw new Error(`Missing ${name}`)
    return args[i + 1]!
  }
  const raw: StockDailyPriceRow[] = []
  const keys = new Set<string>()
  const pricePath = resolve(option('--prices'))
  const masterPath = resolve(option('--master'))
  const calendarPath = resolve(option('--calendar'))
  const outputDir = resolve(option('--output-dir'))
  const from = option('--from')
  if (outputDir === resolve(pricePath, '..') || outputDir === resolve(masterPath, '..')
    || outputDir === resolve(calendarPath, '..')) throw new Error('Use a separate output directory')
  const lines = createInterface({ input: createReadStream(pricePath), crlfDelay: Infinity })
  for await (const line of lines) {
    if (!line.trim()) continue
    const [symbol, rows]: [string, StockDailyPriceRow[]] = JSON.parse(line)
    if (!Array.isArray(rows)) throw new Error('Expected [symbol, bars] NDJSON')
    for (const row of rows) {
      const key = `${symbol}/${row.trade_date}`
      if (row.symbol !== symbol || row.source !== 'kis' || keys.has(key)) throw new Error(`Invalid KIS row: ${key}`)
      keys.add(key); raw.push(row)
    }
  }
  const prices = buildPriceBook(raw)
  const master: StockPickMaster[] = JSON.parse(await readFile(masterPath, 'utf8'))
  if (!Array.isArray(master) || new Set(master.map((m) => m.symbol)).size !== master.length) throw new Error('Invalid master')
  const active = master.filter((m) => m.is_active)
  const masters = new Map(active.map((m) => [m.symbol, m]))
  const { tradingDays: dates }: { tradingDays: string[] } = JSON.parse(await readFile(calendarPath, 'utf8'))
  if (!Array.isArray(dates) || !dates.length || dates.some((d, i) => !/^\d{4}-\d{2}-\d{2}$/.test(d)
    || (i > 0 && d <= dates[i - 1]!)) || !dates.includes(from)) throw new Error('Invalid calendar/from date')
  const days = new TradingDayIndex(dates)
  const handler = new StockDataHandler(prices, days)
  const contexts = buildTechnicalContextMap({ handler: handler.at(dates.at(-1)!),
    symbols: active.map((m) => m.symbol), dates, includeFromDate: from })
  for (const [i, d] of dates.entries()) if (d >= from) validateModelMarketSources({
    handler: handler.at(d), symbols: active.map((m) => m.symbol), dates: dates.slice(Math.max(0, i - 319), i + 1),
  })
  await mkdir(outputDir, { recursive: true })
  const output = await open(resolve(outputDir, 'features.ndjson'), 'w')
  let eligible = 0; let strict = 0
  try {
    for (const [i, m] of active.entries()) {
      const series = buildFeatureSeries({ handler: handler.at(dates.at(-1)!), symbol: m.symbol, dates, includeFromDate: from })
      for (const f of series) {
        if (handler.at(f.simDate).get(m.symbol, f.simDate)?.source !== 'kis' || !hasCalculatedOutputMetrics(f)) continue
        if (!rankUtilityScoreCandidates({ features: [f], masters, scores: new Map([[f.symbol, 0]]),
          parameters: LOW_VOLATILITY_STABLE_PARAMETERS, excludeSymbols: new Set(), pickCount: 1 }).length) continue
        const j = days.indexByDate.get(f.simDate)!
        const history = dates.slice(Math.max(0, j - 319), j + 1)
        const context = contexts.get(f.simDate)?.get(f.symbol)
        if (!context) throw new Error('Missing technical context')
        const x = buildObservedInputs50({ feature: f, context, handler: handler.at(f.simDate), dates: history })
        const label = labelPick(f.symbol, f.simDate, prices, days)
        const valid = label && (label.status === 'hit' || label.status === 'miss')
          && dates.slice(j + 1, j + 6).every((d) => (prices.get(f.symbol)?.get(d)?.volume ?? 0) > 0)
        await output.writeFile(`${JSON.stringify({ date: f.simDate, symbol: f.symbol, runtimeEligible: true,
          originalInputs18: x.slice(0, 18), extraInputs32: x.slice(18), turnover: f.averageTurnover20,
          historySessions: history.length, signalClose: f.close, label: valid ? label : null })}\n`)
        eligible++; if (valid) strict++
      }
      if ((i + 1) % 100 === 0) console.log(JSON.stringify({ symbols: i + 1, eligible, strict }))
    }
  } finally { await output.close() }
  await writeFile(resolve(outputDir, 'feature-spec.json'), JSON.stringify({ featureNames: OBSERVED_INPUT_NAMES }))
  await writeFile(resolve(outputDir, 'calendar.json'), JSON.stringify({ tradingDays: dates }))
  console.log(JSON.stringify({ complete: true, eligible, strict }))
}

main().catch((e: unknown) => { console.error(e instanceof Error ? e.message : String(e)); process.exitCode = 1 })
