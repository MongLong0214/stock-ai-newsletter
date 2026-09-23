import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { evaluateMarketAssessmentSnapshot, getKisMarketAssessmentSnapshot, parseSerpFinanceObservedAt, resetKisMarketAssessmentCacheForTest } from '../kis-market-assessment';
import { RISK_NOW } from './market-risk-fixture';

const json = (data: unknown) => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
function providerMock(options: {
  brokenUs?: boolean; missingChange?: boolean; downSignMissing?: boolean;
  brokenSerp?: boolean; missingMini?: boolean; staleUs?: boolean; dowConflict?: boolean;
  missingDow?: boolean; invalidContract?: boolean; cboeVix?: boolean;
  dayChartFailure?: boolean; dayChartPrice?: string; dayChartTime?: string; dayChartDate?: string; dayPreviousClose?: string; nightPriceFailure?: boolean;
  nightChartFailure?: boolean; nightChartTime?: string; nightChartDate?: string; nightPrice?: string; nightChartPrice?: string; nightBase?: string;
  serpFinance?: Record<string, unknown>;
} = {}) {
  return vi.fn<typeof fetch>(async input => {
    const u = new URL(String(input));
    if (u.pathname.endsWith('/oauth2/tokenP')) return json({ access_token: 'test-token' });
    if (u.hostname === 'cdn.cboe.com') {
      if (!options.cboeVix) throw new Error('CBOE unavailable fixture');
      return new Response('DATE,OPEN,HIGH,LOW,CLOSE\n09/04/2026,18,18,18,18\n09/08/2026,18,18,18,18\n');
    }
    if (u.pathname.endsWith('/inquire-time-indexchartprice')) {
      if (options.brokenUs) return json({ rt_cd: '0', output1: { ovrs_nmix_prpr: '0' } });
      return json({
        rt_cd: '0',
        output1: { hts_kor_isnm: 'Index', ovrs_nmix_prpr: '100', ovrs_nmix_prdy_vrss: options.missingChange ? undefined : '0', prdy_ctrt: options.missingChange ? undefined : '0' },
        output2: [{ stck_bsop_date: options.staleUs ? '20260801' : '20260908', stck_cntg_hour: '161500', optn_prpr: '100' }],
      });
    }
    if (u.pathname.endsWith('/inquire-daily-chartprice')) {
      if (options.brokenUs || options.missingChange || options.missingDow) return json({ rt_cd: '0', output2: [] });
      return json({ rt_cd: '0', output2: [
        { stck_bsop_date: '20260907', ovrs_nmix_prpr: '100' },
        { stck_bsop_date: '20260908', ovrs_nmix_prpr: '100' },
      ] });
    }
    if (u.pathname.endsWith('/display-board-futures')) return json({ rt_cd: '0', output: options.missingMini ? [] : [
      { futs_shrn_iscd: 'EXPIRED', hts_kor_isnm: '미니F expired', futs_prpr: '100', futs_prdy_vrss: '0', futs_prdy_ctrt: '0', hts_rmnn_dynu: '-1' },
      { futs_shrn_iscd: 'NEAR', hts_kor_isnm: '미니F near', futs_prpr: options.invalidContract ? '0' : '100', futs_prdy_vrss: '0', futs_prdy_ctrt: '0', hts_rmnn_dynu: '1' },
      { futs_shrn_iscd: 'NEXT', hts_kor_isnm: '미니F next', futs_prpr: '100', futs_prdy_vrss: '0', futs_prdy_ctrt: '0', hts_rmnn_dynu: '30' },
    ] });
    if (u.pathname.endsWith('/inquire-price')) return json({ rt_cd: '0', output1: options.nightPriceFailure ? {} : {
      futs_prpr: options.nightPrice ?? '100', futs_sdpr: options.nightBase ?? '100', futs_prdy_vrss: '0', futs_prdy_ctrt: '0',
    } });
    if (u.pathname.endsWith('/inquire-time-fuopchartprice')) {
      const night = u.searchParams.get('FID_COND_MRKT_DIV_CODE') === 'CM';
      return json({ rt_cd: '0', output1: night ? {} : { futs_prdy_clpr: options.dayPreviousClose ?? '100' },
        output2: (night ? options.nightChartFailure : options.dayChartFailure) ? [] : [{
        stck_bsop_date: night ? (options.nightChartDate ?? '20260908') : (options.dayChartDate ?? '20260908'),
        stck_cntg_hour: night ? (options.nightChartTime ?? '300000') : (options.dayChartTime ?? '154500'),
        futs_prpr: night ? (options.nightChartPrice ?? options.nightPrice ?? '100') : (options.dayChartPrice ?? '100'),
      }, { stck_bsop_date: '20260908', stck_cntg_hour: '120000', futs_prpr: '100' }] });
    }
    if (u.hostname === 'api.stock.naver.com' && u.pathname.endsWith('/basic')) {
      if (u.pathname.includes('.VIX')) return json(options.cboeVix ? {
        closePrice: '18', compareToPreviousClosePrice: '0', fluctuationsRatio: '0', localTradedAt: '2026-09-08T16:15:00-04:00',
      } : {});
      if (options.missingDow || options.brokenUs || options.missingChange) return json({});
      return json({ closePrice: options.dowConflict ? '150' : '100', compareToPreviousClosePrice: options.dowConflict ? '50' : '0',
        fluctuationsRatio: options.dowConflict ? '50' : '0', compareToPreviousPrice: { name: options.dowConflict ? 'RISING' : 'UNCHANGED' },
        localTradedAt: '2026-09-08T16:15:00-04:00' });
    }
    if (u.hostname === 'm.stock.naver.com') return json({
      stockName: u.pathname.split('/')[3], closePrice: options.downSignMissing ? '96' : '100',
      compareToPreviousClosePrice: options.downSignMissing ? '-4' : '0',
      fluctuationsRatio: options.downSignMissing ? '-4' : '0',
      compareToPreviousPrice: options.downSignMissing ? undefined : { name: 'UNCHANGED' },
      localTradedAt: '2026-09-08T15:45:00+09:00',
    });
    if (u.hostname === 'serpapi.com') {
      if (options.brokenSerp) return json({ error: 'You have run out of searches for this month.' });
      if (u.searchParams.get('engine') === 'google_finance' && options.serpFinance?.[u.searchParams.get('q') ?? '']) {
        return json(options.serpFinance[u.searchParams.get('q') ?? '']);
      }
      return json(u.searchParams.get('engine') === 'google' ? { organic_results: [] } : {});
    }
    if (u.hostname === 'search.naver.com') return new Response(`<section class="_cs_stock"><span class="stk_nm">VIX</span><span class="spt_con"><strong>18</strong></span><span class="n_ch"><em>0</em><em>(0%)</em></span><p class="stk_info"><em>2026.09.08. 16:15</em></p></section>`);
    if (u.hostname === 'finance.naver.com' && u.pathname.includes('Detail')) return new Response('<p class="no_today"><em><span class="no1"></span><span class="no0"></span><span class="no0"></span></em></p><p class="no_exday"><em><span class="no0"></span></em><em>(0%)</em></p><div class="exchange_info"><span class="date">2026.09.09 05:30</span></div>');
    if (u.hostname === 'openapi.naver.com') return json({ total: 0, items: [] });
    if (u.hostname === 'api.stock.naver.com') return json([]);
    if (u.hostname === 'finance.naver.com') return new Response('<html></html>');
    throw new Error('Unexpected market endpoint: ' + u.pathname);
  });
}

