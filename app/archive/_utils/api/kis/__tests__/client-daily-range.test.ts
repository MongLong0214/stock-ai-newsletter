import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/app/archive/_utils/api/kis/token-storage', () => ({
  getTokenFromStorage: vi.fn(async () => null),
  saveTokenToStorage: vi.fn(async () => undefined),
}));

import {
  fetchDailyRangePriceRows,
  fetchIndexDailyRangePriceRows,
  getDailyRangeClosePrices,
  parseRangePriceRow,
  resetKisClientCacheForTest,
} from '@/app/archive/_utils/api/kis/client';

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

describe('throwing daily range fetch', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv('KIS_BASE_URL', 'https://example.com');
    vi.stubEnv('KIS_APP_KEY', 'testkey');
    vi.stubEnv('KIS_APP_SECRET', 'dGVzdA==');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    resetKisClientCacheForTest();
  });

  it.each([
    { status: 429, kind: 'rate_limit' },
    { status: 500, kind: 'http' },
  ])('classifies non-JSON HTTP $status responses as $kind', async ({ status, kind }) => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'fixture-token' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response('not-json', { status }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchDailyRangePriceRows('KOSPI:005930', '20260901', '20260901'))
      .rejects.toMatchObject({ kind, status });
  });

  it('invalidates a rejected data-call token, refreshes once, and retries successfully', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'rejected-token' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response('not-json', { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'fresh-token' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        rt_cd: '0',
        output2: [{
          stck_bsop_date: '20260901',
          stck_oprc: '70000',
          stck_hgpr: '71000',
          stck_lwpr: '69000',
          stck_clpr: '70500',
          acml_vol: '100',
        }],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchDailyRangePriceRows('KOSPI:005930', '20260901', '20260901'))
      .resolves.toHaveLength(1);

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get('authorization'))
      .toBe('Bearer rejected-token');
    expect(new Headers(fetchMock.mock.calls[3]?.[1]?.headers).get('authorization'))
      .toBe('Bearer fresh-token');
  });

  it('throws after the refreshed token is rejected a second time', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'rejected-token' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response('not-json', { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'fresh-token' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response('not-json', { status: 403 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchDailyRangePriceRows('KOSPI:005930', '20260901', '20260901'))
      .rejects.toMatchObject({ kind: 'token', status: 403 });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('classifies KIS API rate-limit codes and keeps the legacy wrapper non-throwing', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'fixture-token' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValue(new Response(JSON.stringify({
        rt_cd: '1',
        msg_cd: 'EGW00201',
        msg1: 'rate limited',
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchDailyRangePriceRows('KOSPI:005930', '20260901', '20260901'))
      .rejects.toMatchObject({ kind: 'rate_limit', code: 'EGW00201' });
    await expect(getDailyRangeClosePrices('KOSPI:005930', '20260901', '20260901'))
      .resolves.toEqual([]);
  });

  it('maps KIS index OHLC fields as decimal index points', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'fixture-token' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        rt_cd: '0',
        output2: [{
          stck_bsop_date: '20250321',
          bstp_nmix_oprc: '2643.21',
          bstp_nmix_hgpr: '2649.88',
          bstp_nmix_lwpr: '2631.45',
          bstp_nmix_prpr: '2643.13',
          acml_vol: '498765432',
        }],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchIndexDailyRangePriceRows('0001', '20250321', '20250321'))
      .resolves.toEqual([{
        date: '2025-03-21',
        open: 2643.21,
        high: 2649.88,
        low: 2631.45,
        close: 2643.13,
        volume: 498765432,
      }]);
  });
});
