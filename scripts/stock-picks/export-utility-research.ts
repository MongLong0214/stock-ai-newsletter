import { createReadStream } from 'node:fs'
import { mkdir, open, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createInterface } from 'node:readline'

import { buildPriceBook, getRawPrice, StockDataHandler, type PriceBook } from '@/scripts/stock-picks/data-handler'
import { buildFeatureSeries } from '@/scripts/stock-picks/features'
import { hasCalculatedOutputMetrics, type StockPickMaster } from '@/scripts/stock-picks/generate-picks'
import { isLockedLimitUpEntry, labelPick } from '@/scripts/stock-picks/label'
import { buildObservedInputs50, OBSERVED_INPUT_NAMES, validateModelMarketSources } from '@/scripts/stock-picks/observed-inputs'
import { LOW_VOLATILITY_STABLE_PARAMETERS, rankUtilityScoreCandidates } from '@/scripts/stock-picks/strategies'
import { buildTechnicalContextMap } from '@/scripts/stock-picks/technical-context'
import { TradingDayIndex } from '@/scripts/stock-picks/trading-days'
import type { StockDailyPriceRow } from '@/scripts/tli/prices/stock-daily-prices'

export type LabelNullReason = 'immature' | 'suspendedOrUntradeable' | 'dataError'

interface StockMasterSnapshot extends StockPickMaster {
  readonly signal_date: string
  readonly market: 'KOSPI' | 'KOSDAQ'
}

/** 관측된 거래정지/진입불가는 미성숙보다 우선한다. 결측 거래량은 거래정지로 추정하지 않는다. */
export function utilityResearchLabel(symbol: string, signalDate: string, prices: PriceBook, days: TradingDayIndex) {
  const j = days.indexByDate.get(signalDate)!
  const windowDates = days.tradingDays.slice(j + 1, j + 6)
  const windowRows = windowDates.map((date) => getRawPrice(prices, symbol, date))
  const label = labelPick(symbol, signalDate, prices, days)
  const valid = label && (label.status === 'hit' || label.status === 'miss')
    && windowRows.every((row) => (row?.volume ?? 0) > 0)
  const lockedLimitUpEntry = isLockedLimitUpEntry(windowRows[0], getRawPrice(prices, symbol, signalDate)?.close)
  const suspensionPath = windowRows.some((row) => row?.volume === 0)
  const labelNullReason: LabelNullReason | null = valid ? null
    : suspensionPath || lockedLimitUpEntry || label?.status === 'unexpected_untradeable' ? 'suspendedOrUntradeable'
      : !label ? 'immature' : 'dataError'
  return { label: valid ? label : null, labelNullReason, lockedLimitUpEntry, suspensionPath }
}

