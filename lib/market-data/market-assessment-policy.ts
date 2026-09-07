import { fromZonedTime } from 'date-fns-tz';
import { isKoreanTradingDate } from '@/lib/tli/trading-calendar';
import { getUsSessionCloseTime, hasUsMarketCalendar, isUsTradingDate } from './us-market-calendar';
import type { MarketAssessmentSnapshot, MarketIndicatorSnapshot } from './kis-market-assessment';

export const MARKET_RISK_POLICY_VERSION = '2026-09-07.v2';
export const MAX_MARKET_OBSERVATION_AGE_MS = 10 * 60_000;
export type MarketRiskVerdict = 'NORMAL' | 'CRASH_ALERT' | 'UNAVAILABLE';
export type QuoteQuality = 'usable' | 'missing' | 'invalid' | 'undated' | 'stale' | 'conflict' | 'calendar_unknown';
export interface MarketDataQuality {
  status: 'complete' | 'degraded' | 'unavailable';
  /** Coverage of usable observations, NOT a probability or prediction confidence. */
  score: number;
  indicators: Record<string, QuoteQuality>;
  issues: string[];
}

export class MarketAssessmentUnavailableError extends Error {
  readonly code = 'MARKET_ASSESSMENT_UNAVAILABLE';
  constructor(message: string) {
    super(`시장 판정 불가: ${message}. NORMAL 처리 및 종목 추천을 중단합니다.`);
    this.name = 'MarketAssessmentUnavailableError';
  }
}

