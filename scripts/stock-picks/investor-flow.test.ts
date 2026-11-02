import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'

import parity from '@/scripts/stock-picks/fixtures/investor-flow-parity.json'
import {
  buildInvestorFlowInputs,
  loadInvestorFlowInputs,
  parseInvestorFlowRows,
  type InvestorFlowDay,
} from '@/scripts/stock-picks/investor-flow'
import { INVESTOR_FLOW_INPUT_NAMES } from '@/scripts/stock-picks/observed-inputs'

const kisRow = (date: string, foreign: number, institution = 0, traded = 1_000_000_000): Record<string, string> => ({
  stck_bsop_date: date.replaceAll('-', ''), acml_tr_pbmn: String(traded),
  frgn_ntby_tr_pbmn: String(foreign), orgn_ntby_tr_pbmn: String(institution), prsn_ntby_tr_pbmn: String(-foreign - institution),
  ivtr_ntby_tr_pbmn: '1', fund_ntby_tr_pbmn: '2', pe_fund_ntby_tr_pbmn: '',
})
const tradingDates = (count: number): string[] => Array.from({ length: count }, (_, i) => {
  const date = new Date(Date.UTC(2026, 8, 1 + i))
  return date.toISOString().slice(0, 10)
})
const byName = (values: readonly (number | null)[]) => Object.fromEntries(INVESTOR_FLOW_INPUT_NAMES.map((name, i) => [name, values[i]]))

describe('parseInvestorFlowRows', () => {
  it('converts million-won net buys to won and keeps empty fields missing', () => {
    const day = parseInvestorFlowRows([kisRow('2026-10-30', 519, -3)]).get('2026-10-30')!
    expect(day).toEqual({ foreign: 519_000_000, institution: -3_000_000, individual: -516_000_000,
      investmentTrust: 1_000_000, pension: 2_000_000, privateFund: null, tradedValue: 1_000_000_000 })
  })

  it('rejects duplicate trading days and ignores rows without a date', () => {
    expect(parseInvestorFlowRows([{ stck_bsop_date: '' }]).size).toBe(0)
    expect(() => parseInvestorFlowRows([kisRow('2026-10-30', 1), kisRow('2026-10-30', 2)])).toThrow('중복')
  })
})

describe('buildInvestorFlowInputs', () => {
  it('matches the pre-registered research features exactly (PREREG addendum 5)', () => {
    for (const testCase of parity.cases) {
      const values = buildInvestorFlowInputs({ days: parseInvestorFlowRows(testCase.rows), dates: testCase.dates })
      expect(values, testCase.label).toEqual(testCase.expected)
    }
  })

  it('computes window ratios, streaks and the both-buy flag from the signal-date window', () => {
    const dates = tradingDates(25)
    const rows = dates.map((date, i) => kisRow(date, i >= 22 ? 100 : -50, 10))
    const values = byName(buildInvestorFlowInputs({ days: parseInvestorFlowRows(rows), dates }))
    expect(values.foreignNetBuyRatio1).toBeCloseTo(0.1)
    expect(values.foreignNetBuyRatio5).toBeCloseTo((3 * 100 - 2 * 50) / 5_000)
    expect(values.foreignNetBuyRatio20).toBeCloseTo((3 * 100 - 17 * 50) / 20_000)
    expect(values.foreignNetBuyStreak).toBe(3)
    expect(values.institutionNetBuyStreak).toBe(20)
    expect(values.foreignInstitutionBothBuy5).toBe(1)
    expect(values.privateFundNetBuyRatio5).toBeNull()
  })

  it('treats a missing trading day as missing for windows that include it and restarts streaks', () => {
    const dates = tradingDates(25)
    const days = parseInvestorFlowRows(dates.filter((_, i) => i !== 21).map((date) => kisRow(date, 100)))
    const values = byName(buildInvestorFlowInputs({ days, dates }))
    expect(values.foreignNetBuyRatio1).toBeCloseTo(0.1)
    expect(values.foreignNetBuyRatio5).toBeNull()
    expect(values.foreignNetBuyRatio20).toBeNull()
    expect(values.foreignNetBuyStreak).toBe(3)
    expect(values.foreignInstitutionBothBuy5).toBeNull()
  })

  it('returns all-missing inputs when the signal-date row is absent', () => {
    const dates = tradingDates(25)
    const values = buildInvestorFlowInputs({ days: new Map<string, InvestorFlowDay>(), dates })
    expect(values).toHaveLength(INVESTOR_FLOW_INPUT_NAMES.length)
    expect(values.every((value) => value === null)).toBe(true)
  })
})

describe('loadInvestorFlowInputs', () => {
  let log: MockInstance; let warn: MockInstance
  beforeEach(() => {
    log = vi.spyOn(console, 'log').mockImplementation(() => {})
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => { log.mockRestore(); warn.mockRestore() })

  const dates = tradingDates(25)
  const signalDate = dates.at(-1)!
  const fullRows = dates.map((date) => kisRow(date, 100))

  it('requests the signal date once per symbol and retries transient failures', async () => {
    const calls: string[] = []
    let failedOnce = false
    const result = await loadInvestorFlowInputs({
      symbols: ['KOSPI:000001', 'KOSDAQ:000002'], signalDate, dates, requestsPerSecond: 1_000,
      fetchRows: async (symbol, end) => {
        calls.push(`${symbol}@${end}`)
        if (symbol === 'KOSDAQ:000002' && !failedOnce) { failedOnce = true; throw new Error('timeout') }
        return fullRows
      },
    })
    expect(calls.filter((call) => call.startsWith('KOSPI:000001'))).toEqual([`KOSPI:000001@${signalDate.replaceAll('-', '')}`])
    expect(calls.filter((call) => call.startsWith('KOSDAQ:000002'))).toHaveLength(2)
    expect(byName(result.get('KOSDAQ:000002')!).foreignNetBuyRatio1).toBeCloseTo(0.1)
  })

  it('keeps a symbol with persistent failures as missing inputs while coverage stays above the gate', async () => {
    const symbols = Array.from({ length: 40 }, (_, i) => `KOSPI:${String(i).padStart(6, '0')}`)
    const result = await loadInvestorFlowInputs({
      symbols, signalDate, dates, requestsPerSecond: 1_000, retries: 0,
      fetchRows: async (symbol) => { if (symbol === symbols[0]) throw new Error('api'); return fullRows },
    })
    expect(result.get(symbols[0]!)!.every((value) => value === null)).toBe(true)
    expect(result.size).toBe(40)
  })

  it('stops the run when signal-date coverage falls below 95%', async () => {
    const stale = dates.slice(0, -1).map((date) => kisRow(date, 100))
    await expect(loadInvestorFlowInputs({
      symbols: ['KOSPI:000001', 'KOSPI:000002'], signalDate, dates, requestsPerSecond: 1_000,
      fetchRows: async (symbol) => symbol === 'KOSPI:000001' ? fullRows : stale,
    })).rejects.toThrow('투자자 수급 커버리지 부족: 1/2')
  })

  it('rejects a date window that does not end at the signal date', async () => {
    await expect(loadInvestorFlowInputs({ symbols: [], signalDate: '2026-12-31', dates, fetchRows: async () => [] }))
      .rejects.toThrow('기준일 불일치')
  })
})
