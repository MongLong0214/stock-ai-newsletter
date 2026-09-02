import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import { labelPick } from '@/scripts/stock-picks/label'
import { validateResearchDataset } from '@/scripts/stock-picks/data-contract'
import { loadPriceBook, type PriceBook } from '@/scripts/stock-picks/data-handler'
import type { StockFeatureVector } from '@/scripts/stock-picks/features'
import { precomputeFeatureMap } from '@/scripts/stock-picks/optimize'
import { loadStockMasterStates } from '@/scripts/stock-picks/strategies'
import { TradingDayIndex, loadTradingDayIndex } from '@/scripts/stock-picks/trading-days'

const FEATURE_WARMUP_DAYS = 320
const LABEL_LOOKAHEAD_DAYS = 5
const LOOKBACK_CALENDAR_YEARS = 2
const MIN_TURNOVER = 500_000_000

export const PRECURSOR_FEATURES = [
  'open',
  'high',
  'low',
  'close',
  'volume',
  'averageTurnover20',
  'rsi14',
  'macdHistogram',
  'sma20',
  'sma60',
  'ema20',
  'sma20Slope5',
  'sma20DistancePercent',
  'atrPercent14',
  'adx14',
  'adx14Previous',
  'adx14Change',
  'obvSlope20',
  'volumeRatio20',
  'volumePercentile60',
  'position52w',
  'position52wObservations',
  'position52wFullWindow',
  'consecutiveUpDays',
  'trendR2_20',
  'trendSlope20',
  'trendR2_20Previous',
  'trendR2_20Change',
  'trendR2_60',
  'trendSlope60',
  'distanceFromHigh60',
  'gapFromPreviousClosePercent',
  'goldenCrossAge',
  'bullishCandle',
] as const satisfies readonly (keyof StockFeatureVector)[]

type PrecursorFeature = (typeof PRECURSOR_FEATURES)[number]

export interface PrecursorFeatureRankingRow {
  readonly rank: number
  readonly feature: PrecursorFeature
  readonly eventPreviousDayMedian: number | null
  readonly ordinaryDayMedian: number | null
  readonly separation: number | null
  readonly direction: 'higher_before_event' | 'lower_before_event' | 'neutral' | 'insufficient_data'
  readonly eventSampleCount: number
  readonly ordinarySampleCount: number
}

export interface PrecursorMiningReport {
  readonly generatedAt: string
  readonly policy: {
    readonly lookbackCalendarYears: 2
    readonly event: 'next_open_to_5_holding_day_high_plus_10_percent_touch'
    readonly eligibility: 'average_turnover_20_only'
    readonly minimumAverageTurnover20: number
    readonly featureTimestamp: 'signal_day_only'
    readonly ordinaryComparison: 'non_event_eligible_days_from_event_symbols'
    readonly separation: 'event_share_strictly_above_ordinary_median'
    readonly ranking: 'separation_descending'
  }
  readonly dateRange: {
    readonly signalStart: string
    readonly signalEnd: string
    readonly signalTradingDays: number
  }
  readonly samples: {
    readonly eligibleLabeledSignalDays: number
    readonly eventSignalDays: number
    readonly ordinarySignalDays: number
    readonly eventSymbols: number
  }
  readonly featureRanking: readonly PrecursorFeatureRankingRow[]
  readonly caveats: {
    readonly exploratoryOnly: string
    readonly universe: string
  }
}

interface LabeledFeature {
  readonly feature: StockFeatureVector
  readonly event: boolean
}

const median = (values: readonly number[]): number | null => {
  if (values.length === 0) return null
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2
}

