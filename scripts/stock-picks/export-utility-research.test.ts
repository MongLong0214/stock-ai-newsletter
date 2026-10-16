import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildPriceBook } from '@/scripts/stock-picks/data-handler'
import { exportUtilityResearch, utilityResearchLabel } from '@/scripts/stock-picks/export-utility-research'
import { TradingDayIndex } from '@/scripts/stock-picks/trading-days'
import type { StockDailyPriceRow } from '@/scripts/tli/prices/stock-daily-prices'

const SYMBOL = 'KOSPI:005930'
const DATES = ['2026-01-02', '2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09']
const buildRows = (): StockDailyPriceRow[] => DATES.map((trade_date) => ({
  symbol: SYMBOL, trade_date, open: 100, high: 105, low: 95, close: 100, volume: 1000, source: 'kis',
}))
const outcome = (rows = buildRows(), dates = DATES) => utilityResearchLabel(
  SYMBOL, DATES[0]!, buildPriceBook(rows), new TradingDayIndex(dates),
)

describe('utilityResearchLabel', () => {
  it('retains a normal training label without a null reason', () => {
    expect(outcome()).toMatchObject({
      label: { status: 'miss' }, labelNullReason: null, lockedLimitUpEntry: false, suspensionPath: false,
    })
  })

  it.each([1, 2, 3, 4, 5])('excludes and counts a zero-volume D%i without treating it as immature', (day) => {
    const rows = buildRows()
    rows[day] = { ...rows[day]!, open: 100, high: 100, low: 100, close: 100, volume: 0 }
    expect(outcome(rows)).toMatchObject({
      label: null, labelNullReason: 'suspendedOrUntradeable', suspensionPath: true, lockedLimitUpEntry: false,
    })
  })

  it('excludes and counts a locked-limit-up entry with traded volume', () => {
    const rows = buildRows()
    rows[1] = { ...rows[1]!, open: 130, high: 130, low: 130, close: 130 }
    expect(outcome(rows)).toMatchObject({
      label: null, labelNullReason: 'suspendedOrUntradeable', lockedLimitUpEntry: true, suspensionPath: false,
    })
  })

  it('distinguishes an unfinished window from observed suspensions in an unfinished window', () => {
    const rows = buildRows().slice(0, 3)
    const dates = DATES.slice(0, 3)
    expect(outcome(rows, dates)).toMatchObject({ label: null, labelNullReason: 'immature', suspensionPath: false })
    rows[2] = { ...rows[2]!, volume: 0 }
    expect(outcome(rows, dates)).toMatchObject({
      label: null, labelNullReason: 'suspendedOrUntradeable', suspensionPath: true,
    })
  })

  it.each([null, -1])('keeps invalid volume %j excluded as a data error', (volume) => {
    const rows = buildRows()
    rows[3] = { ...rows[3]!, volume }
    expect(outcome(rows)).toMatchObject({ label: null, labelNullReason: 'dataError', suspensionPath: false })
  })

  it('distinguishes missing price rows from immature windows and suspensions', () => {
    expect(outcome(buildRows().filter((_, i) => i !== 3))).toMatchObject({
      label: null, labelNullReason: 'dataError', suspensionPath: false,
    })
  })
})

