/** Live, read-only companion to prepare-newsletter.e2e.test.ts.
 * Uses current market providers + the full stored price universe, then checks the
 * selected symbols' seven finalized sessions against KIS through the real collector.
 * Does NOT refresh stock_master, persist prices/newsletters, call an LLM or send mail.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { config } from 'dotenv'
import type { StockDailyPriceInput } from '@/scripts/tli/prices/stock-daily-prices'

config({ path: '.env.local', quiet: true })
config({ path: '.env', quiet: true })

async function main() {
  const output = process.argv.find(arg => arg.startsWith('--output='))?.slice('--output='.length)
  if (!output) throw new Error('Usage: npm run prepare:check-live -- --output=output/prepare-live.json')
  // Install before importing any client. Even a forgotten write dependency cannot mutate DB.
  const originalFetch = globalThis.fetch
  let blockedWrites = 0
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    // Only KIS token issuance is allowed to POST; its optional storage write is blocked.
    const tokenIssue = url.hostname === 'openapi.koreainvestment.com' && url.pathname === '/oauth2/tokenP' && method === 'POST'
    if (!['GET', 'HEAD'].includes(method) && !tokenIssue) {
      blockedWrites++
      throw new Error(`Read-only live check blocked ${method} ${url.hostname}${url.pathname}`)
    }
    return originalFetch(input, init)
  }
  process.env.STOCK_PICKS_SNAPSHOT_PATH = ''
  const report: Record<string, unknown> = {
    startedAt: new Date().toISOString(),
    scope: 'live_market_full_stored_universe_and_selected_KIS_collection_read_only',
    exclusions: ['stock_master refresh', 'full-universe live KIS recollection', 'production DB writes', 'LLM narrative', 'email delivery'],
  }
  try {
    const { executeMarketAssessment } = await import('@/lib/llm/korea/gemini-pipeline')
    const assessment = await executeMarketAssessment()
    report.market = assessment
    if (assessment.verdict !== 'NORMAL') {
      report.status = 'crash_alert_no_stock_selection'
      return
    }
    const { generatePicksWithMeta, loadStockPickMasters, getExpectedSignalDate } = await import('@/scripts/stock-picks/generate-picks')
    const { getKSTDateString } = await import('@/lib/tli/date-utils')
    const { loadTradingDayIndex } = await import('@/scripts/stock-picks/trading-days')
    const { loadPriceBook } = await import('@/scripts/stock-picks/data-handler')
    const { hasValidResearchOhlc } = await import('@/scripts/stock-picks/data-contract')
    const { MIN_EXACT_DATE_COVERAGE_RATE } = await import('@/scripts/prepare-newsletter')
    const todayKst = getKSTDateString()
    const signalDate = getExpectedSignalDate(todayKst)
    const [tradingDays, masters] = await Promise.all([loadTradingDayIndex(), loadStockPickMasters()])
    const signalIndex = tradingDays.indexByDate.get(signalDate)
    if (signalIndex === undefined || signalIndex < 319) throw new Error(`Missing 320-session history through ${signalDate}`)
    const prices = await loadPriceBook({ startDate: tradingDays.tradingDays[signalIndex - 319], endDate: signalDate })
    const validRows = masters.filter(master => {
      const row = prices.get(master.symbol)?.get(signalDate)
      return row?.source === 'kis' && hasValidResearchOhlc(row)
    }).length
    const coverage = masters.length > 0 ? validRows / masters.length : 0
    report.storedUniverse = { signalDate, activeMasters: masters.length, validFreshRows: validRows, coverage,
      rows: [...prices.values()].reduce((sum, rows) => sum + rows.size, 0) }
    if (coverage < MIN_EXACT_DATE_COVERAGE_RATE) throw new Error(`Stored signal-day coverage insufficient: ${coverage}`)
    const generated = await generatePicksWithMeta({ todayKst, dependencies: {
      loadTradingDays: async () => tradingDays, loadPrices: async () => prices, loadMasters: async () => masters,
    } })
    report.generated = { picks: generated.picks, ...generated.meta, rankedCandidates: generated.meta.rankedCandidates.slice(0, 20) }

    const { collectDailyStockPrices } = await import('@/scripts/stock-picks/collect-daily')
    const { collectAndPersistStockDailyPriceRange } = await import('@/scripts/tli/prices/kis-daily-price-collector')
    const collected: StockDailyPriceInput[] = []
    const collection = await collectDailyStockPrices({ endDate: signalDate,
      collectPriceRange: options => collectAndPersistStockDailyPriceRange({ ...options,
        loadSymbols: async () => generated.picks.map(pick => pick.ticker),
        persistDailyPrices: async rows => { collected.push(...rows); return rows.length },
      }),
    })
    const fields = ['open', 'high', 'low', 'close', 'volume'] as const
    const differences = collected.flatMap(row => {
      const stored = prices.get(row.symbol)?.get(row.tradeDate)
      return fields.flatMap(field => stored?.[field] === row[field] ? [] : [{
        symbol: row.symbol, date: row.tradeDate, field, stored: stored?.[field] ?? null, live: row[field] ?? null,
      }])
    })
    report.selectedKisCollection = { ...collection, persistence: 'memory_only', differences }
    if (collection.successRate !== 1 || collection.exactDateCoverageRate !== 1 || collection.skippedForBudget !== 0) {
      throw new Error('Selected-symbol KIS collection incomplete')
    }
    if (differences.length > 0) throw new Error(`Live/stored OHLCV discrepancies: ${differences.length}`)
    report.status = 'passed'
  } catch (error) {
    report.status = 'failed'
    report.error = error instanceof Error ? error.message : String(error)
    process.exitCode = 1
  } finally {
    globalThis.fetch = originalFetch
    report.finishedAt = new Date().toISOString()
    report.blockedWriteAttempts = blockedWrites
    const path = resolve(output)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    console.log(JSON.stringify({ event: 'prepare_live_check', status: report.status, error: report.error,
      storedUniverse: report.storedUniverse, blockedWriteAttempts: blockedWrites, output: path }))
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1 })