const numericFeatureValue = (
  feature: StockFeatureVector,
  key: PrecursorFeature,
): number | null => {
  const value: unknown = feature[key]
  if (typeof value === 'boolean') return value ? 1 : 0
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

const rankFeatures = (
  eventRows: readonly LabeledFeature[],
  ordinaryRows: readonly LabeledFeature[],
): PrecursorFeatureRankingRow[] => {
  const unranked = PRECURSOR_FEATURES.map((feature) => {
    const eventValues = eventRows.flatMap((row) => {
      const value = numericFeatureValue(row.feature, feature)
      return value === null ? [] : [value]
    })
    const ordinaryValues = ordinaryRows.flatMap((row) => {
      const value = numericFeatureValue(row.feature, feature)
      return value === null ? [] : [value]
    })
    const ordinaryDayMedian = median(ordinaryValues)
    const separation = ordinaryDayMedian === null || eventValues.length === 0
      ? null
      : eventValues.filter((value) => value > ordinaryDayMedian).length / eventValues.length
    const direction = separation === null
      ? 'insufficient_data' as const
      : separation > 0.5
        ? 'higher_before_event' as const
        : separation < 0.5
          ? 'lower_before_event' as const
          : 'neutral' as const
    return {
      feature,
      eventPreviousDayMedian: median(eventValues),
      ordinaryDayMedian,
      separation,
      direction,
      eventSampleCount: eventValues.length,
      ordinarySampleCount: ordinaryValues.length,
    }
  }).sort((left, right) => (
    (right.separation ?? -1) - (left.separation ?? -1)
    || left.feature.localeCompare(right.feature)
  ))

  return unranked.map((row, index) => ({ rank: index + 1, ...row }))
}

export function minePrecursors(input: {
  readonly prices: PriceBook
  readonly tradingDays: TradingDayIndex
  readonly featuresByDate: ReadonlyMap<string, readonly StockFeatureVector[]>
  readonly signalDates: readonly string[]
  readonly minTurnover?: number
  readonly generatedAt?: string
}): PrecursorMiningReport {
  const signalDates = [...new Set(input.signalDates.filter(Boolean))].sort()
  const signalStart = signalDates[0]
  const signalEnd = signalDates.at(-1)
  if (!signalStart || !signalEnd) throw new Error('이벤트 채굴 신호일이 없습니다')
  const minTurnover = input.minTurnover ?? MIN_TURNOVER
  const labeledRows: LabeledFeature[] = []

  for (const signalDate of signalDates) {
    for (const feature of input.featuresByDate.get(signalDate) ?? []) {
      if (feature.averageTurnover20 === null || feature.averageTurnover20 < minTurnover) continue
      const label = labelPick(feature.symbol, signalDate, input.prices, input.tradingDays)
      if (!label) continue
      labeledRows.push({ feature, event: label.touched })
    }
  }

  const eventRows = labeledRows.filter((row) => row.event)
  const eventSymbols = new Set(eventRows.map((row) => row.feature.symbol))
  const ordinaryRows = labeledRows.filter((row) => (
    !row.event && eventSymbols.has(row.feature.symbol)
  ))

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    policy: {
      lookbackCalendarYears: LOOKBACK_CALENDAR_YEARS,
      event: 'next_open_to_5_holding_day_high_plus_10_percent_touch',
      eligibility: 'average_turnover_20_only',
      minimumAverageTurnover20: minTurnover,
      featureTimestamp: 'signal_day_only',
      ordinaryComparison: 'non_event_eligible_days_from_event_symbols',
      separation: 'event_share_strictly_above_ordinary_median',
      ranking: 'separation_descending',
    },
    dateRange: {
      signalStart,
      signalEnd,
      signalTradingDays: signalDates.length,
    },
    samples: {
      eligibleLabeledSignalDays: labeledRows.length,
      eventSignalDays: eventRows.length,
      ordinarySignalDays: ordinaryRows.length,
      eventSymbols: eventSymbols.size,
    },
    featureRanking: rankFeatures(eventRows, ordinaryRows),
    caveats: {
      exploratoryOnly: 'This reverse-mining output is exploratory and must not be promoted from these same outcomes without a new frozen walk-forward OOS test.',
      universe: 'Symbols come from current stock_master rows; missing historical or delisted symbols can create survivorship bias.',
    },
  }
}

const twoYearsBefore = (date: string): string => {
  const [year, month, day] = date.split('-').map(Number)
  const targetYear = year - LOOKBACK_CALENDAR_YEARS
  const lastDay = new Date(Date.UTC(targetYear, month, 0)).getUTCDate()
  const shifted = new Date(Date.UTC(targetYear, month - 1, Math.min(day, lastDay)))
  return shifted.toISOString().slice(0, 10)
}

