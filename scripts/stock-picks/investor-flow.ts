import { INVESTOR_FLOW_INPUT_NAMES } from '@/scripts/stock-picks/observed-inputs'

type Value = number | null

/** 하루치 투자자별 순매수 금액(원)과 거래대금(원). 비어 있는 필드는 null이다. */
export interface InvestorFlowDay {
  readonly foreign: Value
  readonly institution: Value
  readonly individual: Value
  readonly investmentTrust: Value
  readonly pension: Value
  readonly privateFund: Value
  readonly tradedValue: Value
}

/** 연구 원천(2024-12~)과 같은 30거래일 창. 연속 순매수 일수는 ±20에서 자르므로 20일 이상이면 전체 이력과 같다. */
export const INVESTOR_FLOW_WINDOW_TRADING_DAYS = 30
/** 후보 풀에서 신호일 수급이 있어야 하는 최소 비율. 연구 평가 구간 커버리지는 99.5%였다. */
export const MIN_INVESTOR_FLOW_COVERAGE = 0.95

/** KIS 실계좌 한도(초당 20건)보다 낮게 둔다. 연구 수집은 합계 초당 약 5건에서 오류 0건이었다. */
export const INVESTOR_FLOW_REQUESTS_PER_SECOND = 8

const MILLION_WON = 1_000_000
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