describe('market source acquisition v2', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(RISK_NOW));
    resetKisMarketAssessmentCacheForTest();
    vi.stubEnv('KIS_APP_KEY', 'testkey');
    vi.stubEnv('KIS_APP_SECRET', 'dGVzdA==');
    vi.stubEnv('KIS_BASE_URL', 'https://example.com');
    vi.stubEnv('SERP_API_KEY', 'test-key');
    vi.stubEnv('NAVER_CLIENT_ID', '');
    vi.stubEnv('NAVER_CLIENT_SECRET', '');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it('collects timestamped day and night mini futures from the selected front month', async () => {
    const fetch = providerMock();
    vi.stubGlobal('fetch', fetch);
    const snapshot = await getKisMarketAssessmentSnapshot();
    expect(snapshot.indicators.sp500?.observedAt).toBe('2026-09-08T20:15:00.000Z');
    expect(snapshot.indicators.kospi?.observedAt).toBe('2026-09-08T06:45:00.000Z');
    expect(snapshot.indicators.kosdaq).not.toBeNull();
    expect(snapshot.indicators.kospi200MiniFutures?.observedAt).toBe('2026-09-08T06:45:00.000Z');
    expect(snapshot.indicators.kospi200MiniFutures?.price).toBe(100);
    expect(snapshot.nightSession.kospiMiniFutures?.observedAt).toBe('2026-09-08T21:00:00.000Z');
    expect(snapshot.nightSession.kospiMiniFutures?.price).toBe(100);
    expect(snapshot.nightSession.kospiMiniFutures?.session).toBe('night');
    expect(snapshot.degradedSources).not.toContain('timestamped night futures unavailable; dated Korea spot used');
    const chartUrls = fetch.mock.calls.map(([url]) => new URL(String(url))).filter(url => url.pathname.endsWith('/inquire-time-fuopchartprice'));
    expect(chartUrls.map(url => [url.searchParams.get('FID_COND_MRKT_DIV_CODE'), url.searchParams.get('FID_INPUT_ISCD')])).toEqual([['F', 'NEAR'], ['CM', 'NEAR']]);
    const assessment = evaluateMarketAssessmentSnapshot(snapshot);
    expect(assessment.dataQuality.indicators.kospi200MiniFutures).toBe('usable');
    expect(assessment.dataQuality.indicators.nightFutures).toBe('usable');
    expect(assessment.verdict).toBe('NORMAL');
  });
  it('selects the nearest unexpired contract independently of its board price', async () => {
    vi.stubGlobal('fetch', providerMock());
    expect((await getKisMarketAssessmentSnapshot()).indicators.kospi200MiniFutures?.code).toBe('NEAR');
    resetKisMarketAssessmentCacheForTest();
    vi.stubGlobal('fetch', providerMock({ invalidContract: true }));
    const next = await getKisMarketAssessmentSnapshot();
    expect(next.indicators.kospi200MiniFutures?.code).toBe('NEAR');
    expect(next.indicators.kospi200MiniFutures?.price).toBe(100);
    expect(next.indicators.kospi200MiniFutures?.observedAt).toBe('2026-09-08T06:45:00.000Z');
    expect(next.nightSession.kospiMiniFutures?.code).toBe('NEAR');
  });
  it('uses the latest day minute price and time with the previous close from the same chart response', async () => {
    vi.stubGlobal('fetch', providerMock({ dayChartPrice: '105', dayPreviousClose: '100', nightBase: '100' }));
    const day = (await getKisMarketAssessmentSnapshot()).indicators.kospi200MiniFutures;
    expect(day?.price).toBe(105);
    expect(day?.change).toBe(5);
    expect(day?.changePct).toBe(5);
    expect(day?.observedAt).toBe('2026-09-08T06:45:00.000Z');
  });
  it.each([{ dayChartFailure: true }, { dayChartPrice: 'bad' }, { dayChartTime: 'bad' }, { dayPreviousClose: 'bad' }])('keeps board price undated and night unavailable when day minute is invalid: %j', async options => {
    vi.stubGlobal('fetch', providerMock(options));
    const snapshot = await getKisMarketAssessmentSnapshot();
    const day = snapshot.indicators.kospi200MiniFutures;
    expect(day?.price).toBe(100);
    expect(day?.observedAt).toBeNull();
    expect(snapshot.nightSession.kospiMiniFutures).toBeNull();
  });
  it.each([
    ['235900', '2026-09-08T14:59:00.000Z'],
    ['240000', '2026-09-08T15:00:00.000Z'],
    ['300000', '2026-09-08T21:00:00.000Z'],
  ])('converts KRX night clock %s to %s', async (time, expected) => {
    vi.stubGlobal('fetch', providerMock({ dayChartDate: '20260909', dayChartTime: '090000', nightChartTime: time, nightChartPrice: '1134.04', nightPrice: '1200', dayPreviousClose: '1106.62', nightBase: '1106.62' }));
    const night = (await getKisMarketAssessmentSnapshot()).nightSession.kospiMiniFutures;
    expect(night?.observedAt).toBe(expected);
    expect(night?.price).toBe(1134.04);
    expect(night?.change).toBeCloseTo(27.42);
    expect(night?.changePct).toBeCloseTo(2.48, 2);
  });
  it('uses the previous day session close for a morning night quote', async () => {
    vi.setSystemTime(new Date('2026-09-09T10:00:00+09:00'));
    vi.stubGlobal('fetch', providerMock({ dayChartDate: '20260909', dayChartTime: '090000', dayChartPrice: '1118', dayPreviousClose: '1106.62', nightChartDate: '20260908', nightChartPrice: '1115.62', nightBase: '1106.62' }));
    const night = (await getKisMarketAssessmentSnapshot()).nightSession.kospiMiniFutures;
    expect(night?.price).toBe(1115.62);
    expect(night?.change).toBeCloseTo(9);
    expect(night?.changePct).toBeCloseTo(9 / 1106.62 * 100);
  });
  it('uses the last day minute of the same session for an evening night quote', async () => {
    vi.stubGlobal('fetch', providerMock({ dayChartPrice: '1115.62', dayPreviousClose: '1106.62', nightChartPrice: '1124.62', nightBase: '1115.62' }));
    const night = (await getKisMarketAssessmentSnapshot()).nightSession.kospiMiniFutures;
    expect(night?.price).toBe(1124.62);
    expect(night?.change).toBeCloseTo(9);
    expect(night?.changePct).toBeCloseTo(9 / 1115.62 * 100);
  });
  it.each(['1115.60', '1115.64', 'bad'])('rejects a night base that does not match the session day close: %s', async nightBase => {
    vi.stubGlobal('fetch', providerMock({ dayChartPrice: '1115.62', dayPreviousClose: '1106.62', nightBase }));
    expect((await getKisMarketAssessmentSnapshot()).nightSession.kospiMiniFutures).toBeNull();
  });
  it('accepts a night base within 0.01 of the day close', async () => {
    vi.stubGlobal('fetch', providerMock({ dayChartPrice: '1115.62', dayPreviousClose: '1106.62', nightBase: '1115.63', nightChartPrice: '1124.62' }));
    const night = (await getKisMarketAssessmentSnapshot()).nightSession.kospiMiniFutures;
    expect(night?.price).toBe(1124.62);
    expect(night?.change).toBeCloseTo(9);
  });
  it('rejects a same-day night quote before the day session closes', async () => {
    vi.stubGlobal('fetch', providerMock({ dayChartTime: '154459', dayChartPrice: '1115.62', dayPreviousClose: '1106.62', nightBase: '1115.62' }));
    expect((await getKisMarketAssessmentSnapshot()).nightSession.kospiMiniFutures).toBeNull();
  });
  it('rejects a night session newer than the latest day session', async () => {
    vi.stubGlobal('fetch', providerMock({ dayChartDate: '20260907', nightChartDate: '20260908' }));
    expect((await getKisMarketAssessmentSnapshot()).nightSession.kospiMiniFutures).toBeNull();
  });
  it.each([{ nightPriceFailure: true }, { nightChartFailure: true }, { nightChartTime: 'bad' }])('leaves unavailable or undated night data null: %j', async options => {
    vi.stubGlobal('fetch', providerMock(options));
    const snapshot = await getKisMarketAssessmentSnapshot();
    expect(snapshot.nightSession.kospiMiniFutures).toBeNull();
    expect(snapshot.degradedSources).toContain('timestamped night futures unavailable; dated Korea spot used');
  });
  it('deduplicates concurrent requests and isolates cache values from consumer mutation', async () => {
    const fetch = providerMock();
    vi.stubGlobal('fetch', fetch);
    const [a, b] = await Promise.all([getKisMarketAssessmentSnapshot(), getKisMarketAssessmentSnapshot()]);
    const count = fetch.mock.calls.length;
    expect(a).toEqual(b);
    a.indicators.sp500!.changePct = -50;
    const c = await getKisMarketAssessmentSnapshot();
    expect(c.indicators.sp500!.changePct).toBe(0);
    expect(fetch.mock.calls.length).toBe(count);
    vi.setSystemTime(new Date(Date.parse(RISK_NOW) + 31_000));
    await getKisMarketAssessmentSnapshot();
    expect(fetch.mock.calls.length).toBeGreaterThan(count);
  });
  it.each([{ brokenUs: true }, { missingChange: true }])('never invents zero changes or safe US coverage: %j', async options => {
    vi.stubGlobal('fetch', providerMock(options));
    const snapshot = await getKisMarketAssessmentSnapshot();
    expect(snapshot.indicators.sp500).toBeNull();
    expect(evaluateMarketAssessmentSnapshot(snapshot).verdict).toBe('UNAVAILABLE');
  });
  it('a futures-board outage does not discard fresh local spot prices', async () => {
    vi.stubGlobal('fetch', providerMock({ missingMini: true }));
    const snapshot = await getKisMarketAssessmentSnapshot();
    expect(snapshot.indicators.kospi200MiniFutures).toBeNull();
    expect(evaluateMarketAssessmentSnapshot(snapshot).verdict).toBe('NORMAL');
  });
  it('preserves an explicit negative sign when the direction name is missing', async () => {
    vi.stubGlobal('fetch', providerMock({ downSignMissing: true }));
    const snapshot = await getKisMarketAssessmentSnapshot();
    expect(snapshot.indicators.kospi?.changePct).toBe(-4);
    expect(evaluateMarketAssessmentSnapshot(snapshot).verdict).toBe('CRASH_ALERT');
  });
  it('tries independent secondary VIX/FX feeds after a primary exception', async () => {
    const fetch = providerMock({ brokenSerp: true });
    vi.stubGlobal('fetch', fetch);
    const snapshot = await getKisMarketAssessmentSnapshot();
    expect(snapshot.indicators.vix?.source).toBe('NAVER_SEARCH');
    expect(snapshot.indicators.vix?.observedAt).toBe('2026-09-08T20:15:00.000Z');
    expect(snapshot.indicators.usdKrw?.change).toBe(0); // legitimate unchanged quote
    expect(snapshot.degradedSources).toContain('serpapi: quota exhausted');
    const urls = fetch.mock.calls.map(([url]) => new URL(String(url)));
    expect(urls.filter(u => u.hostname === 'serpapi.com')).toHaveLength(1);
  });
  it('marks unresolved cross-source disagreements, not cross-checked confidence', async () => {
    vi.stubGlobal('fetch', providerMock({ dowConflict: true }));
    const snapshot = await getKisMarketAssessmentSnapshot();
    expect(snapshot.indicators.dowJones?.sourceConflict).toBe(true);
    expect(evaluateMarketAssessmentSnapshot(snapshot).dataQuality.indicators.dowJones).toBe('conflict');
  });
  it('cross-checks official CBOE closes against a dated VIX quote', async () => {
    vi.stubGlobal('fetch', providerMock({ cboeVix: true }));
    const snapshot = await getKisMarketAssessmentSnapshot();
    expect(snapshot.indicators.vix?.validation).toBe('cross_checked');
    expect(snapshot.indicators.vix?.primarySource).toBe('CBOE');
    expect(snapshot.indicators.vix?.observedAtPrecision).toBe('session_close');
    expect(evaluateMarketAssessmentSnapshot(snapshot).dataQuality.indicators.vix).toBe('usable');
  });
  it('continues when only Dow is unavailable', async () => {
    vi.stubGlobal('fetch', providerMock({ missingDow: true }));
    const snapshot = await getKisMarketAssessmentSnapshot();
    expect(snapshot.indicators.dowJones).toBeNull();
    expect(evaluateMarketAssessmentSnapshot(snapshot).verdict).toBe('NORMAL');
  });
  it('times out a stalled response body and tries a numeric fallback', async () => {
    vi.useFakeTimers();
    const base = providerMock();
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (url, init) => {
      const u = new URL(String(url));
      if (u.pathname.endsWith('/inquire-time-indexchartprice') && u.searchParams.get('FID_INPUT_ISCD') === 'SPX') {
        return new Response(new ReadableStream({
          start(controller) {
            init?.signal?.addEventListener('abort', () => controller.error(new DOMException('Aborted', 'AbortError')), { once: true });
          },
        }));
      }
      return base(url, init);
    }));
    const pending = getKisMarketAssessmentSnapshot();
    await vi.advanceTimersByTimeAsync(8_001);
    const snapshot = await pending;
    expect(snapshot.indicators.sp500?.observedAtPrecision).toBe('session_close');
    expect(evaluateMarketAssessmentSnapshot(snapshot).verdict).toBe('NORMAL');
  });
  it('falls back from stale upstream prices to dated independent sources', async () => {
    vi.stubGlobal('fetch', providerMock({ staleUs: true }));
    const snapshot = await getKisMarketAssessmentSnapshot();
    expect(snapshot.indicators.sp500?.observedAt).not.toContain('2026-08-01');
    expect(evaluateMarketAssessmentSnapshot(snapshot).verdict).toBe('NORMAL');
  });

  it.each([
    ['Sep 23, 6:31:19 AM UTC', '2026-09-23T06:31:19.000Z'],
    ['Sep 23, 6:29:19 AM UTC', '2026-09-23T06:29:19.000Z'],
    ['Sep 22, 4:36:35 PM GMT-4', '2026-09-22T20:36:35.000Z'],
    ['Sep 22, 4:36:45 PM GMT-4', '2026-09-22T20:36:45.000Z'],
    ['Sep 22, 5:15:59 PM GMT-4', '2026-09-22T21:15:59.000Z'],
    ['Sep 22, 4:36:35 PM GMT-4 · INDEXSP', '2026-09-22T20:36:35.000Z'],
    ['Sep 22, 4:36:35 PM GMT-04:30', '2026-09-22T21:06:35.000Z'],
    ['Closed: Jun 16, 7:59:48 PM GMT-4', '2026-06-16T23:59:48.000Z'],
    ['Sep 23, 6:31:19 AM UTC+5:30', '2026-09-23T01:01:19.000Z'],
  ])('parses Serp Finance quote time %s', (value, expected) => {
    expect(parseSerpFinanceObservedAt(value, '2026-09-23T06:40:00.000Z')).toBe(expected);
  });
  it('parses a zero-padded hour with a UTC offset', () => {
    expect(parseSerpFinanceObservedAt('Oct 17, 04:27:10 PM UTC-4', '2026-10-18T00:00:00.000Z')).toBe('2026-10-17T20:27:10.000Z');
  });
  it('uses the prior UTC year when a yearless Serp quote would be in the future', () => {
    expect(parseSerpFinanceObservedAt('Dec 31, 11:59:00 PM UTC', '2027-01-01T00:02:00.000Z')).toBe('2026-12-31T23:59:00.000Z');
  });
  it('uses the next local year when its timezone places the quote near the fetch time', () => {
    expect(parseSerpFinanceObservedAt('Jan 1, 12:01:00 AM GMT+14', '2026-12-31T10:02:00.000Z')).toBe('2026-12-31T10:01:00.000Z');
  });
  it.each([
    'Sep 23 2026, 06:37:19 AM UTC', 'Sep 23, 6:31 AM UTC', 'Sep 23, 13:31:19 PM UTC',
    'Sep 31, 6:31:19 AM UTC', 'Feb 29, 6:31:19 AM UTC', 'Sep 23, 6:31:19 AM GMT-4:60',
    'Sep 23, 6:31:19 AM GMT+14:30', 'Sep 23, 6:31:19 AM GMT+15',
    'Sep 23, 6:31:19 AM GMT',
    'Sep 23, 6:31:19 AM UTC trailing',
  ])('leaves malformed Serp quote time undated: %s', value => {
    expect(parseSerpFinanceObservedAt(value, '2026-09-23T06:40:00.000Z')).toBeNull();
  });
  it('uses the extension alongside the Serp FX price, ignoring summary.date', async () => {
    vi.setSystemTime(new Date('2026-09-23T06:40:00.000Z'));
    vi.stubGlobal('fetch', providerMock({ serpFinance: { 'USD-KRW': { summary: {
      price: '1358.51', date: 'Sep 23 2026, 06:37:19 AM UTC', extensions: ['Sep 23, 6:31:19 AM UTC'],
      price_movement: { value: 0, percentage: 0 },
    } } } }));
    const quote = (await getKisMarketAssessmentSnapshot()).indicators.usdKrw;
    expect(quote?.source).toBe('SERP_API');
    expect(quote?.price).toBe(1358.51);
    expect(quote?.observedAt).toBe('2026-09-23T06:31:19.000Z');
  });
  it('selects fresh Naver FX when the Serp quote is older than 45 minutes', async () => {
    vi.setSystemTime(new Date('2026-09-23T16:30:00+09:00'));
    const base = providerMock({ serpFinance: { 'USD-KRW': { summary: {
      price: '1358', extensions: ['Sep 23, 6:31:00 AM UTC'], price_movement: { value: 0, percentage: 0 },
    } } } });
    vi.stubGlobal('fetch', vi.fn<typeof fetch>((url, init) => {
      const u = new URL(String(url));
      if (u.hostname === 'finance.naver.com' && u.searchParams.get('marketindexCd') === 'FX_USDKRW') {
        return Promise.resolve(new Response('<p class="no_today"><em><span class="no1"></span><span class="no3"></span><span class="no5"></span><span class="no8"></span></em></p><p class="no_exday"><em><span class="no0"></span></em><em>(0%)</em></p><div class="exchange_info"><span class="date">2026.09.23 16:25</span></div>'));
      }
      return base(url, init);
    }));
    const quote = (await getKisMarketAssessmentSnapshot()).indicators.usdKrw;
    expect(quote?.source).toBe('NAVER_FINANCE');
    expect(quote?.observedAt).toBe('2026-09-23T07:25:00.000Z');
  });

  it('retries one transient Serp Finance no-results error and keeps the successful quote', async () => {
    vi.setSystemTime(new Date('2026-09-23T06:40:00.000Z'));
    const base = providerMock({ serpFinance: { 'USD-KRW': { summary: {
      price: '1358.51', extensions: ['Sep 23, 6:31:19 AM UTC'], price_movement: { value: 0, percentage: 0 },
    } } } });
    let attempts = 0;
    vi.stubGlobal('fetch', vi.fn<typeof fetch>((url, init) => {
      const u = new URL(String(url));
      if (u.hostname === 'serpapi.com' && u.searchParams.get('q') === 'USD-KRW' && ++attempts === 1) {
        return Promise.resolve(json({ error: "Google Finance hasn't returned any results for this query." }));
      }
      return base(url, init);
    }));
    expect((await getKisMarketAssessmentSnapshot()).indicators.usdKrw?.price).toBe(1358.51);
    expect(attempts).toBe(2);
  });
  it('propagates a second no-results error to the existing FX fallback', async () => {
    const base = providerMock();
    let attempts = 0;
    vi.stubGlobal('fetch', vi.fn<typeof fetch>((url, init) => {
      const u = new URL(String(url));
      if (u.hostname === 'serpapi.com' && u.searchParams.get('q') === 'USD-KRW') {
        attempts += 1;
        return Promise.resolve(json({ error: "Google Finance hasn't returned any results for this query." }));
      }
      return base(url, init);
    }));
    await getKisMarketAssessmentSnapshot();
    expect(attempts).toBe(2);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("USD/KRW primary 수집 실패: SerpAPI request failed: Google Finance hasn't returned any results for this query."));
  });
  it('does not retry other Serp Finance errors', async () => {
    const base = providerMock();
    let attempts = 0;
    vi.stubGlobal('fetch', vi.fn<typeof fetch>((url, init) => {
      const u = new URL(String(url));
      if (u.hostname === 'serpapi.com' && u.searchParams.get('q') === 'USD-KRW') {
        attempts += 1;
        return Promise.resolve(json({ error: 'temporary upstream error' }));
      }
      return base(url, init);
    }));
    await getKisMarketAssessmentSnapshot();
    expect(attempts).toBe(1);
  });
  it('does not retry no-results errors from index Serp fallback', async () => {
    const base = providerMock({ brokenUs: true });
    let attempts = 0;
    vi.stubGlobal('fetch', vi.fn<typeof fetch>((url, init) => {
      const u = new URL(String(url));
      if (u.hostname === 'serpapi.com' && u.searchParams.get('q') === '.INX:INDEXSP') {
        attempts += 1;
        return Promise.resolve(json({ error: "Google Finance hasn't returned any results for this query." }));
      }
      return base(url, init);
    }));
    await getKisMarketAssessmentSnapshot();
    expect(attempts).toBe(1);
  });
  it('stops Serp event calls after its first timeout while Naver continues', async () => {
    vi.stubEnv('NAVER_CLIENT_ID', 'test-id');
    vi.stubEnv('NAVER_CLIENT_SECRET', 'test-secret');
    const base = providerMock();
    const fetch = vi.fn<typeof globalThis.fetch>((url, init) => {
      const u = new URL(String(url));
      if (u.hostname === 'serpapi.com' && u.searchParams.get('engine') === 'google') {
        if (u.searchParams.get('q')?.startsWith('tariff')) return Promise.reject(new DOMException('This operation was aborted', 'AbortError'));
        return Promise.resolve(json({ organic_results: [{ title: u.searchParams.get('q'), link: 'https://source.example/story' }] }));
      }
      if (u.hostname === 'openapi.naver.com') return Promise.resolve(json({ total: 2, items: ['a', 'b'].map(domain => ({
        title: u.searchParams.get('query'), originallink: `https://${domain}.example/story`, pubDate: RISK_NOW,
      })) }));
      return base(url, init);
    });
    vi.stubGlobal('fetch', fetch);
    const events = (await getKisMarketAssessmentSnapshot()).events;
    expect(events.tariffs.evidence).toHaveLength(2);
    expect(events.tariffs.evidence.every(item => item.startsWith('[NAVER:'))).toBe(true);
    expect(events.tariffs.detected).toBe(false);
    for (const key of ['geopolitics', 'centralBankSurprise', 'financialInstitutionFailure', 'pandemic'] as const) {
      expect(events[key].detected).toBe(false);
      expect(events[key].evidence).toHaveLength(2);
      expect(events[key].evidence.every(item => item.startsWith('[NAVER:'))).toBe(true);
    }
    expect(fetch.mock.calls.filter(([url]) => {
      const u = new URL(String(url));
      return u.hostname === 'serpapi.com' && u.searchParams.get('engine') === 'google';
    })).toHaveLength(1);
    expect(fetch.mock.calls.filter(([url]) => new URL(String(url)).hostname === 'openapi.naver.com')).toHaveLength(5);
    expect(vi.mocked(console.warn).mock.calls.filter(([message]) => String(message).includes('Serp event signals 수집 실패'))).toEqual([
      [expect.stringContaining('tariffs Serp event signals 수집 실패: This operation was aborted')],
    ]);
  });
  it('stops Naver event calls after its first failure while Serp continues', async () => {
    vi.stubEnv('NAVER_CLIENT_ID', 'test-id');
    vi.stubEnv('NAVER_CLIENT_SECRET', 'test-secret');
    const base = providerMock();
    const fetch = vi.fn<typeof globalThis.fetch>((url, init) => {
      const u = new URL(String(url));
      if (u.hostname === 'openapi.naver.com') return Promise.reject(new Error('Naver unavailable'));
      if (u.hostname === 'serpapi.com' && u.searchParams.get('engine') === 'google') {
        return Promise.resolve(json({ organic_results: [{ title: u.searchParams.get('q'), link: 'https://source.example/story' }] }));
      }
      return base(url, init);
    });
    vi.stubGlobal('fetch', fetch);
    const events = (await getKisMarketAssessmentSnapshot()).events;
    expect(fetch.mock.calls.filter(([url]) => new URL(String(url)).hostname === 'openapi.naver.com')).toHaveLength(1);
    expect(fetch.mock.calls.filter(([url]) => {
      const u = new URL(String(url));
      return u.hostname === 'serpapi.com' && u.searchParams.get('engine') === 'google';
    })).toHaveLength(5);
    expect(events.tariffs.evidence).toHaveLength(1);
    expect(events.pandemic.evidence).toHaveLength(1);
    expect(vi.mocked(console.warn).mock.calls.filter(([message]) => String(message).includes('Naver event signals 수집 실패'))).toEqual([
      [expect.stringContaining('tariffs Naver event signals 수집 실패: Naver unavailable')],
    ]);
  });
  it('starts no further event calls once the 30-second budget is exhausted', async () => {
    vi.stubEnv('NAVER_CLIENT_ID', 'test-id');
    vi.stubEnv('NAVER_CLIENT_SECRET', 'test-secret');
    const base = providerMock();
    const fetch = vi.fn<typeof globalThis.fetch>((url, init) => {
      const u = new URL(String(url));
      if (u.hostname === 'serpapi.com' && u.searchParams.get('engine') === 'google') {
        vi.setSystemTime(new Date(Date.now() + 30_000));
        return Promise.resolve(json({ organic_results: [{ title: u.searchParams.get('q'), link: 'https://source.example/story' }] }));
      }
      return base(url, init);
    });
    vi.stubGlobal('fetch', fetch);
    const events = (await getKisMarketAssessmentSnapshot()).events;
    expect(fetch.mock.calls.filter(([url]) => {
      const u = new URL(String(url));
      return u.hostname === 'serpapi.com' && u.searchParams.get('engine') === 'google';
    })).toHaveLength(1);
    expect(fetch.mock.calls.filter(([url]) => new URL(String(url)).hostname === 'openapi.naver.com')).toHaveLength(0);
    expect(events.tariffs.evidence).toHaveLength(1);
    expect(events.geopolitics.evidence).toHaveLength(0);
    expect(events.pandemic.evidence).toHaveLength(0);
  });
  it('keeps all five Serp and Naver event calls when both providers succeed', async () => {
    vi.stubEnv('NAVER_CLIENT_ID', 'test-id');
    vi.stubEnv('NAVER_CLIENT_SECRET', 'test-secret');
    const base = providerMock();
    const fetch = vi.fn<typeof globalThis.fetch>((url, init) => {
      const u = new URL(String(url));
      if (u.hostname === 'serpapi.com' && u.searchParams.get('engine') === 'google') {
        return Promise.resolve(json({ organic_results: [{ title: u.searchParams.get('q'), link: 'https://source.example/story' }] }));
      }
      if (u.hostname === 'openapi.naver.com') return Promise.resolve(json({ total: 2, items: ['a', 'b'].map(domain => ({
        title: u.searchParams.get('query'), originallink: `https://${domain}.example/story`, pubDate: RISK_NOW,
      })) }));
      return base(url, init);
    });
    vi.stubGlobal('fetch', fetch);
    const events = (await getKisMarketAssessmentSnapshot()).events;
    expect(fetch.mock.calls.filter(([url]) => {
      const u = new URL(String(url));
      return u.hostname === 'serpapi.com' && u.searchParams.get('engine') === 'google';
    })).toHaveLength(5);
    expect(fetch.mock.calls.filter(([url]) => new URL(String(url)).hostname === 'openapi.naver.com')).toHaveLength(5);
    expect(events.tariffs.detected).toBe(true);
    expect(events.pandemic.detected).toBe(true);
  });
  it('propagates the snapshot deadline during an event call', async () => {
    vi.stubEnv('NAVER_CLIENT_ID', 'test-id');
    vi.stubEnv('NAVER_CLIENT_SECRET', 'test-secret');
    const deadline = new AbortController();
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(deadline.signal);
    const base = providerMock();
    const fetch = vi.fn<typeof globalThis.fetch>((url, init) => {
      const u = new URL(String(url));
      if (u.hostname === 'serpapi.com' && u.searchParams.get('engine') === 'google') {
        deadline.abort();
        return Promise.reject(new DOMException('This operation was aborted', 'AbortError'));
      }
      return base(url, init);
    });
    vi.stubGlobal('fetch', fetch);
    const snapshot = await getKisMarketAssessmentSnapshot();
    expect(snapshot.degradedSources).toContain('snapshot deadline exceeded; partial data only');
    expect(snapshot.events.tariffs.evidence).toHaveLength(0);
    expect(snapshot.events.pandemic.evidence).toHaveLength(0);
    expect(fetch.mock.calls.filter(([url]) => new URL(String(url)).hostname === 'openapi.naver.com')).toHaveLength(0);
    expect(vi.mocked(console.warn).mock.calls.filter(([message]) => String(message).includes('Serp event signals 수집 실패'))).toHaveLength(0);
  });
});
