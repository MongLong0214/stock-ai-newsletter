import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import { createRandom3Strategy } from '@/scripts/stock-picks/backtest'
import { StockDataHandler, loadPriceBook, type PriceBook } from '@/scripts/stock-picks/data-handler'
import { labelPick, type StockPickLabel } from '@/scripts/stock-picks/label'
import { TradingDayIndex, loadTradingDayIndex } from '@/scripts/stock-picks/trading-days'

const ARCHIVES_PATH = 'app/archive/_archive-data/archives.json'
const RANDOM_BASELINE_REPETITIONS = 100
const RANDOM_BASELINE_SEED = 42

interface ArchivePick {
  readonly signalDate: string
  readonly ticker: string
  readonly archiveName: string
}

interface StockMasterRow {
  readonly symbol: string
  readonly name: string
  readonly is_active: boolean
}

interface EvaluatedArchivePick extends ArchivePick {
  readonly mappedSymbol: string | null
  readonly masterName: string | null
  readonly label: StockPickLabel | null
}

interface MappingIssueGroup {
  readonly ticker: string
  readonly archiveName: string
  readonly masterName: string | null
  readonly count: number
  readonly dates: readonly string[]
}

export interface ArchiveEvaluationReport {
  readonly archivePath: string
  readonly archivePickCount: number
  readonly mappedPickCount: number
  readonly missingMappingCount: number
  readonly nameMismatchCount: number
  readonly labeledPickCount: number
  readonly nullPickCount: number
  readonly touchedPickCount: number
  readonly precisionAt3: number | null
  readonly nullRate: number
  readonly randomBaseline: {
    readonly repetitions: 100
    readonly meanPrecisionAt3: number | null
    readonly meanNullRate: number | null
  }
  readonly lift: number | null
  readonly missingMappings: readonly MappingIssueGroup[]
  readonly nameMismatches: readonly MappingIssueGroup[]
  readonly picks: readonly EvaluatedArchivePick[]
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
)

export async function loadArchivePicks(path = ARCHIVES_PATH): Promise<ArchivePick[]> {
  const archivePath = resolve(process.cwd(), path)
  const parsed: unknown = JSON.parse(await readFile(archivePath, 'utf8'))
  if (!isRecord(parsed) || !Array.isArray(parsed.newsletters)) {
    throw new Error(`아카이브 형식이 올바르지 않습니다: ${archivePath}`)
  }

  const picks: ArchivePick[] = []
  for (const newsletter of parsed.newsletters) {
    if (!isRecord(newsletter) || newsletter.type !== 'stock') continue
    if (typeof newsletter.date !== 'string' || !Array.isArray(newsletter.stocks)) {
      throw new Error('주식 아카이브의 date 또는 stocks 형식이 올바르지 않습니다')
    }
    for (const stock of newsletter.stocks) {
      if (!isRecord(stock) || typeof stock.ticker !== 'string' || typeof stock.name !== 'string') {
        throw new Error(`주식 아카이브 픽 형식이 올바르지 않습니다: ${newsletter.date}`)
      }
      picks.push({
        signalDate: newsletter.date,
        ticker: stock.ticker,
        archiveName: stock.name,
      })
    }
  }
  return picks
}

async function loadStockMasterRows(): Promise<StockMasterRow[]> {
  const { fetchAllRows } = await import('@/lib/supabase/paginate')
  const { supabaseAdmin } = await import('@/scripts/tli/shared/supabase-admin')
  return fetchAllRows<StockMasterRow>((from, to) => supabaseAdmin
    .from('stock_master')
    .select('symbol, name, is_active')
    .order('symbol', { ascending: true })
    .range(from, to))
}

const groupMappingIssues = (
  picks: readonly EvaluatedArchivePick[],
  predicate: (pick: EvaluatedArchivePick) => boolean,
): MappingIssueGroup[] => {
  const groups = new Map<string, {
    ticker: string
    archiveName: string
    masterName: string | null
    dates: Set<string>
    count: number
  }>()

  for (const pick of picks) {
    if (!predicate(pick)) continue
    const key = `${pick.ticker}\u0000${pick.archiveName}\u0000${pick.masterName ?? ''}`
    const group = groups.get(key) ?? {
      ticker: pick.ticker,
      archiveName: pick.archiveName,
      masterName: pick.masterName,
      dates: new Set<string>(),
      count: 0,
    }
    group.count++
    group.dates.add(pick.signalDate)
    groups.set(key, group)
  }

  return [...groups.values()]
    .map((group) => ({ ...group, dates: [...group.dates].sort() }))
    .sort((left, right) => right.count - left.count || left.ticker.localeCompare(right.ticker))
}

const mean = (values: readonly number[]): number | null => (
  values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null
)

function evaluateRandomBaseline(input: {
  readonly signalDates: readonly string[]
  readonly universe: readonly string[]
  readonly prices: PriceBook
  readonly tradingDays: TradingDayIndex
}): { meanPrecisionAt3: number | null; meanNullRate: number | null } {
  const dataHandler = new StockDataHandler(input.prices, input.tradingDays)
  const precisions: number[] = []
  const nullRates: number[] = []

  for (let repetition = 0; repetition < RANDOM_BASELINE_REPETITIONS; repetition++) {
    const strategy = createRandom3Strategy(RANDOM_BASELINE_SEED + repetition)
    let total = 0
    let labeled = 0
    let touched = 0

    for (const signalDate of input.signalDates) {
      const symbols = strategy(dataHandler.at(signalDate), input.universe, signalDate)
      for (const symbol of symbols) {
        total++
        const label = labelPick(symbol, signalDate, input.prices, input.tradingDays)
        if (!label) continue
        labeled++
        if (label.touched) touched++
      }
    }

    if (labeled > 0) precisions.push(touched / labeled)
    nullRates.push(total > 0 ? (total - labeled) / total : 0)
  }

  return {
    meanPrecisionAt3: mean(precisions),
    meanNullRate: mean(nullRates),
  }
}