function parseAmount(value: unknown, scale: number): Value {
  if (typeof value !== 'string' || value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed * scale : null
}

/** KIS FHPTJ04160001 output2 행을 거래일(YYYY-MM-DD)별로 정리한다. 순매수 금액은 백만원 단위다. */
export function parseInvestorFlowRows(rows: readonly Record<string, string>[]): Map<string, InvestorFlowDay> {
  const days = new Map<string, InvestorFlowDay>()
  for (const row of rows) {
    const raw = row.stck_bsop_date
    if (typeof raw !== 'string' || !/^\d{8}$/.test(raw)) continue
    const date = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6)}`
    if (days.has(date)) throw new Error(`투자자 매매동향 중복 거래일: ${date}`)
    days.set(date, {
      foreign: parseAmount(row.frgn_ntby_tr_pbmn, MILLION_WON),
      institution: parseAmount(row.orgn_ntby_tr_pbmn, MILLION_WON),
      individual: parseAmount(row.prsn_ntby_tr_pbmn, MILLION_WON),
      investmentTrust: parseAmount(row.ivtr_ntby_tr_pbmn, MILLION_WON),
      pension: parseAmount(row.fund_ntby_tr_pbmn, MILLION_WON),
      privateFund: parseAmount(row.pe_fund_ntby_tr_pbmn, MILLION_WON),
      tradedValue: parseAmount(row.acml_tr_pbmn, 1),
    })
  }
  return days
}

/**
 * 연구(PREREG addendum 5)와 같은 15개 수급 입력. dates는 신호일로 끝나는 KOSPI 거래일 창이다.
 * 창 안 하루라도 비면 해당 합계는 결측이고, 연속 일수는 결측일에서 0으로 다시 센다.
 */
export function buildInvestorFlowInputs(input: {
  readonly days: ReadonlyMap<string, InvestorFlowDay>
  readonly dates: readonly string[]
}): readonly Value[] {
  const dates = input.dates.slice(-INVESTOR_FLOW_WINDOW_TRADING_DAYS)
  if (dates.some((date, i) => i > 0 && date <= dates[i - 1]!)) throw new Error('투자자 매매동향 거래일 순서 오류')
  const series = (key: keyof InvestorFlowDay): Value[] => dates.map((date) => {
    const value = input.days.get(date)?.[key] ?? null
    if (key === 'tradedValue') return finite(value) && value > 0 ? value : null
    return finite(value) ? value : null
  })
  const total = (values: readonly Value[], n: number): Value => {
    if (values.length < n) return null
    const window = values.slice(-n)
    return window.every(finite) ? (window as number[]).reduce((a, b) => a + b, 0) : null
  }
  const traded = series('tradedValue')
  const ratio = (key: keyof InvestorFlowDay, n: number): Value => {
    const net = total(series(key), n)
    const value = total(traded, n)
    return net === null || value === null ? null : net / value
  }
  const streak = (key: keyof InvestorFlowDay): Value => {
    let current = 0
    let last: Value = null
    for (const value of series(key)) {
      if (value === null) { current = 0; last = null; continue }
      const sign = Math.sign(value)
      current = Math.sign(current) === sign && sign !== 0 ? current + sign : sign
      current = Math.max(-20, Math.min(20, current))
      last = current
    }
    return last
  }
  const foreign5 = ratio('foreign', 5)
  const foreign20 = ratio('foreign', 20)
  const institution5 = ratio('institution', 5)
  const values: Value[] = [
    ratio('foreign', 1), foreign5, foreign20,
    ratio('institution', 1), institution5, ratio('institution', 20),
    ratio('individual', 5), ratio('individual', 20),
    ratio('investmentTrust', 5), ratio('pension', 5), ratio('privateFund', 5),
    streak('foreign'), streak('institution'),
    foreign5 === null || institution5 === null ? null : Number(foreign5 > 0 && institution5 > 0),
    foreign5 === null || foreign20 === null ? null : foreign5 - foreign20,
  ]
  if (values.length !== INVESTOR_FLOW_INPUT_NAMES.length) throw new Error('투자자 수급 입력 개수 불일치')
  return values
}

export type FetchInvestorFlowRows = (symbol: string, endKisDate: string) => Promise<Record<string, string>[]>

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * 후보 풀 종목의 신호일 수급 입력을 KIS에서 바로 계산한다. 종목당 1회 호출(30거래일)로 연구 입력과 같다.
 * 일시 오류는 종목별로 재시도하고, 신호일 행 커버리지가 기준 미만이면 추천을 중단한다.
 */
export async function loadInvestorFlowInputs(input: {
  readonly symbols: readonly string[]
  readonly signalDate: string
  readonly dates: readonly string[]
  readonly fetchRows?: FetchInvestorFlowRows
  readonly concurrency?: number
  readonly requestsPerSecond?: number
  readonly retries?: number
}): Promise<Map<string, readonly Value[]>> {
  const { symbols, signalDate } = input
  if (input.dates.at(-1) !== signalDate) throw new Error('투자자 매매동향 기준일 불일치')
  const fetchRows = input.fetchRows ?? (async (symbol: string, endKisDate: string) => {
    const { fetchInvestorTradeDailyRows } = await import('@/app/archive/_utils/api/kis/client')
    return fetchInvestorTradeDailyRows(symbol, endKisDate)
  })
  const concurrency = input.concurrency ?? 4
  const interval = 1000 / (input.requestsPerSecond ?? INVESTOR_FLOW_REQUESTS_PER_SECOND)
  const retries = input.retries ?? 3
  const endKisDate = signalDate.replaceAll('-', '')
  let nextSlot = 0
  // 벽시계가 아닌 단조 시계로 간격을 둔다(시계 보정·테스트의 Date 고정과 무관).
  const throttle = async () => {
    const now = performance.now()
    const slot = Math.max(now, nextSlot)
    nextSlot = slot + interval
    if (slot > now) await sleep(slot - now)
  }
  const results = new Map<string, readonly Value[]>()
  let covered = 0
  const failures: string[] = []
  let cursor = 0
  const worker = async () => {
    while (cursor < symbols.length) {
      const symbol = symbols[cursor++]!
      let days: Map<string, InvestorFlowDay> | null = null
      for (let attempt = 0; attempt <= retries && !days; attempt++) {
        try {
          await throttle()
          days = parseInvestorFlowRows(await fetchRows(symbol, endKisDate))
        } catch (error) {
          if (attempt === retries) failures.push(`${symbol}: ${error instanceof Error ? error.message : String(error)}`)
          else await sleep(500 * 2 ** attempt)
        }
      }
      const resolved = days ?? new Map<string, InvestorFlowDay>()
      if (resolved.has(signalDate)) covered++
      results.set(symbol, buildInvestorFlowInputs({ days: resolved, dates: input.dates }))
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, symbols.length) }, worker))
  const coverage = symbols.length ? covered / symbols.length : 1
  console.log(JSON.stringify({ event: 'stock_picks_investor_flow', signalDate, symbols: symbols.length, covered,
    coverage: Number(coverage.toFixed(4)), failures: failures.length }))
  if (failures.length) console.warn(`⚠️ 투자자 수급 조회 실패 예시: ${failures.slice(0, 3).join(' | ')}`)
  if (coverage < MIN_INVESTOR_FLOW_COVERAGE) {
    throw new Error(`투자자 수급 커버리지 부족: ${covered}/${symbols.length} < ${MIN_INVESTOR_FLOW_COVERAGE * 100}%`)
  }
  return results
}
