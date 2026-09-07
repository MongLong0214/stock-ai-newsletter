import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { evaluateMarketAssessmentSnapshot, getKisMarketAssessmentSnapshot, resetKisMarketAssessmentCacheForTest } from '../kis-market-assessment';
import { RISK_NOW } from './market-risk-fixture';

const json = (data: unknown) => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
function providerMock(options: {
  brokenUs?: boolean; missingChange?: boolean; downSignMissing?: boolean;
  brokenSerp?: boolean; missingMini?: boolean; staleUs?: boolean; dowConflict?: boolean;
  missingDow?: boolean; invalidContract?: boolean; cboeVix?: boolean;
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
      return json(u.searchParams.get('engine') === 'google' ? { organic_results: [] } : {});
    }
    if (u.hostname === 'search.naver.com') return new Response(`<section class="_cs_stock"><span class="stk_nm">VIX</span><span class="spt_con"><strong>18</strong></span><span class="n_ch"><em>0</em><em>(0%)</em></span><p class="stk_info"><em>2026.09.08. 16:15</em></p></section>`);
    if (u.hostname === 'finance.naver.com' && u.pathname.includes('Detail')) return new Response(`<p class="no_today"><em><span class="no1"></span><span class="no0"></span><span class="no0"></span></em></p><p class="no_exday"><em><span class="no0"></span></em><em>(0%)</em></p><div class="exchange_info"><span class="date">2026.09.09 05:30</span></div>`);
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

  it('collects timestamped US and Korea spot prices without inventing a night session', async () => {
    const fetch = providerMock();
    vi.stubGlobal('fetch', fetch);
    const snapshot = await getKisMarketAssessmentSnapshot();
    expect(snapshot.indicators.sp500?.observedAt).toBe('2026-09-08T20:15:00.000Z');
    expect(snapshot.indicators.kospi?.observedAt).toBe('2026-09-08T06:45:00.000Z');
    expect(snapshot.indicators.kosdaq).not.toBeNull();
    expect(snapshot.indicators.kospi200MiniFutures?.observedAt).toBeNull();
    expect(snapshot.nightSession.kospiMiniFutures).toBeNull();
    expect(fetch.mock.calls.some(([url]) => String(url).includes('/inquire-price?'))).toBe(false);
    expect(evaluateMarketAssessmentSnapshot(snapshot).verdict).toBe('NORMAL');
  });
  it('selects an unexpired positive-price front-month contract', async () => {
    vi.stubGlobal('fetch', providerMock());
    expect((await getKisMarketAssessmentSnapshot()).indicators.kospi200MiniFutures?.code).toBe('NEAR');
    resetKisMarketAssessmentCacheForTest();
    vi.stubGlobal('fetch', providerMock({ invalidContract: true }));
    expect((await getKisMarketAssessmentSnapshot()).indicators.kospi200MiniFutures?.code).toBe('NEXT');
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
});