/** Provider local time -> UTC, including US daylight saving time. Never use fetch time. */
export function parseObservedAt(value: string | undefined, timeZone: string): string | null {
  if (!value?.trim()) return null;
  const normalized = value.trim().replace(/^(\d{4})\.(\d{2})\.(\d{2})\.?\s*/, '$1-$2-$3T').replace(' ', 'T');
  const parts = normalized.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:[+-]\d{2}:\d{2}|Z)?$/);
  if (!parts || +parts[4] > 23 || +parts[5] > 59 || +(parts[6] ?? '0') > 59) return null;
  const calendarDate = new Date(Date.UTC(+parts[1], +parts[2] - 1, +parts[3]));
  if (calendarDate.toISOString().slice(0, 10) !== normalized.slice(0, 10)) return null;
  const date = /(?:Z|[+-]\d{2}:\d{2})$/.test(normalized)
    ? new Date(normalized) : fromZonedTime(normalized, timeZone);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export function parseKisObservedAt(date: string | undefined, time: string | undefined, zone: string): string | null {
  if (!date || !time || !/^\d{8}$/.test(date) || !/^\d{6}$/.test(time)) return null;
  return parseObservedAt(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4, 6)}`, zone);
}

function localDate(at: number, zone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

// Session-aware bounded age, including scheduled holidays and early closes.
function isStale(observed: number, now: number, korea: boolean, session: 'day' | 'night' | undefined): boolean {
  if (now - observed > 10 * 86_400_000) return true;
  const zone = korea ? 'Asia/Seoul' : 'America/New_York';
  const current = localDate(now, zone);
  const observedDate = localDate(observed, zone);
  const currentTime = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
  const isSessionDay = (date: string) => korea ? isKoreanTradingDate(date) : isUsTradingDate(date);
  const closeAt = (date: string) => fromZonedTime(`${date}T${korea ? '15:45' : getUsSessionCloseTime(date)}:00`, zone).getTime();
  if (isSessionDay(current) && currentTime >= (korea ? '09:10' : '09:45')) {
    if (observedDate !== current) return true;
    // Do not accept a frozen opening tick or a morning tick after the close.
    const close = closeAt(current);
    return Math.min(now, close) - observed > 45 * 60_000;
  }
  let cursor = new Date(`${current}T12:00:00Z`);
  for (let i = 0; i < 10; i++) {
    cursor = new Date(cursor.getTime() - 86_400_000);
    const day = cursor.toISOString().slice(0, 10);
    if (isSessionDay(day)) {
      const close = closeAt(day);
      // At premarket, the latest completed session is allowed, including weekends.
      return observed < close - 45 * 60_000 || (session === 'night' && now - observed > 18 * 3_600_000);
    }
  }
  return true;
}

export function quoteQuality(indicator: MarketIndicatorSnapshot | null | undefined, now: number, korea = false): QuoteQuality {
  if (!indicator) return 'missing';
  if (![indicator.price, indicator.change, indicator.changePct].every(Number.isFinite)
    || indicator.price <= 0 || indicator.price - indicator.change <= 0 || indicator.changePct <= -100
    || (Math.abs(indicator.changePct) > 0.05 && Math.sign(indicator.change) !== Math.sign(indicator.changePct))) return 'invalid';
  const impliedPct = indicator.change / (indicator.price - indicator.change) * 100;
  if (Math.abs(impliedPct - indicator.changePct) > 0.15) return 'invalid';
  if (indicator.sourceConflict) return 'conflict';
  const observed = Date.parse(indicator.observedAt ?? '');
  const fetched = Date.parse(indicator.fetchedAt);
  if (!Number.isFinite(observed)) return 'undated';
  if (!Number.isFinite(now) || !Number.isFinite(fetched) || observed > now + 5 * 60_000 || fetched > now + 5 * 60_000) return 'invalid';
  if (!korea && !hasUsMarketCalendar(localDate(now, 'America/New_York'))) return 'calendar_unknown';
  if (now - fetched > MAX_MARKET_OBSERVATION_AGE_MS || isStale(observed, now, korea, indicator.session)) return 'stale';
  return 'usable';
}

export function assessMarketDataQuality(snapshot: MarketAssessmentSnapshot, now: number) {
  const entries: Array<[string, MarketIndicatorSnapshot | null | undefined, boolean]> = [
    ['sp500', snapshot.indicators.sp500, false], ['dowJones', snapshot.indicators.dowJones, false],
    ['nasdaqComposite', snapshot.indicators.nasdaqComposite, false],
    ['kospi200MiniFutures', snapshot.indicators.kospi200MiniFutures, true],
    ['nightFutures', snapshot.nightSession.kospiMiniFutures, true],
    ['kospi', snapshot.indicators.kospi, true], ['kosdaq', snapshot.indicators.kosdaq, true],
    ['vix', snapshot.indicators.vix, false], ['usdKrw', snapshot.indicators.usdKrw, true],
    ['usdJpy', snapshot.indicators.usdJpy, true],
  ];
  const indicators = Object.fromEntries(entries.map(([key, value, korea]) => [key, quoteQuality(value, now, korea)]));
  // The old price-difference/volume heuristic cannot authenticate a night session.
  if (snapshot.nightSession.kospiMiniFutures && snapshot.nightSession.kospiMiniFutures.session !== 'night') indicators.nightFutures = 'invalid';
  const usable = (key: string) => indicators[key] === 'usable';
  const usCount = ['sp500', 'dowJones', 'nasdaqComposite'].filter(usable).length;
  const koreaAvailable = ['kospi200MiniFutures', 'nightFutures', 'kospi', 'kosdaq'].some(usable);
  const quality: MarketDataQuality = {
    status: usCount < 2 || !koreaAvailable ? 'unavailable' : entries.some(([key]) => !usable(key)) ? 'degraded' : 'complete',
    score: Math.round(entries.filter(([key]) => usable(key)).length / entries.length * 100),
    indicators,
    issues: entries.filter(([key]) => !usable(key)).map(([key]) => `${key}: ${indicators[key]}`),
  };
  const usableIndicators = Object.fromEntries(entries.filter(([key]) => usable(key)).map(([key, value]) => [key, value!])) as Record<string, MarketIndicatorSnapshot | undefined>;
  return { quality, usableIndicators };
}

/** Operational warning rules, not fitted probabilities or exchange halt declarations. */
export function decideMarketRisk(input: {
  crashScore: number;
  quality: MarketDataQuality;
  indicators: Record<string, MarketIndicatorSnapshot | undefined>;
}): { verdict: MarketRiskVerdict; reasons: string[]; severity: 'warning' | 'critical' } {
  const { indicators: i, quality, crashScore } = input;
  const us = [i.sp500, i.dowJones, i.nasdaqComposite].filter((x): x is MarketIndicatorSnapshot => !!x);
  const korea = [i.nightFutures ?? i.kospi200MiniFutures, i.kospi, i.kosdaq].filter((x): x is MarketIndicatorSnapshot => !!x);
  const reasons: string[] = [];
  if (i.sp500 && i.sp500.changePct <= -3) reasons.push('US_SP500_SEVERE_DROP');
  if (us.filter(x => x.changePct <= -2.5).length >= 2) reasons.push('US_BROAD_SELL_OFF');
  if (korea.some(x => x.changePct <= -3)) reasons.push('KOREA_SEVERE_DROP');
  if (us.some(x => x.changePct <= -1.5) && korea.some(x => x.changePct <= -1.5)) reasons.push('CROSS_MARKET_SELL_OFF');
  if (i.vix && i.vix.price >= 35 && [...us, ...korea].some(x => x.changePct <= -1.5)) reasons.push('VOLATILITY_WITH_SELL_OFF');
  if (crashScore >= 55 && [...us, ...korea].some(x => x.changePct <= -1.5)) reasons.push('COMPOSITE_RISK');
  const severe = (i.sp500?.changePct ?? 0) <= -5 || korea.some(x => x.changePct <= -5);
  return {
    verdict: reasons.length ? 'CRASH_ALERT' : quality.status === 'unavailable' ? 'UNAVAILABLE' : 'NORMAL',
    reasons: reasons.length ? reasons : quality.status === 'unavailable' ? ['INSUFFICIENT_US_OR_KOREA_DATA'] : ['NO_WARNING_RULE_TRIGGERED'],
    severity: severe ? 'critical' : 'warning',
  };
}
