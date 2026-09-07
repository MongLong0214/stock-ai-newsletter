import { describe, expect, it } from 'vitest';
import { evaluateMarketAssessmentSnapshot as evaluate, calculateCrashScore, getVixRegime } from '../kis-market-assessment';
import { parseKisObservedAt, parseObservedAt, quoteQuality } from '../market-assessment-policy';
import { riskSnapshot, riskQuote, RISK_NOW } from './market-risk-fixture';

describe('market risk v2: timestamps, missing data and warning policy', () => {
  it('returns NORMAL only with adequate dated price coverage', () => {
    const e = evaluate(riskSnapshot());
    expect(e.verdict).toBe('NORMAL');
    expect(e.dataQuality.status).not.toBe('unavailable');
    expect(e.confidence).toBe(e.dataQuality.score);
  });
  it('does not use newly fetched but undated observations as fresh', () => {
    const s = riskSnapshot();
    for (const q of Object.values(s.indicators)) if (q) q.observedAt = null;
    const e = evaluate(s);
    expect(e.verdict).toBe('UNAVAILABLE');
    expect(e.crashScore).toBe(0);
    expect(e.dataQuality.score).toBe(0);
  });
  it.each([Number.NaN, Infinity, -Infinity])('rejects nonfinite percentage %s', pct => {
    const s = riskSnapshot();
    s.indicators.sp500!.changePct = pct;
    s.indicators.nasdaqComposite!.changePct = pct;
    expect(evaluate(s).verdict).toBe('UNAVAILABLE');
  });
  it('does not lower a verified severe warning for missing corroborating feeds', () => {
    const s = riskSnapshot();
    s.indicators.sp500 = riskQuote('S&P 500', -7);
    for (const key of ['dowJones', 'nasdaqComposite', 'vix', 'usdKrw'] as const) s.indicators[key] = null;
    const e = evaluate(s);
    expect(e.verdict).toBe('CRASH_ALERT');
    expect(e.severity).toBe('critical');
    expect(e.confidence).toBeLessThan(70);
    expect(e.dataQuality.status).toBe('unavailable');
  });
  it.each(['kospi', 'kosdaq'] as const)('detects Korea-only %s collapse without US selling or event keywords', key => {
    const s = riskSnapshot();
    s.indicators[key] = riskQuote(key, -5, true);
    expect(evaluate(s).reasonCodes).toContain('KOREA_SEVERE_DROP');
    expect(evaluate(s).severity).toBe('critical');
  });
  it('detects broad US selling even when S&P itself misses the threshold', () => {
    const s = riskSnapshot();
    s.indicators.dowJones = riskQuote('Dow', -2.6);
    s.indicators.nasdaqComposite = riskQuote('NASDAQ', -2.6);
    expect(evaluate(s).reasonCodes).toContain('US_BROAD_SELL_OFF');
  });
  it('retains a dated local decline when the US market rebounds', () => {
    const s = riskSnapshot();
    s.indicators.kospi = riskQuote('KOSPI', -4, true);
    s.indicators.sp500 = riskQuote('S&P 500', 2);
    s.indicators.nasdaqComposite = riskQuote('NASDAQ', 2);
    expect(evaluate(s).verdict).toBe('CRASH_ALERT');
  });
  it('excludes stale crash quotes and preserves valid local spot fallback', () => {
    const s = riskSnapshot();
    s.indicators.kospi200MiniFutures = { ...s.indicators.kospi200MiniFutures!, ...riskQuote('Mini', -8, true), observedAt: '2026-08-01T15:45:00+09:00' };
    const e = evaluate(s);
    expect(e.verdict).toBe('NORMAL');
    expect(e.effectiveKoreaIndicator?.code).toBe('KOSPI');
    expect(e.dataQuality.indicators.kospi200MiniFutures).toBe('stale');
  });
  it('does not infer a night session merely from a quote or volume', () => {
    const s = riskSnapshot();
    s.nightSession.kospiMiniFutures = { ...s.indicators.kospi200MiniFutures!, ...riskQuote('Fake night', -8, true) };
    expect(evaluate(s).verdict).toBe('NORMAL');
    expect(evaluate(s).dataQuality.indicators.nightFutures).toBe('invalid');
  });
  it('uses a dated, explicit night session', () => {
    const s = riskSnapshot();
    s.nightSession.kospiMiniFutures = { ...s.indicators.kospi200MiniFutures!, ...riskQuote('Night', -4, true), session: 'night', observedAt: '2026-09-09T05:00:00+09:00' };
    expect(evaluate(s).verdict).toBe('CRASH_ALERT');
  });
  it.each([24.99, 25, 34.99, 35, 49.99, 50, 80])('VIX contribution is monotonic at %s', price => {
    const s = riskSnapshot();
    s.indicators.vix!.price = price;
    const before = evaluate(s).crashScore;
    s.indicators.vix!.price = price + 0.01;
    expect(evaluate(s).crashScore).toBeGreaterThanOrEqual(before);
  });
  it('high but declining VIX retains volatility stress; VIX alone never predicts direction', () => {
    const s = riskSnapshot();
    s.indicators.vix = { ...riskQuote('VIX'), price: 60, change: -6, changePct: -6 / 66 * 100 };
    const e = evaluate(s);
    expect(e.signalDetails.find(x => x.name === 'VIX')!.contribution).toBeGreaterThan(0);
    expect(e.verdict).toBe('NORMAL');
  });
  it('keyword matches and sell rankings alone do not cast crash votes', () => {
    const s = riskSnapshot();
    for (const event of Object.values(s.events)) event.detected = true;
    s.supplementary.foreignerNetSelling = { date: null, dominantStock: null, topRows: [], topSellAmountMillion: 10_000_000, topSellQuantityK: 0, fetchedAt: RISK_NOW, source: 'NAVER_FINANCE' };
    expect(evaluate(s).crashScore).toBe(0);
    expect(evaluate(s).verdict).toBe('NORMAL');
  });
  it('excludes conflicting sources instead of using the first answer', () => {
    const s = riskSnapshot();
    s.indicators.sp500 = { ...riskQuote('S&P 500', -9), sourceConflict: true };
    expect(evaluate(s).verdict).toBe('NORMAL');
    expect(evaluate(s).dataQuality.indicators.sp500).toBe('conflict');
  });
  it('detects a frozen quote during an open Korean session', () => {
    const now = Date.parse('2026-09-09T14:00:00+09:00');
    const q = { ...riskQuote('KOSPI', 0, true), observedAt: '2026-09-09T09:00:00+09:00', fetchedAt: new Date(now).toISOString() };
    expect(quoteQuality(q, now, true)).toBe('stale');
  });
  it('accepts Friday completed US session at Monday Korea premarket', () => {
    const now = Date.parse('2026-09-07T06:00:00+09:00');
    const q = { ...riskQuote('S&P 500'), observedAt: '2026-09-04T16:15:00-04:00', fetchedAt: new Date(now).toISOString() };
    expect(quoteQuality(q, now)).toBe('usable');
    expect(quoteQuality({ ...q, observedAt: '2026-09-03T16:15:00-04:00' }, now)).toBe('stale');
  });
  it('rejects a future observation and stale retrieval', () => {
    const now = Date.parse(RISK_NOW);
    expect(quoteQuality({ ...riskQuote('S&P 500'), observedAt: new Date(now + 3_600_000).toISOString() }, now)).toBe('invalid');
    expect(quoteQuality({ ...riskQuote('S&P 500'), fetchedAt: new Date(now - 660_000).toISOString() }, now)).toBe('stale');
  });
  it('accepts Friday US close after the Monday Labor Day holiday', () => {
    const now = Date.parse('2026-09-08T06:00:00+09:00');
    const q = { ...riskQuote('S&P 500'), observedAt: '2026-09-04T16:15:00-04:00', fetchedAt: new Date(now).toISOString() };
    expect(quoteQuality(q, now)).toBe('usable');
  });
  it('accepts the scheduled 13:00 US early close at Korean premarket', () => {
    const now = Date.parse('2026-11-28T06:00:00+09:00');
    const q = { ...riskQuote('S&P 500'), observedAt: '2026-11-27T13:00:00-05:00', fetchedAt: new Date(now).toISOString() };
    expect(quoteQuality(q, now)).toBe('usable');
  });
  it('parses provider times across US daylight saving and Korean HTML', () => {
    expect(parseKisObservedAt('20260908', '160000', 'America/New_York')).toBe('2026-09-08T20:00:00.000Z');
    expect(parseKisObservedAt('20260108', '160000', 'America/New_York')).toBe('2026-01-08T21:00:00.000Z');
    expect(parseObservedAt('2026.09.08. 16:15', 'America/New_York')).toBe('2026-09-08T20:15:00.000Z');
    expect(parseObservedAt('2026.09.09 05:30', 'Asia/Seoul')).toBe('2026-09-08T20:30:00.000Z');
    expect(parseObservedAt('unknown', 'Asia/Seoul')).toBeNull();
    expect(parseObservedAt('2026-02-30T12:00:00Z', 'Asia/Seoul')).toBeNull();
    expect(parseObservedAt('2026-09-08T20:15:00.123Z', 'America/New_York')).toBe('2026-09-08T20:15:00.123Z');
  });
  it('does not mutate the raw snapshot while excluding invalid feeds', () => {
    const s = riskSnapshot();
    s.indicators.vix!.price = Number.NaN;
    const copy = structuredClone(s);
    evaluate(s);
    expect(s).toEqual(copy);
    expect(calculateCrashScore(s, 'mixed', getVixRegime(null)).crashScore).toBeGreaterThanOrEqual(0);
  });
});
