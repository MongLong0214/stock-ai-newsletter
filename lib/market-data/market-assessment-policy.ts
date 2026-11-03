import { fromZonedTime } from 'date-fns-tz';
import { addKoreanTradingDays, isKoreanTradingDate } from '@/lib/tli/trading-calendar';
import { getUsSessionCloseTime, hasUsMarketCalendar, isUsTradingDate } from './us-market-calendar';
import type { MarketAssessmentSnapshot, MarketIndicatorSnapshot } from './kis-market-assessment';

export const MARKET_RISK_POLICY_VERSION = '2026-11-03.v6';
export const MAX_MARKET_OBSERVATION_AGE_MS = 10 * 60_000;
/**
 * FX(USD/KRW·USD/JPY) 관측 허용 시간.
 * WHY: Google Finance USD/KRW는 평일 06:00~06:15 KST(21:00~21:15Z)에 마지막으로 갱신된 뒤 한국 장 전까지 멈춘다.
 * 45분 창이면 06:50 backup Prepare가 같은 최신 시세를 41~52분 경과로 stale 처리했다(10/12~11/3 실측, 11/3 52분).
 * 90분은 backup 지연까지 덮고, 주말을 넘긴 금요일 시세(8시간+)는 그대로 stale로 남긴다.
 */
export const FX_MAX_OBSERVATION_AGE_MS = 90 * 60_000;
/** 두 FX 소스가 모두 usable일 때 이 시간 안의 관측을 우선한다(창 확대 전 v3 선택 동작 유지). */
export const FX_PREFERRED_OBSERVATION_AGE_MS = 45 * 60_000;
/** 시각이 다른 두 FX 시세는 최신을 택하되, 이 이상 벌어지면 데이터 오류로 보고 conflict로 남긴다. */
export const FX_MAX_CROSS_VENUE_GAP_PCT = 3;

/**
 * 서울외환시장(KMB) 원/달러 세션: 거래일 D 09:00 ~ D+1 02:00 KST (2024-07 연장).
 * 세션 종가 시세는 다음 세션이 열리기 전까지 가장 최신의 공식 시세다(월요일 아침의 금요일 세션 포함).
 */
export function kmbSessionCloseAt(sessionDate: string): number {
  const next = new Date(`${sessionDate}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return fromZonedTime(`${next.toISOString().slice(0, 10)}T02:00:00`, 'Asia/Seoul').getTime();
}

function isKmbSessionCloseStale(observed: number, now: number): boolean {
  // 종가 02:00 KST에서 3시간 빼면 세션 날짜 D가 된다.
  const sessionDate = localDate(observed - 3 * 3_600_000, 'Asia/Seoul');
  if (kmbSessionCloseAt(sessionDate) !== observed) return true;
  const nextOpen = fromZonedTime(`${addKoreanTradingDays(sessionDate, 1)}T09:00:00`, 'Asia/Seoul').getTime();
  return now >= nextOpen;
}
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

export function quoteQuality(indicator: MarketIndicatorSnapshot | null | undefined, now: number, korea: boolean | 'fx' = false): QuoteQuality {
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
  if (korea === false && !hasUsMarketCalendar(localDate(now, 'America/New_York'))) return 'calendar_unknown';
  if (now - fetched > MAX_MARKET_OBSERVATION_AGE_MS
    || (korea === 'fx'
      ? (indicator.observedAtPrecision === 'session_close' ? isKmbSessionCloseStale(observed, now) : now - observed > FX_MAX_OBSERVATION_AGE_MS)
      : isStale(observed, now, korea, indicator.session))) return 'stale';
  return 'usable';
}

export function assessMarketDataQuality(snapshot: MarketAssessmentSnapshot, now: number) {
  const entries: Array<[string, MarketIndicatorSnapshot | null | undefined, boolean | 'fx']> = [
    ['sp500', snapshot.indicators.sp500, false], ['dowJones', snapshot.indicators.dowJones, false],
    ['nasdaqComposite', snapshot.indicators.nasdaqComposite, false],
    ['kospi200MiniFutures', snapshot.indicators.kospi200MiniFutures, true],
    ['nightFutures', snapshot.nightSession.kospiMiniFutures, true],
    ['kospi', snapshot.indicators.kospi, true], ['kosdaq', snapshot.indicators.kosdaq, true],
    ['vix', snapshot.indicators.vix, false], ['usdKrw', snapshot.indicators.usdKrw, 'fx'],
    ['usdJpy', snapshot.indicators.usdJpy, 'fx'],
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
  quality: MarketDataQuality;
  indicators: Record<string, MarketIndicatorSnapshot | undefined>;
}): { verdict: MarketRiskVerdict; reasons: string[]; severity: 'warning' | 'critical' } {
  const { indicators: i, quality } = input;
  const us = [i.sp500, i.dowJones, i.nasdaqComposite].filter((x): x is MarketIndicatorSnapshot => !!x);
  const reasons: string[] = [];
  if (i.nightFutures && i.nightFutures.changePct <= -3) reasons.push('NIGHT_FUTURES_GAP_DOWN');
  if (i.sp500 && i.sp500.changePct <= -3) reasons.push('US_SP500_SEVERE_DROP');
  if (us.filter(x => x.changePct <= -2.5).length >= 2) reasons.push('US_BROAD_SELL_OFF');
  const severe = (i.sp500?.changePct ?? 0) <= -5 || (i.nightFutures?.changePct ?? 0) <= -5;
  return {
    verdict: reasons.length ? 'CRASH_ALERT' : quality.status === 'unavailable' ? 'UNAVAILABLE' : 'NORMAL',
    reasons: reasons.length ? reasons : quality.status === 'unavailable' ? ['INSUFFICIENT_US_OR_KOREA_DATA'] : ['NO_WARNING_RULE_TRIGGERED'],
    severity: severe ? 'critical' : 'warning',
  };
}