export function evaluateArchivePicks(input: {
  readonly archivePath?: string
  readonly archivePicks: readonly ArchivePick[]
  readonly stockMasterRows: readonly StockMasterRow[]
  readonly prices: PriceBook
  readonly tradingDays: TradingDayIndex
}): ArchiveEvaluationReport {
  const masterBySymbol = new Map(input.stockMasterRows.map((row) => [row.symbol, row]))
  const picks: EvaluatedArchivePick[] = input.archivePicks.map((archivePick) => {
    const master = masterBySymbol.get(archivePick.ticker)
    return {
      ...archivePick,
      mappedSymbol: master?.symbol ?? null,
      masterName: master?.name ?? null,
      label: master
        ? labelPick(master.symbol, archivePick.signalDate, input.prices, input.tradingDays)
        : null,
    }
  })

  const labels = picks.flatMap((pick) => pick.label ? [pick.label] : [])
  const touchedPickCount = labels.filter((label) => label.touched).length
  const missingMappings = groupMappingIssues(picks, (pick) => pick.mappedSymbol === null)
  const nameMismatches = groupMappingIssues(
    picks,
    (pick) => pick.masterName !== null && pick.archiveName !== pick.masterName,
  )
  const baseline = evaluateRandomBaseline({
    signalDates: [...new Set(input.archivePicks.map((pick) => pick.signalDate))].sort(),
    universe: input.stockMasterRows.filter((row) => row.is_active).map((row) => row.symbol),
    prices: input.prices,
    tradingDays: input.tradingDays,
  })
  const precisionAt3 = labels.length > 0 ? touchedPickCount / labels.length : null

  return {
    archivePath: input.archivePath ?? ARCHIVES_PATH,
    archivePickCount: picks.length,
    mappedPickCount: picks.filter((pick) => pick.mappedSymbol !== null).length,
    missingMappingCount: picks.filter((pick) => pick.mappedSymbol === null).length,
    nameMismatchCount: picks.filter((pick) => pick.masterName !== null && pick.archiveName !== pick.masterName).length,
    labeledPickCount: labels.length,
    nullPickCount: picks.length - labels.length,
    touchedPickCount,
    precisionAt3,
    nullRate: picks.length > 0 ? (picks.length - labels.length) / picks.length : 0,
    randomBaseline: {
      repetitions: RANDOM_BASELINE_REPETITIONS,
      ...baseline,
    },
    lift: precisionAt3 !== null && baseline.meanPrecisionAt3 !== null
      ? precisionAt3 - baseline.meanPrecisionAt3
      : null,
    missingMappings,
    nameMismatches,
    picks,
  }
}

function printArchiveEvaluation(report: ArchiveEvaluationReport): void {
  console.log(JSON.stringify({
    archivePath: report.archivePath,
    archivePickCount: report.archivePickCount,
    mappedPickCount: report.mappedPickCount,
    missingMappingCount: report.missingMappingCount,
    nameMismatchCount: report.nameMismatchCount,
    labeledPickCount: report.labeledPickCount,
    nullPickCount: report.nullPickCount,
    touchedPickCount: report.touchedPickCount,
    precisionAt3: report.precisionAt3,
    nullRate: report.nullRate,
    randomBaseline: report.randomBaseline,
    lift: report.lift,
  }, null, 2))
  if (report.missingMappings.length > 0) {
    console.log('ticker→stock_master 매핑 실패')
    console.table(report.missingMappings)
  }
  if (report.nameMismatches.length > 0) {
    console.log('아카이브 회사명 불일치 (원본 미교정)')
    console.table(report.nameMismatches)
  }
}

const readOption = (args: readonly string[], name: string): string | undefined => (
  args.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1)
)

const printUsage = (): void => {
  console.log([
    'Usage: npx tsx scripts/stock-picks/evaluate-archives.ts',
    '',
    'Options:',
    `  --archive=PATH   아카이브 JSON 경로 (기본 ${ARCHIVES_PATH})`,
    '  --scratch=PATH   전체 JSON 결과를 저장할 scratch 파일 경로',
    '',
    '백필 완료 후 실행. 이 스크립트는 stock_daily_prices와 stock_master를 읽기만 합니다.',
  ].join('\n'))
}

const isDirectRun = /evaluate-archives\.(?:ts|js)$/.test(process.argv[1] ?? '')
if (isDirectRun) {
  const args = process.argv.slice(2)
  if (args.includes('--help') || args.includes('-h')) {
    printUsage()
  } else {
    const archivePath = readOption(args, '--archive') ?? ARCHIVES_PATH
    Promise.all([loadArchivePicks(archivePath), loadStockMasterRows(), loadTradingDayIndex()])
      .then(async ([archivePicks, stockMasterRows, tradingDays]) => {
        const firstSignalDate = archivePicks.map((pick) => pick.signalDate).sort()[0]
        const prices = await loadPriceBook({
          startDate: firstSignalDate,
          endDate: tradingDays.lastDate ?? undefined,
        })
        const report = evaluateArchivePicks({
          archivePath,
          archivePicks,
          stockMasterRows,
          prices,
          tradingDays,
        })
        printArchiveEvaluation(report)

        const scratchPath = readOption(args, '--scratch')
        if (scratchPath) {
          await mkdir(dirname(scratchPath), { recursive: true })
          await writeFile(scratchPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
        }
      })
      .catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : String(error))
        process.exit(1)
      })
  }
}
