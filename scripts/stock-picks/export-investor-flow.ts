/**
 * v8 학습용 투자자 수급 입력 export. 운영과 같은 buildInvestorFlowInputs로 (신호일, 종목)마다 15개 값을 만든다.
 *
 * 1) 원천 수집(KIS FHPTJ04160001, 종목당 30거래일씩 과거로):
 *    npx tsx --env-file=.env.local scripts/stock-picks/export-investor-flow.ts collect \
 *      --symbols SYMBOLS.txt --from 20250115 --to 20261030 --output RAW.ndjson
 * 2) 학습 행 export:
 *    npx tsx scripts/stock-picks/export-investor-flow.ts export \
 *      --raw RAW.ndjson --calendar calendar.json --features features.ndjson --output investor-flow.ndjson
 */
import { appendFileSync, createReadStream, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline'

import {
  buildInvestorFlowInputs,
  INVESTOR_FLOW_WINDOW_TRADING_DAYS,
  parseInvestorFlowRows,
  type InvestorFlowDay,
} from '@/scripts/stock-picks/investor-flow'

const KEEP_FIELDS = ['stck_bsop_date', 'acml_tr_pbmn', 'frgn_ntby_tr_pbmn', 'orgn_ntby_tr_pbmn', 'prsn_ntby_tr_pbmn',
  'ivtr_ntby_tr_pbmn', 'fund_ntby_tr_pbmn', 'pe_fund_ntby_tr_pbmn'] as const

function arg(name: string): string {
  const index = process.argv.indexOf(`--${name}`)
  const value = index >= 0 ? process.argv[index + 1] : undefined
  if (!value) throw new Error(`--${name} 인자가 필요합니다`)
  return value
}

async function* lines(path: string): AsyncGenerator<string> {
  for await (const line of createInterface({ input: createReadStream(path), crlfDelay: Infinity })) {
    if (line.trim()) yield line
  }
}

async function collect(): Promise<void> {
  const { fetchInvestorTradeDailyRows } = await import('@/app/archive/_utils/api/kis/client')
  const output = arg('output'); const from = arg('from'); const to = arg('to')
  const done = new Set<string>()
  if (existsSync(output)) for await (const line of lines(output)) done.add((JSON.parse(line) as { s: string }).s)
  const symbols = readFileSync(arg('symbols'), 'utf8').split('\n').map((s) => s.trim()).filter((s) => s.includes(':') && !done.has(s))
  console.log(`collect todo=${symbols.length} done=${done.size}`)
  for (const [index, symbol] of symbols.entries()) {
    const rows: Record<string, string>[] = []
    let end = to
    while (end >= from) {
      let page: Record<string, string>[] | null = null
      for (let attempt = 0; attempt < 5 && !page; attempt++) {
        try {
          page = (await fetchInvestorTradeDailyRows(symbol, end)).filter((row) => /^\d{8}$/.test(row.stck_bsop_date ?? ''))
        } catch (error) {
          if (attempt === 4) throw error
          await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)))
        }
      }
      if (!page?.length) break
      rows.push(...page.map((row) => Object.fromEntries(KEEP_FIELDS.map((key) => [key, row[key] ?? '']))))
      const oldest = page.at(-1)!.stck_bsop_date!
      if (page.length < 30 || oldest <= from) break
      const previous = new Date(`${oldest.slice(0, 4)}-${oldest.slice(4, 6)}-${oldest.slice(6)}T00:00:00Z`)
      previous.setUTCDate(previous.getUTCDate() - 1)
      end = previous.toISOString().slice(0, 10).replaceAll('-', '')
    }
    appendFileSync(output, JSON.stringify({ s: symbol, rows }) + '\n')
    if ((index + 1) % 100 === 0) console.log(`collect ${index + 1}/${symbols.length}`)
  }
}

async function exportRows(): Promise<void> {
  const calendar = (JSON.parse(readFileSync(arg('calendar'), 'utf8')) as { tradingDays: string[] }).tradingDays
  const position = new Map(calendar.map((date, index) => [date, index]))
  const days = new Map<string, Map<string, InvestorFlowDay>>()
  for (const raw of arg('raw').split(',')) {
    for await (const line of lines(raw)) {
      const record = JSON.parse(line) as { s: string; rows: Record<string, string>[]; err?: string }
      if (record.err) throw new Error(`수집 실패 행은 학습에 쓸 수 없습니다: ${record.s}`)
      if (days.has(record.s)) throw new Error(`원천 종목 중복: ${record.s}`)
      days.set(record.s, parseInvestorFlowRows(record.rows))
    }
  }
  const output = arg('output')
  writeFileSync(output, '')
  let buffer: string[] = []; let rows = 0; let covered = 0
  const empty = new Map<string, InvestorFlowDay>()
  for await (const line of lines(arg('features'))) {
    const { date, symbol } = JSON.parse(line) as { date: string; symbol: string }
    const end = position.get(date)
    if (end === undefined) throw new Error(`캘린더에 없는 신호일: ${date}`)
    const window = calendar.slice(Math.max(0, end - INVESTOR_FLOW_WINDOW_TRADING_DAYS + 1), end + 1)
    const symbolDays = days.get(symbol) ?? empty
    if (symbolDays.has(date)) covered++
    buffer.push(JSON.stringify({ date, symbol, inputs: buildInvestorFlowInputs({ days: symbolDays, dates: window }) }))
    rows++
    if (buffer.length >= 10_000) { appendFileSync(output, buffer.join('\n') + '\n'); buffer = [] }
  }
  if (buffer.length) appendFileSync(output, buffer.join('\n') + '\n')
  console.log(`export rows=${rows} signalDateCoverage=${(covered / rows).toFixed(4)} symbols=${days.size}`)
}

const command = process.argv[2]
;(command === 'collect' ? collect() : command === 'export' ? exportRows() : Promise.reject(new Error('collect|export')))
  .catch((error) => { console.error(error); process.exit(1) })
