import { describe, expect, it } from 'vitest'

import {
  KIS_MASTER_LAYOUTS,
  parseKisMasterFile,
  parseKisMasterLine,
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
    const result = parseKisMasterFile(Buffer.concat([
      stock,
      Buffer.from('\n'),
      etf,
      Buffer.from('\nBROKEN\n'),
    ]), 'KOSDAQ')

    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]?.symbol).toBe('KOSDAQ:035720')
    expect(result.skippedNonStockCount).toBe(1)
    expect(result.errors).toEqual([{ lineNumber: 3, reason: '행 길이 부족: 6 bytes' }])
  })
})
