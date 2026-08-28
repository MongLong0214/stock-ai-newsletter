import { describe, expect, it } from 'vitest';

import { parseRangePriceRow } from '@/app/archive/_utils/api/kis/client';

const parseClose = (value: string): number => Number.parseInt(value, 10);

describe('parseRangePriceRow', () => {
  it('maps a normal KIS stock OHLCV row', () => {
    expect(parseRangePriceRow({
      stck_bsop_date: '20260827',
      stck_oprc: '70000',
      stck_hgpr: '73500',
      stck_lwpr: '69500',
      stck_clpr: '72800',
      acml_vol: '1234567',
    }, 'stck_clpr', parseClose)).toEqual({
      date: '2026-08-27',
      open: 70000,
      high: 73500,
      low: 69500,
      close: 72800,
      volume: 1234567,
    });
  });

  it('keeps the close row when optional OHLC values are missing or invalid', () => {
    expect(parseRangePriceRow({
      stck_bsop_date: '20260827',
      stck_oprc: '',
      stck_hgpr: 'not-a-price',
      stck_lwpr: '0',
      stck_clpr: '72800',
      acml_vol: '',
    }, 'stck_clpr', parseClose)).toEqual({
      date: '2026-08-27',
      open: null,
      high: null,
      low: null,
      close: 72800,
      volume: null,
    });
  });

  it('nulls an inverted high-low pair without dropping the valid close', () => {
    expect(parseRangePriceRow({
      stck_bsop_date: '20260827',
      stck_oprc: '71000',
      stck_hgpr: '69000',
      stck_lwpr: '70000',
      stck_clpr: '70500',
      acml_vol: '10',
    }, 'stck_clpr', parseClose)).toEqual({
      date: '2026-08-27',
      open: 71000,
      high: null,
      low: null,
      close: 70500,
      volume: 10,
    });
  });
});