const readOption = (args: readonly string[], name: string): string | undefined => {
  const inline = args.find((arg) => arg.startsWith(`${name}=`))
  if (inline) return inline.slice(name.length + 1)
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}

const printUsage = (): void => {
  console.log([
    'Usage: npx tsx scripts/stock-picks/mine-precursors.ts --out <path.json>',
    '',
    'Options:',
    '  --out PATH   최근 2년 이벤트 전일 피처 랭킹 JSON 경로 (필수)',
    '  --allow-dirty-data  누락 거래일/OHLC 오류가 있어도 채굴을 계속',
  ].join('\n'))
}

async function runCli(args: readonly string[]): Promise<void> {
  const out = readOption(args, '--out')
  if (!out) throw new Error('--out <path.json>이 필요합니다')

  const [tradingDays, masters] = await Promise.all([loadTradingDayIndex(), loadStockMasterStates()])
  const maturedDates = tradingDays.tradingDays.slice(0, -LABEL_LOOKAHEAD_DAYS)
  const signalEnd = maturedDates.at(-1)
  if (!signalEnd) throw new Error('5보유일 라벨이 성숙한 거래일이 없습니다')
  const signalDates = maturedDates.filter((date) => date >= twoYearsBefore(signalEnd))
  const signalStart = signalDates[0]
  if (!signalStart) throw new Error('최근 2년 신호일이 없습니다')
  const signalStartIndex = tradingDays.indexByDate.get(signalStart)!
  const historyStartIndex = Math.max(0, signalStartIndex - FEATURE_WARMUP_DAYS)
  const historyDates = tradingDays.tradingDays.slice(historyStartIndex, signalStartIndex + signalDates.length)
  const prices = await loadPriceBook({
    startDate: historyDates[0],
    endDate: tradingDays.lastDate ?? signalEnd,
  })
  const dataContract = validateResearchDataset({
    tradingDays,
    prices,
    fromDate: historyDates[0] ?? signalStart,
    toDate: tradingDays.lastDate ?? signalEnd,
  })
  console.log(JSON.stringify({ event: 'research_data_contract', ...dataContract }))
  if (
    !args.includes('--allow-dirty-data')
    && !dataContract.ok
  ) {
    throw new Error(
      '연구 데이터 계약 실패:'
      + ` sparseDates=${JSON.stringify(dataContract.sparseDates)}`
      + ` gapDatesTop=${JSON.stringify(dataContract.gapDatesTop)};`
      + ' --allow-dirty-data 없이는 precursor 채굴을 실행하지 않습니다',
    )
  }

  console.log(`이벤트 전일 피처 사전계산: symbols=${masters.length} signalDays=${signalDates.length}`)
  const featuresByDate = precomputeFeatureMap({
    prices,
    tradingDays,
    masters,
    historyDates,
    evaluationStart: signalStart,
    onProgress: (completed, total) => {
      if (completed % 100 === 0 || completed === total) console.log(`피처 ${completed}/${total}`)
    },
  })
  const report = minePrecursors({ prices, tradingDays, featuresByDate, signalDates })
  const outputPath = resolve(process.cwd(), out)
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

  console.log(JSON.stringify({ outputPath, dateRange: report.dateRange, samples: report.samples }, null, 2))
  console.table(report.featureRanking.map((row) => ({
    rank: row.rank,
    feature: row.feature,
    eventMedian: row.eventPreviousDayMedian,
    ordinaryMedian: row.ordinaryDayMedian,
    separation: row.separation,
    direction: row.direction,
    eventN: row.eventSampleCount,
    ordinaryN: row.ordinarySampleCount,
  })))
}

const isDirectRun = /mine-precursors\.(?:ts|js)$/.test(process.argv[1] ?? '')
if (isDirectRun) {
  const args = process.argv.slice(2)
  if (args.includes('--help') || args.includes('-h')) printUsage()
  else runCli(args).catch((error: unknown) => {
    console.error(
      error instanceof Error
        ? error.stack ?? error.message
        : JSON.stringify(error, Object.getOwnPropertyNames(error ?? {})),
    )
    process.exitCode = 1
  })
}
