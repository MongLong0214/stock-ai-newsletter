import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  from: vi.fn(), upsert: vi.fn(), rpc: vi.fn(), abortSignal: vi.fn(), execFile: vi.fn(),
}))
vi.mock('@/scripts/tli/shared/supabase-admin', () => ({ supabaseAdmin: { from: mocks.from, rpc: mocks.rpc } }))
vi.mock('node:child_process', () => ({ execFile: mocks.execFile }))

import {
  KIS_MASTER_LAYOUTS,
  loadStockMaster,
  parseKisMasterFile,
  parseKisMasterLine,
  recordStockMasterDailySnapshot,
  type StockMasterInput,
  type StockMarket,
} from '@/scripts/stock-picks/load-stock-master'

const buildMasterLine = (input: {
  readonly market: StockMarket
  readonly code?: string
  readonly name?: string
  readonly fieldValues?: Readonly<Record<number, string>>
}): Buffer => {
  const layout = KIS_MASTER_LAYOUTS[input.market]
  const fields = layout.tailWidths.map((width, index) => {
    const value = input.fieldValues?.[index] ?? ''
    if (value.length > width) throw new Error(`fixture field ${index} exceeds ${width} bytes`)
    return value.padEnd(width, ' ')
  })
  const head = `${(input.code ?? '005930').padEnd(9, ' ')}${'KR7005930003'.padEnd(12, ' ')}${input.name ?? 'SAMSUNG ELECTRONICS'}`
  return Buffer.from(`${head}${fields.join('')}`, 'ascii')
}

describe('KIS stock master parser', () => {
  it('keeps the official fixed-width tail lengths aligned', () => {
    for (const layout of Object.values(KIS_MASTER_LAYOUTS)) {
      expect(layout.tailWidths.reduce((sum, width) => sum + width, 0)).toBe(layout.tailByteLength)
    }
  })

  it('extracts symbol, name, market, and raw status flags from a fixed-width row', () => {
    const indexes = KIS_MASTER_LAYOUTS.KOSPI.flagIndexes
    const row = parseKisMasterLine(buildMasterLine({
      market: 'KOSPI',
      fieldValues: {
        [indexes.securityGroup]: 'ST',
        [indexes.shortTermOverheat]: '2',
        [indexes.tradingSuspended]: 'N',
        [indexes.liquidationTrading]: 'N',
        [indexes.managedStock]: 'Y',
        [indexes.marketWarning]: '02',
        [indexes.marketWarningRiskNotice]: 'Y',
        [indexes.unfaithfulDisclosure]: 'N',
        [indexes.reverseListing]: 'N',
      },
    }), 'KOSPI')

    expect(row).toEqual({
      symbol: 'KOSPI:005930',
      name: 'SAMSUNG ELECTRONICS',
      market: 'KOSPI',
      is_active: false,
      status_flags: {
        security_group_code: 'ST',
        short_term_overheat_code: '2',
        trading_suspended: 'N',
        liquidation_trading: 'N',
        managed_stock: 'Y',
        market_warning_code: '02',
        market_warning_risk_notice: 'Y',
        unfaithful_disclosure: 'N',
        reverse_listing: 'N',
      },
    })
  })

  it('separates expected non-stock rows from malformed rows', () => {
    const indexes = KIS_MASTER_LAYOUTS.KOSDAQ.flagIndexes
    const stock = buildMasterLine({
      market: 'KOSDAQ',
      code: '035720',
      name: 'KAKAO',
      fieldValues: { [indexes.securityGroup]: 'ST' },
    })
    const etf = buildMasterLine({
      market: 'KOSDAQ',
      code: '123456',
      name: 'ETF SAMPLE',
      fieldValues: { [indexes.securityGroup]: 'EF' },
    })
    const letteredStock = buildMasterLine({
      market: 'KOSDAQ',
      code: '12345K',
      name: 'LETTERED PREFERRED',
      fieldValues: { [indexes.securityGroup]: 'ST' },
    })
    const result = parseKisMasterFile(Buffer.concat([
      stock,
      Buffer.from('\n'),
      etf,
      Buffer.from('\n'),
      letteredStock,
      Buffer.from('\nBROKEN\n'),
    ]), 'KOSDAQ')

    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]?.symbol).toBe('KOSDAQ:035720')
    expect(result.skippedNonStockCount).toBe(1)
    expect(result.skippedLetteredCodeCount).toBe(1)
    expect(result.errors).toEqual([{ lineNumber: 4, reason: '행 길이 부족: 6 bytes' }])
  })
})