describe('utility research master snapshots', () => {
  const dates = Array.from({ length: 80 }, (_, i) => new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10))
  const symbols = ['KOSPI:000010', 'KOSPI:000020', 'KOSDAQ:000030', 'KOSDAQ:000040']
  const master = symbols.slice(0, 3).map((symbol, i) => ({
    symbol, name: `Fixture${i}`, market: i < 2 ? 'KOSPI' : 'KOSDAQ', is_active: i < 2, status_flags: {},
  }))
  let directory: string
  let logSpy: ReturnType<typeof vi.spyOn>
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'utility-master-'))
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    await writeFile(join(directory, 'master.json'), JSON.stringify(master))
    await writeFile(join(directory, 'calendar.json'), JSON.stringify({ tradingDays: dates }))
    await writeFile(join(directory, 'prices.ndjson'), ['KOSPI', ...symbols].map((symbol, stockIndex) => JSON.stringify([
      symbol, dates.map((trade_date, i) => {
        const close = 3_000 + (stockIndex === 1 ? 2 : -2) * i + (i % 2 === 1 ? 10 : -10)
        return { symbol, trade_date, open: close - 5, close, high: close + 15, low: close - 15,
          volume: 1_000_000, source: 'kis' }
      }),
    ])).join('\n'))
  })
  afterEach(async () => { vi.restoreAllMocks(); await rm(directory, { recursive: true, force: true }) })

  const run = async (snapshotRows?: unknown) => {
    const output = join(directory, snapshotRows === undefined ? 'current' : 'snapshots')
    const args = ['--prices', join(directory, 'prices.ndjson'), '--master', join(directory, 'master.json'),
      '--calendar', join(directory, 'calendar.json'), '--from', dates.at(-4)!, '--output-dir', output]
    if (snapshotRows !== undefined) {
      const file = join(directory, 'master-snapshots.json')
      await writeFile(file, JSON.stringify(snapshotRows))
      args.push('--master-snapshots', file)
    }
    await exportUtilityResearch(args)
    const files = await Promise.all(['features.ndjson', 'feature-spec.json', 'calendar.json'].map(file => readFile(join(output, file), 'utf8')))
    const rows = files[0]!.trim().split('\n').map(line => JSON.parse(line))
    const summary = JSON.parse(String(logSpy.mock.calls.at(-1)![0]))
    return { files, rows, summary }
  }

  it('preserves the pre-snapshot export bytes and summary when the flag is absent', async () => {
    const { files, rows, summary } = await run()
    expect(rows).toHaveLength(8)
    expect(rows.every(row => !('masterSource' in row))).toBe(true)
    expect(summary).toEqual({ complete: true, eligible: 8, strict: 0, lockedLimitUpEntries: 0, suspensionPaths: 0,
      unknownReasons: { immature: 8, suspendedOrUntradeable: 0, dataError: 0 },
    })
    // SHA256 of the three unmodified origin/main exporter artifacts, in the order above.
    expect(createHash('sha256').update(files.join('')).digest('hex')).toBe('6add66a10586e18b53b512be20be0c771f5174a031d17b41715f843a9e763050')
  })

  it('uses snapshot status and membership on covered dates, and current masters and breadth elsewhere', async () => {
    const first = dates.at(-3)!
    const second = dates.at(-2)!
    const snapshotRow = (symbol: string, signal_date: string, is_active: boolean, status_flags = {}) => ({
      symbol, signal_date, name: 'Historical name', market: symbol.startsWith('KOSPI:') ? 'KOSPI' : 'KOSDAQ', is_active, status_flags,
    })
    const { rows, summary } = await run([
      snapshotRow(symbols[0]!, first, true, { market_warning_code: '02' }),
      snapshotRow(symbols[3]!, first, true),
      snapshotRow(symbols[0]!, second, false),
      snapshotRow(symbols[2]!, second, true),
      snapshotRow(symbols[3]!, second, true),
    ])
    const at = (date: string) => rows.filter(row => row.date === date)
    expect(at(first).map(row => row.symbol)).toEqual([symbols[3]])
    expect(at(second).map(row => row.symbol).sort()).toEqual([symbols[2], symbols[3]])
    for (const date of [dates.at(-4)!, dates.at(-1)!]) {
      expect(at(date).map(row => row.symbol)).toEqual(symbols.slice(0, 2))
      expect(at(date).every(row => row.masterSource === 'current' && row.originalInputs18[17] === 50)).toBe(true)
    }
    // Warning flags exclude candidates, while breadth retains all active masters as in production.
    expect(at(first).every(row => row.masterSource === 'snapshot' && row.originalInputs18[17] === 50)).toBe(true)
    expect(at(second).every(row => row.masterSource === 'snapshot' && row.originalInputs18[17] === 0)).toBe(true)
    expect(summary.masterSourceDates).toEqual({ snapshot: 2, current: 2 })
  })

  it('keeps empty snapshot files on the current-master fallback with identical feature values', async () => {
    const current = await run()
    const fallback = await run([])
    expect(fallback.rows.map(({ masterSource, ...row }) => {
      expect(masterSource).toBe('current')
      return `${JSON.stringify(row)}\n`
    }).join('')).toBe(current.files[0])
    expect(fallback.files.slice(1)).toEqual(current.files.slice(1))
    expect(fallback.summary).toEqual({ ...current.summary, masterSourceDates: { snapshot: 0, current: 4 } })
  })

  it('counts a covered all-inactive date even when it emits no candidates', async () => {
    const { rows, summary } = await run(master.map(row => ({ ...row, signal_date: dates.at(-1), is_active: false })))
    expect(rows.filter(row => row.date === dates.at(-1))).toEqual([])
    expect(summary.masterSourceDates).toEqual({ snapshot: 1, current: 3 })
  })

  it.each([{}, [{ ...master[0], signal_date: 'invalid' }]])('rejects malformed snapshot input: %j', async (input) => {
    await expect(run(input)).rejects.toThrow(/Invalid master snapshot/)
  })

  it('rejects duplicate signal-date/symbol keys', async () => {
    const row = { ...master[0], signal_date: dates.at(-1) }
    await expect(run([row, row])).rejects.toThrow('Duplicate master snapshot')
  })
})