/** Local files only. Never filters candidates using a future outcome. */
export async function exportUtilityResearch(args: readonly string[]): Promise<void> {
  const option = (name: string): string => {
    const i = args.indexOf(name)
    if (i < 0 || !args[i + 1] || args[i + 1]!.startsWith('--')) throw new Error(`Missing ${name}`)
    return args[i + 1]!
  }
  const raw: StockDailyPriceRow[] = []
  const keys = new Set<string>()
  const pricePath = resolve(option('--prices'))
  const masterPath = resolve(option('--master'))
  const snapshotsPath = args.includes('--master-snapshots') ? resolve(option('--master-snapshots')) : undefined
  const calendarPath = resolve(option('--calendar'))
  const outputDir = resolve(option('--output-dir'))
  const from = option('--from')
  if (outputDir === resolve(pricePath, '..') || outputDir === resolve(masterPath, '..')
    || outputDir === resolve(calendarPath, '..')
    || (snapshotsPath && outputDir === resolve(snapshotsPath, '..'))) throw new Error('Use a separate output directory')
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
  const snapshotMasters = new Map<string, Map<string, StockPickMaster>>()
  const universe = new Map(masters)
  if (snapshotsPath) {
    const snapshots: StockMasterSnapshot[] = JSON.parse(await readFile(snapshotsPath, 'utf8'))
    if (!Array.isArray(snapshots)) throw new Error('Invalid master snapshots')
    for (const row of snapshots) {
      if (!row || !/^\d{4}-\d{2}-\d{2}$/.test(row.signal_date)
        || typeof row.symbol !== 'string' || typeof row.name !== 'string'
        || !['KOSPI', 'KOSDAQ'].includes(row.market) || typeof row.is_active !== 'boolean'
        || !(row.status_flags === null || (typeof row.status_flags === 'object' && !Array.isArray(row.status_flags)))) {
        throw new Error('Invalid master snapshot row')
      }
      const dayMasters = snapshotMasters.get(row.signal_date) ?? new Map<string, StockPickMaster>()
      if (dayMasters.has(row.symbol)) throw new Error(`Duplicate master snapshot: ${row.signal_date}/${row.symbol}`)
      dayMasters.set(row.symbol, row)
      snapshotMasters.set(row.signal_date, dayMasters)
      if (row.is_active && !universe.has(row.symbol)) universe.set(row.symbol, row)
    }
  }
  const symbols = [...universe.keys()]
  const mastersAt = (date: string) => snapshotMasters.get(date) ?? masters
  const { tradingDays: dates }: { tradingDays: string[] } = JSON.parse(await readFile(calendarPath, 'utf8'))
  if (!Array.isArray(dates) || !dates.length || dates.some((d, i) => !/^\d{4}-\d{2}-\d{2}$/.test(d)
    || (i > 0 && d <= dates[i - 1]!)) || !dates.includes(from)) throw new Error('Invalid calendar/from date')
  const days = new TradingDayIndex(dates)
  const handler = new StockDataHandler(prices, days)
  const contexts = buildTechnicalContextMap({ handler: handler.at(dates.at(-1)!),
    symbols, dates, includeFromDate: from,
    ...(snapshotsPath ? { isUniverseMember: (symbol: string, date: string) => mastersAt(date).get(symbol)?.is_active === true } : {}),
  })
  for (const [i, d] of dates.entries()) if (d >= from) validateModelMarketSources({
    handler: handler.at(d), symbols: symbols.filter(symbol => mastersAt(d).get(symbol)?.is_active),
    dates: dates.slice(Math.max(0, i - 319), i + 1),
  })
  await mkdir(outputDir, { recursive: true })
  const output = await open(resolve(outputDir, 'features.ndjson'), 'w')
  let eligible = 0; let strict = 0
  let lockedLimitUpEntries = 0; let suspensionPaths = 0
  const unknownReasons: Record<LabelNullReason, number> = { immature: 0, suspendedOrUntradeable: 0, dataError: 0 }
  try {
    for (const [i, m] of [...universe.values()].entries()) {
      const series = buildFeatureSeries({ handler: handler.at(dates.at(-1)!), symbol: m.symbol, dates, includeFromDate: from })
      for (const f of series) {
        if (handler.at(f.simDate).get(m.symbol, f.simDate)?.source !== 'kis' || !hasCalculatedOutputMetrics(f)) continue
        if (!rankUtilityScoreCandidates({ features: [f], masters: mastersAt(f.simDate), scores: new Map([[f.symbol, 0]]),
          parameters: LOW_VOLATILITY_STABLE_PARAMETERS, excludeSymbols: new Set(), pickCount: 1 }).length) continue
        const j = days.indexByDate.get(f.simDate)!
        const history = dates.slice(Math.max(0, j - 319), j + 1)
        const context = contexts.get(f.simDate)?.get(f.symbol)
        if (!context) throw new Error('Missing technical context')
        const x = buildObservedInputs50({ feature: f, context, handler: handler.at(f.simDate), dates: history })
        const { label, labelNullReason, lockedLimitUpEntry, suspensionPath } = utilityResearchLabel(f.symbol, f.simDate, prices, days)
        await output.writeFile(`${JSON.stringify({ date: f.simDate, symbol: f.symbol, runtimeEligible: true,
          originalInputs18: x.slice(0, 18), extraInputs32: x.slice(18), turnover: f.averageTurnover20,
          historySessions: history.length, signalClose: f.close, label, labelNullReason,
          ...(snapshotsPath ? { masterSource: snapshotMasters.has(f.simDate) ? 'snapshot' : 'current' } : {}),
        })}\n`)
        eligible++; if (label) strict++
        if (lockedLimitUpEntry) lockedLimitUpEntries++
        if (suspensionPath) suspensionPaths++
        if (labelNullReason) unknownReasons[labelNullReason]++
      }
      if ((i + 1) % 100 === 0) console.log(JSON.stringify({ symbols: i + 1, eligible, strict }))
    }
  } finally { await output.close() }
  await writeFile(resolve(outputDir, 'feature-spec.json'), JSON.stringify({ featureNames: OBSERVED_INPUT_NAMES }))
  await writeFile(resolve(outputDir, 'calendar.json'), JSON.stringify({ tradingDays: dates }))
  const signalDates = dates.filter(date => date >= from)
  const snapshotDates = signalDates.filter(date => snapshotMasters.has(date)).length
  console.log(JSON.stringify({ complete: true, eligible, strict, lockedLimitUpEntries, suspensionPaths, unknownReasons,
    ...(snapshotsPath ? { masterSourceDates: { snapshot: snapshotDates, current: signalDates.length - snapshotDates } } : {}),
  }))
}

if (/export-utility-research\.(?:ts|js)$/.test(process.argv[1] ?? '')) {
  exportUtilityResearch(process.argv.slice(2)).catch((e: unknown) => { console.error(e instanceof Error ? e.message : String(e)); process.exitCode = 1 })
}