describe('KIS stock master persistence', () => {
  const rows: StockMasterInput[] = [
    { symbol: 'KOSPI:005930', name: 'SAMSUNG', market: 'KOSPI', is_active: true, status_flags: {} },
    { symbol: 'KOSDAQ:035720', name: 'KAKAO', market: 'KOSDAQ', is_active: false, status_flags: { managed_stock: 'Y' } },
  ]
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.from.mockReturnValue({ upsert: mocks.upsert })
    mocks.upsert.mockResolvedValue({ error: null })
    mocks.rpc.mockReturnValue({ abortSignal: mocks.abortSignal })
    mocks.abortSignal.mockResolvedValue({ data: rows.length, error: null })
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

  it('returns exactly the parsed rows it upserted while keeping current-master writes unchanged', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1]))))
    mocks.execFile.mockImplementation((_file, args, _options, callback) => {
      const market: StockMarket = args[2] === 'kospi_code.mst' ? 'KOSPI' : 'KOSDAQ'
      const indexes = KIS_MASTER_LAYOUTS[market].flagIndexes
      callback(null, buildMasterLine({ market, fieldValues: { [indexes.securityGroup]: 'ST' } }), Buffer.alloc(0))
    })
    const result = await loadStockMaster()
    expect(result.rows.map(row => row.symbol)).toEqual(['KOSPI:005930', 'KOSDAQ:005930'])
    expect(mocks.from).toHaveBeenCalledWith('stock_master')
    expect(mocks.upsert).toHaveBeenCalledWith(result.rows.map(row => ({ ...row, updated_at: expect.any(String) })), { onConflict: 'symbol' })
    expect(result.rows.every(row => !('updated_at' in row))).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(2)
    for (const market of ['KOSPI', 'KOSDAQ'] as const) {
      expect(fetch).toHaveBeenCalledWith(KIS_MASTER_LAYOUTS[market].url, { signal: expect.any(AbortSignal) })
    }
    expect(mocks.execFile).toHaveBeenCalledWith('unzip', expect.any(Array), expect.objectContaining({ timeout: 60_000 }), expect.any(Function))
  })

  it('calls the RPC once with only supplied snapshot columns and a 30-second abort signal', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout')
    await recordStockMasterDailySnapshot({ signalDate: '2026-10-15', rows: rows.map(row => ({ ...row, updated_at: 'ignored' })) })
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('record_stock_master_daily_snapshot', {
      p_signal_date: '2026-10-15', p_rows: rows,
    })
    expect(timeout).toHaveBeenCalledExactlyOnceWith(30_000)
    expect(mocks.abortSignal).toHaveBeenCalledExactlyOnceWith(timeout.mock.results[0]!.value)
    expect(mocks.from).not.toHaveBeenCalled()
    expect(console.log).toHaveBeenCalledWith(JSON.stringify({ event: 'stock_master_snapshot', signalDate: '2026-10-15', rows: 2 }))
  })

  it('sends all rows in one RPC even when there are more than 500 and logs the returned count', async () => {
    const many = Array.from({ length: 501 }, (_, i) => ({ ...rows[0]!, symbol: `KOSPI:${i.toString().padStart(6, '0')}` }))
    mocks.abortSignal.mockResolvedValue({ data: many.length, error: null })
    await recordStockMasterDailySnapshot({ signalDate: '2026-10-15', rows: many })
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('record_stock_master_daily_snapshot', {
      p_signal_date: '2026-10-15', p_rows: many,
    })
    expect(console.log).toHaveBeenCalledWith(JSON.stringify({ event: 'stock_master_snapshot', signalDate: '2026-10-15', rows: 501 }))
  })

  it('logs already_captured when the RPC returns zero', async () => {
    mocks.abortSignal.mockResolvedValue({ data: 0, error: null })
    await recordStockMasterDailySnapshot({ signalDate: '2026-10-15', rows })
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    expect(console.log).toHaveBeenCalledWith(JSON.stringify({ event: 'stock_master_snapshot', signalDate: '2026-10-15', rows: 0, skipped: 'already_captured' }))
  })

  it('throws on an RPC error with exactly one attempt and no retry', async () => {
    mocks.abortSignal.mockResolvedValue({ data: null, error: { message: 'snapshot insert denied' } })
    await expect(recordStockMasterDailySnapshot({ signalDate: '2026-10-15', rows })).rejects.toThrow('snapshot insert denied')
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    expect(mocks.abortSignal).toHaveBeenCalledTimes(1)
    expect(console.log).not.toHaveBeenCalled()
  })
})
