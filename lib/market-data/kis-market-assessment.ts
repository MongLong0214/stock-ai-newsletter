import * as cheerio from 'cheerio';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Element } from 'domhandler';
import {
  getKisAccessToken,
  resetKisClientCacheForTest,
} from '@/app/archive/_utils/api/kis/client';
import { validateKisEnv } from '@/lib/_utils/env-validator';
import { getUsSessionCloseTime } from './us-market-calendar';
import {
  assessMarketDataQuality, decideMarketRisk, MARKET_RISK_POLICY_VERSION,
  parseKisObservedAt, parseObservedAt, quoteQuality,
  type MarketDataQuality, type MarketRiskVerdict,
} from './market-assessment-policy';

const FETCH_TIMEOUT_MS = 8_000;
const NAVER_INDEX_TIMEOUT_MS = 5_000;
const REQUEST_DELAY_MS = 350;
const SNAPSHOT_TTL_MS = 30_000;
const SNAPSHOT_TIMEOUT_MS = 90_000;
const EVENT_SIGNALS_BUDGET_MS = 30_000;
const snapshotRequestContext = new AsyncLocalStorage<AbortSignal>();
let snapshotInFlight: Promise<MarketAssessmentSnapshot> | null = null;

type KisConfig = ReturnType<typeof validateKisEnv>;

interface KisErrorResponse {
  rt_cd?: string;
  msg_cd?: string;
  msg1?: string;
}

interface SerpApiPriceMovement {
  value?: number;
  price?: number;
  percentage?: number;
  movement?: 'Up' | 'Down';
}

interface SerpApiFinanceAnswerBox {
  type?: string;
  exchange?: string;
  stock?: string;
  price?: number;
  price_movement?: SerpApiPriceMovement;
}

interface SerpApiFinanceResponse {
  summary?: {
    title?: string;
    price?: string;
    currency?: string;
    market?: string;
    price_movement?: SerpApiPriceMovement;
    extensions?: string[];
  };
  error?: string;
}

interface SerpApiOrganicResult {
  title?: string;
  snippet?: string;
  link?: string;
}

interface SerpApiSearchResponse {
  answer_box?: SerpApiFinanceAnswerBox;
  organic_results?: SerpApiOrganicResult[];
  error?: string;
}

interface NaverNewsItem {
  title: string;
  originallink?: string;
  link?: string;
  description?: string;
  pubDate: string;
}

interface NaverNewsResponse {
  total: number;
  items: NaverNewsItem[];
}

interface NaverCompareToPreviousPrice {
  code?: string;
  text?: string;
  name?: 'RISING' | 'FALLING' | 'UNCHANGED';
}

interface NaverDomesticIndexBasicResponse {
  stockEndType?: string;
  itemCode?: string;
  symbolCode?: string;
  stockName?: string;
  closePrice?: string;
  compareToPreviousClosePrice?: string;
  compareToPreviousPrice?: NaverCompareToPreviousPrice;
  fluctuationsRatio?: string;
  localTradedAt?: string;
}

interface NaverNationFuturesItem {
  reutersCode?: string;
  futuresName?: string;
  futuresNameEng?: string;
  localTradedAt?: string;
  closePrice?: string;
  compareToPreviousClosePrice?: string;
  compareToPreviousPrice?: NaverCompareToPreviousPrice;
  fluctuationsRatio?: string;
}

interface NaverNationIndexItem {
  reutersCode?: string;
  indexName?: string;
  indexNameEng?: string;
  localTradedAt?: string;
  closePrice?: string;
  compareToPreviousClosePrice?: string;
  compareToPreviousPrice?: NaverCompareToPreviousPrice;
  fluctuationsRatio?: string;
}

interface KisOverseasIndexOutput {
  hts_kor_isnm?: string;
  ovrs_nmix_prpr?: string;
  ovrs_nmix_prdy_vrss?: string;
  prdy_ctrt?: string;
}

interface KisOverseasIndexResponse extends KisErrorResponse {
  output1?: KisOverseasIndexOutput;
  output2?: Array<{ stck_bsop_date?: string; stck_cntg_hour?: string; optn_prpr?: string }>;
}

interface KisOverseasDailyChartRow {
  stck_bsop_date?: string;
  ovrs_nmix_prpr?: string;
}

interface KisOverseasDailyChartResponse extends KisErrorResponse {
  output2?: KisOverseasDailyChartRow[];
}

interface KisDomesticFuturesRow {
  futs_shrn_iscd?: string;
  hts_kor_isnm?: string;
  futs_prpr?: string;
  futs_prdy_vrss?: string;
  futs_prdy_ctrt?: string;
  hts_rmnn_dynu?: string;
}

interface KisDomesticFuturesResponse extends KisErrorResponse {
  output?: KisDomesticFuturesRow[];
}

interface KisMiniFuturesChartResponse extends KisErrorResponse {
  output1?: { futs_prdy_clpr?: string };
  output2?: Array<{ stck_bsop_date?: string; stck_cntg_hour?: string; futs_prpr?: string }>;
}

interface KisMiniFuturesPriceResponse extends KisErrorResponse {
  output1?: { futs_prpr?: string; futs_sdpr?: string };
}

type MarketIndicatorSource =
  | 'KIS'
  | 'CBOE'
  | 'SERP_API'
  | 'NAVER_FINANCE'
  | 'NAVER_STOCK_API'
  | 'NAVER_SEARCH'
  | 'MULTI_SOURCE';

type MarketIndicatorValidation = 'direct' | 'cross_checked' | 'single_source';

export interface MarketIndicatorSnapshot {
  code: string;
  label: string;
  source: MarketIndicatorSource;
  primarySource?: MarketIndicatorSource;
  price: number;
  change: number;
  changePct: number;
  validation: MarketIndicatorValidation;
  secondarySource?: Exclude<MarketIndicatorSource, 'KIS' | 'MULTI_SOURCE'> | null;
  fetchedAt: string;
  observedAt?: string | null;
  observedAtPrecision?: 'tick' | 'session_close';
  session?: 'day' | 'night';
  sourceConflict?: boolean;
}

export interface Kospi200MiniFuturesSnapshot extends MarketIndicatorSnapshot {
  contractName: string;
  remainingDays: number | null;
}

export interface MarketAssessmentSnapshot {
  fetchedAt: string;
  degradedSources?: string[];
  indicators: {
    sp500: MarketIndicatorSnapshot | null;
    dowJones: MarketIndicatorSnapshot | null;
    nasdaqComposite: MarketIndicatorSnapshot | null;
    kospi200MiniFutures: Kospi200MiniFuturesSnapshot | null;
    vix: MarketIndicatorSnapshot | null;
    usdKrw: MarketIndicatorSnapshot | null;
    usdJpy: MarketIndicatorSnapshot | null;
    kospi?: MarketIndicatorSnapshot | null;
    kosdaq?: MarketIndicatorSnapshot | null;
  };
  nightSession: {
    kospiMiniFutures: Kospi200MiniFuturesSnapshot | null;
    isPreMarketHours: boolean;
  };
  supplementary: {
    kospi200Futures: SearchIndicatorSnapshot | null;
    nikkeiFutures: SearchIndicatorSnapshot | null;
  };
  events: EventSignals;
}

export type ConfidenceLabel = 'warning' | 'strong' | 'critical';

export interface MarketAssessmentEvidence {
  policyVersion: string;
  verdict: MarketRiskVerdict;
  severity: 'warning' | 'critical';
  reasonCodes: string[];
  dataQuality: MarketDataQuality;
  effectiveKoreaIndicator: MarketIndicatorSnapshot | null;
  tier1Signals: string[];
  tier2Signals: string[];
  tier3Signals: string[];
  supportingNotes: string[];
  kospiDataStale: boolean;
  stalenessNote: string | null;
  crashScore: number;
  confidence: number;
  confidenceLabel: ConfidenceLabel;
  directionCoherence: DirectionCoherence;
  vixRegime: VixRegime;
  crossValidationRatio: number;
  signalDetails: SignalScoreDetail[];
}

export interface SearchIndicatorSnapshot {
  label: string;
  query: string;
  snippet: string;
  title: string;
  link: string | null;
  price: number | null;
  change: number | null;
  changePct: number | null;
  confirmed: boolean;
  proxy: boolean;
  fetchedAt: string;
  observedAt?: string | null;
  source: 'SERP_API' | 'NAVER_STOCK_API';
}

export interface EventSignal {
  detected: boolean;
  evidence: string[];
  sourceCount?: number;
}

export interface EventSignals {
  tariffs: EventSignal;
  geopolitics: EventSignal;
  centralBankSurprise: EventSignal;
  financialInstitutionFailure: EventSignal;
  pandemic: EventSignal;
}

const snapshotCache: { value: MarketAssessmentSnapshot | null; expiresAt: number } = {
  value: null,
  expiresAt: 0,
};

let configCache: KisConfig | null = null;
let serpDisabledReason: string | null = null;

function getConfig(): KisConfig {
  if (!configCache) {
    configCache = validateKisEnv();
  }

  return configCache;
}

function getSerpApiKey(): string {
  if (serpDisabledReason) {
    throw new Error(`SerpAPI disabled: ${serpDisabledReason}`);
  }
  const apiKey = process.env.SERP_API_KEY;

  if (!apiKey) {
    serpDisabledReason = 'serpapi: api key missing';
    throw new Error(`SerpAPI disabled: ${serpDisabledReason}`);
  }

  return apiKey;
}

function getNaverCredentials(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return null;
  }

  return { clientId, clientSecret };
}

function getRequestDelayMs(): number {
  return process.env.NODE_ENV === 'test' ? 0 : REQUEST_DELAY_MS;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestCooldown(): Promise<void> {
  if (snapshotRequestContext.getStore()?.aborted) return;
  const delayMs = getRequestDelayMs();
  if (delayMs > 0) {
    await delay(delayMs);
  }
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs = FETCH_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: AbortSignal.any([controller.signal, ...[options.signal, snapshotRequestContext.getStore()].filter((s): s is AbortSignal => !!s)]),
    });
    // Consume the body before clearing the timeout (fetch resolves at headers).
    const body = await response.arrayBuffer();
    return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
  } finally {
    clearTimeout(timeout);
  }
}

function parseKisError(data: unknown): string {
  if (data && typeof data === 'object') {
    const candidate = data as KisErrorResponse;
    if (candidate.msg1) return candidate.msg1;
    if (candidate.msg_cd) return candidate.msg_cd;
  }

  return 'Unknown KIS API error';
}

async function serpGet<T>(
  params: Record<string, string>,
  endpoint = 'https://serpapi.com/search.json'
): Promise<T> {
  const apiKey = getSerpApiKey();
  const url = `${endpoint}?${new URLSearchParams({ ...params, api_key: apiKey }).toString()}`;

  const response = await fetchWithTimeout(url, {
    method: 'GET',
  });

  let data: SerpApiSearchResponse = {};
  let responseBody = '';
  try {
    responseBody = await response.text();
    const parsed: unknown = JSON.parse(responseBody);
    if (typeof parsed !== 'object' || parsed === null) throw new Error('invalid SerpAPI JSON');
    data = parsed as SerpApiSearchResponse;
  } catch {
    if (/run out of searches/i.test(responseBody)) {
      serpDisabledReason = 'serpapi: quota exhausted';
    } else if (response.status === 401 || response.status === 403 || response.status === 429) {
      serpDisabledReason = `serpapi: HTTP ${response.status}`;
    }
    throw new Error(`SerpAPI request failed: HTTP ${response.status}`);
  }

  if (/run out of searches/i.test(responseBody)) {
    serpDisabledReason = 'serpapi: quota exhausted';
  } else if (response.status === 401 || response.status === 403 || response.status === 429) {
    serpDisabledReason = `serpapi: HTTP ${response.status}`;
  }

  if (!response.ok) {
    throw new Error(`SerpAPI request failed: HTTP ${response.status}`);
  }

  if (data.error) {
    throw new Error(`SerpAPI request failed: ${data.error}`);
  }

  return data as T;
}

async function kisGet<T>(path: string, params: Record<string, string>, trId: string): Promise<T> {
  const config = getConfig();
  const token = await getKisAccessToken();
  const url = `${config.KIS_BASE_URL}${path}?${new URLSearchParams(params).toString()}`;

  const response = await fetchWithTimeout(url, {
    headers: {
      'Content-Type': 'application/json',
      authorization: `Bearer ${token}`,
      appkey: config.KIS_APP_KEY,
      appsecret: config.KIS_APP_SECRET,
      tr_id: trId,
    },
  });

  if (!response.ok) {
    let message = `HTTP ${response.status}`;

    try {
      message = parseKisError(await response.json());
    } catch {
      // noop
    }

    throw new Error(`KIS request failed: ${message}`);
  }

  const data = (await response.json()) as KisErrorResponse;

  if (data.rt_cd && data.rt_cd !== '0') {
    throw new Error(`KIS request failed: ${parseKisError(data)}`);
  }

  return data as T;
}

function parseNumber(value: string | undefined): number {
  if (!value) return Number.NaN;

  const normalized = value.replace(/,/g, '').trim();
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return Number.NaN;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function formatKisDate(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}${values.month}${values.day}`;
}

function parseSignedMovement(movement: SerpApiPriceMovement | undefined): {
  change: number;
  changePct: number;
} {
  if (!movement) {
    return { change: Number.NaN, changePct: Number.NaN };
  }

  const sign = movement.movement === 'Down' ? -1 : 1;
  const rawChange =
    typeof movement.value === 'number' ? movement.value :
    typeof movement.price === 'number' ? movement.price :
    Number.NaN;
  const rawChangePct = typeof movement.percentage === 'number' ? movement.percentage : Number.NaN;

  return {
    change: sign * Math.abs(rawChange),
    changePct: sign * Math.abs(rawChangePct),
  };
}

function stripHtml(text: string): string {
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .trim();
}

function extractSourceDomain(link: string | undefined): string | null {
  if (!link) {
    return null;
  }

  try {
    const hostname = new URL(link).hostname.replace(/^www\./, '');
    return hostname || null;
  } catch {
    return null;
  }
}

function parseNaverDigitSpans($root: cheerio.Cheerio<Element>): number | null {
  const value = $root
    .find('span')
    .map((_, element) => {
      const className = element.attribs?.class ?? '';

      if (className === 'shim') return ',';
      if (className === 'jum') return '.';
      if (/^no\d$/.test(className)) return className.slice(2);
      return '';
    })
    .get()
    .join('');

  if (!value) {
    return null;
  }

  const parsed = parseNumber(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseSignedNaverApiNumber(
  value: string | undefined,
  compare: NaverCompareToPreviousPrice | undefined
): number {
  const parsed = parseNumber(value);

  if (!Number.isFinite(parsed)) {
    return Number.NaN;
  }

  if (!compare?.name) return parsed;
  if (compare.name === 'UNCHANGED') return parsed === 0 ? 0 : Number.NaN;
  if (compare.name === 'RISING' && parsed < 0) return Number.NaN;
  return (compare.name === 'FALLING' ? -1 : 1) * Math.abs(parsed);
}

function calculatePriceGapPct(referencePrice: number, comparisonPrice: number | null | undefined): number | null {
  if (!Number.isFinite(referencePrice) || !comparisonPrice || !Number.isFinite(comparisonPrice) || comparisonPrice <= 0) {
    return null;
  }

  return Math.abs(((comparisonPrice - referencePrice) / referencePrice) * 100);
}

function isMarketIndicatorConsistent(
  left: MarketIndicatorSnapshot,
  right: MarketIndicatorSnapshot,
  options: {
    priceTolerancePct?: number;
    changeTolerance?: number;
    changePctTolerance?: number;
  } = {}
): boolean {
  const priceTolerancePct = options.priceTolerancePct ?? 1;
  const changeTolerance = options.changeTolerance ?? 1;
  const changePctTolerance = options.changePctTolerance ?? 0.75;
  const priceGapPct = calculatePriceGapPct(left.price, right.price);
  const hasComparablePrice = typeof priceGapPct === 'number';
  const hasComparableChange = Number.isFinite(left.change) && Number.isFinite(right.change);
  const hasComparableChangePct = Number.isFinite(left.changePct) && Number.isFinite(right.changePct);

  const priceOk = hasComparablePrice && priceGapPct <= priceTolerancePct;
  const changeOk = hasComparableChange && Math.abs(left.change - right.change) <= changeTolerance;
  const changePctOk = hasComparableChangePct && Math.abs(left.changePct - right.changePct) <= changePctTolerance;

  if (left.sourceConflict || right.sourceConflict) return false;
  if (Math.abs(left.changePct) > 0.05 && Math.abs(right.changePct) > 0.05 && Math.sign(left.changePct) !== Math.sign(right.changePct)) return false;
  // Matching values from different sessions do not validate each other.
  if (!left.observedAt || !right.observedAt || Math.abs(Date.parse(left.observedAt) - Date.parse(right.observedAt)) > 45 * 60_000) return false;

  if (hasComparablePrice && hasComparableChange && hasComparableChangePct) {
    return priceOk && (changeOk || changePctOk);
  }

  if (hasComparablePrice && hasComparableChange) {
    return priceOk && changeOk;
  }

  if (hasComparablePrice && hasComparableChangePct) {
    return priceOk && changePctOk;
  }

  return priceOk || changeOk || changePctOk;
}

function assertPositivePrice(price: number, label: string): void {
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(`${label} returned an invalid price`);
  }
}

function withDirectValidation<T extends Omit<MarketIndicatorSnapshot, 'validation' | 'secondarySource'>>(
  indicator: T
): T & Pick<MarketIndicatorSnapshot, 'validation' | 'secondarySource'> {
  return {
    ...indicator,
    validation: 'direct',
    secondarySource: null,
  };
}

function withSingleSourceValidation(
  indicator: Omit<MarketIndicatorSnapshot, 'validation' | 'secondarySource'>
): MarketIndicatorSnapshot {
  return {
    ...indicator,
    validation: 'single_source',
    secondarySource: null,
  };
}

function withCrossValidation(
  indicator: MarketIndicatorSnapshot,
  secondarySource: Exclude<MarketIndicatorSource, 'KIS' | 'MULTI_SOURCE'>
): MarketIndicatorSnapshot {
  return {
    ...indicator,
    source: 'MULTI_SOURCE',
    primarySource: indicator.primarySource ?? indicator.source,
    validation: 'cross_checked',
    secondarySource,
  };
}

export type VixRegime = 'low' | 'normal' | 'elevated' | 'extreme';

const VIX_REGIME_BOUNDARIES: Array<{ max: number; regime: VixRegime }> = [
  { max: 15, regime: 'low' },
  { max: 25, regime: 'normal' },
  { max: 35, regime: 'elevated' },
];

const REGIME_MULTIPLIERS: Record<VixRegime, number> = {
  low: 1, normal: 1, elevated: 1, extreme: 1,
};

export function getVixRegime(vixPrice: number | null): VixRegime {
  if (vixPrice === null || !Number.isFinite(vixPrice)) return 'normal';
  for (const { max, regime } of VIX_REGIME_BOUNDARIES) {
    if (vixPrice < max) return regime;
  }
  return 'extreme';
}

export function getRegimeMultiplier(regime: VixRegime): number {
  return REGIME_MULTIPLIERS[regime];
}

export interface SignalScoreDetail {
  name: string;
  normalizedDrop: number;
  weight: number;
  multiplier: number;
  coherenceAdjust: number;
  contribution: number;
  validated: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function calculateCrashScore(
  snapshot: MarketAssessmentSnapshot,
  _coherence: DirectionCoherence,
  _vixRegime: VixRegime,
  usable?: Record<string, MarketIndicatorSnapshot | undefined>
): { crashScore: number; signalDetails: SignalScoreDetail[] } {
  const i = usable ?? { ...snapshot.indicators, nightFutures: snapshot.nightSession.kospiMiniFutures ?? undefined };
  const down = (v: MarketIndicatorSnapshot | null | undefined) => v && Number.isFinite(v.changePct) ? Math.max(0, -v.changePct) : 0;
  const us = [i.sp500, i.dowJones, i.nasdaqComposite].filter((x): x is MarketIndicatorSnapshot => !!x && Number.isFinite(x.changePct));
  const usDrops = us.map(down).sort((a, b) => b - a);
  const usDrop = Math.max(down(i.sp500), usDrops.length >= 2 ? (usDrops[0] + usDrops[1]) / 2 : 0);
  const koreaDrop = Math.max(down(i.nightFutures ?? i.kospi200MiniFutures), down(i.kospi), down(i.kosdaq));
  // VIX measures expected volatility, not direction. Its level must not become
  // less risky at regime boundaries or vanish simply because it fell today.
  const vix = i.vix;
  const vixStress = vix && Number.isFinite(vix.price) && Number.isFinite(vix.change)
    ? Math.max((vix.price - 20) / 30, Math.max(0, vix.change) / 15) : 0;
  const fxStress = i.usdKrw && Number.isFinite(i.usdKrw.changePct) ? Math.max(0, i.usdKrw.changePct) / 1.5 : 0;
  const definitions: Array<[string, number, number, boolean]> = [
    ['US', usDrop / 3, 0.35, us.length >= 2],
    ['KOSPI', koreaDrop / 3, 0.35, !!(i.nightFutures ?? i.kospi200MiniFutures ?? i.kospi ?? i.kosdaq)],
    ['VIX', vixStress, 0.20, !!vix],
    ['FX', fxStress, 0.10, !!i.usdKrw],
    // Search keyword matches are unverified context, not independent crash votes.
    ['Event', 0, 0, false],
  ];
  const signalDetails = definitions.map(([name, value, weight, validated]) => ({
    name, normalizedDrop: clamp(value * 100, 0, 100), weight,
    multiplier: 1, coherenceAdjust: 1, contribution: clamp(value * 100, 0, 100) * weight, validated,
  }));
  return { crashScore: Math.round(clamp(signalDetails.reduce((sum, d) => sum + d.contribution, 0), 0, 100) * 100) / 100, signalDetails };
}

export function getConfidenceLabel(confidence: number): ConfidenceLabel {
  if (confidence >= 90) return 'critical';
  if (confidence >= 80) return 'strong';
  return 'warning';
}

export function calculateCrossValidationRatio(snapshot: MarketAssessmentSnapshot): number {
  const indicators = [snapshot.indicators.vix, snapshot.indicators.usdKrw, snapshot.indicators.usdJpy].filter(Boolean);
  if (indicators.length === 0) return 0;
  const crossChecked = indicators.filter((i) => i!.validation === 'cross_checked').length;
  return crossChecked / indicators.length;
}

export type DirectionCoherence = 'coherent_normal' | 'coherent_crash' | 'stale_recovery' | 'korea_specific' | 'mixed';

export function classifyDirectionCoherence(snapshot: MarketAssessmentSnapshot): {
  coherence: DirectionCoherence;
  kospiDataStale: boolean;
  stalenessNote: string | null;
} {
  const us = [snapshot.indicators.sp500, snapshot.indicators.dowJones, snapshot.indicators.nasdaqComposite]
    .filter((x): x is MarketIndicatorSnapshot => !!x && Number.isFinite(x.changePct));
  const korea = snapshot.nightSession.kospiMiniFutures ?? snapshot.indicators.kospi200MiniFutures;
  const usDown = us.filter(x => x.changePct <= -1.5).length >= 2;
  const koreaDown = !!korea && korea.changePct <= -1.5;
  const coherence: DirectionCoherence = usDown && koreaDown ? 'coherent_crash'
    : koreaDown ? 'korea_specific' : usDown ? 'mixed' : 'coherent_normal';
  // Market disagreement is not evidence of a stale timestamp.
  return { coherence, kospiDataStale: false, stalenessNote: null };
}

function getKstHour(): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    hour: 'numeric',
    hour12: false,
  });
  return parseInt(formatter.format(new Date()), 10);
}

function isKstPreMarketHours(): boolean {
  const hour = getKstHour();
  return hour >= 18 || hour < 9;
}

async function getKisOverseasDailyIndexIndicator(
  symbol: string,
  label: string
): Promise<MarketIndicatorSnapshot> {
  const now = new Date();
  const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
  const response = await kisGet<KisOverseasDailyChartResponse>(
    '/uapi/overseas-price/v1/quotations/inquire-daily-chartprice',
    {
      FID_COND_MRKT_DIV_CODE: 'N',
      FID_INPUT_ISCD: symbol,
      FID_INPUT_DATE_1: formatKisDate(tenDaysAgo),
      FID_INPUT_DATE_2: formatKisDate(now),
      FID_PERIOD_DIV_CODE: 'D',
    },
    'FHKST03030100'
  );
  const dailyRows = (Array.isArray(response.output2) ? response.output2 : [])
    .map((row) => ({
      date: row.stck_bsop_date?.trim() ?? '',
      price: parseNumber(row.ovrs_nmix_prpr),
    }))
    .filter((row) => /^\d{8}$/.test(row.date) && Number.isFinite(row.price) && row.price > 0)
    .sort((left, right) => right.date.localeCompare(left.date));

  if (dailyRows.length < 2) {
    throw new Error(`${label} KIS daily chart returned fewer than 2 valid rows`);
  }

  const [latest, previous] = dailyRows;
  const change = latest.price - previous.price;
  const changePct = (latest.price / previous.price - 1) * 100;

  return withSingleSourceValidation({
    code: symbol,
    label,
    source: 'KIS',
    price: latest.price,
    change,
    changePct,
    observedAt: parseKisObservedAt(latest.date, getUsSessionCloseTime(`${latest.date.slice(0, 4)}-${latest.date.slice(4, 6)}-${latest.date.slice(6, 8)}`).replace(':', '') + '00', 'America/New_York'),
    observedAtPrecision: 'session_close',
    fetchedAt: new Date().toISOString(),
  });
}

async function getOverseasIndexQuote(
  symbol: string,
  label: string
): Promise<MarketIndicatorSnapshot> {
  const response = await kisGet<KisOverseasIndexResponse>(
    '/uapi/overseas-price/v1/quotations/inquire-time-indexchartprice',
    {
      FID_COND_MRKT_DIV_CODE: 'N',
      FID_INPUT_ISCD: symbol,
      FID_HOUR_CLS_CODE: '0',
      FID_PW_DATA_INCU_YN: 'Y',
    },
    'FHKST03030200'
  );

  const output = response.output1;

  if (!output) {
    throw new Error(`${label} returned no data`);
  }

  const price = parseNumber(output.ovrs_nmix_prpr);
  const change = parseNumber(output.ovrs_nmix_prdy_vrss);
  const changePct = parseNumber(output.prdy_ctrt);

  if (price === 0 && !output.hts_kor_isnm?.trim()) {
    throw new Error(
      `${label} returned price=0 with an empty name (KIS가 심볼 서빙을 중단한 패턴: ${symbol})`
    );
  }

  assertPositivePrice(price, label);
  if (!Number.isFinite(change) || !Number.isFinite(changePct)) throw new Error(`${label} missing change data`);
  const latestTick = response.output2?.find(row => Math.abs(parseNumber(row.optn_prpr) - price) <= Math.max(0.02, price * 0.00001));

  return withDirectValidation({
    code: symbol,
    label,
    source: 'KIS',
    price,
    change,
    changePct,
    observedAt: parseKisObservedAt(latestTick?.stck_bsop_date, latestTick?.stck_cntg_hour, 'America/New_York'),
    fetchedAt: new Date().toISOString(),
  });
}

async function getRequiredUsIndex(symbol: string, naverCode: string, label: string, serpQuery: string): Promise<MarketIndicatorSnapshot> {
  const primary = await tryIndicatorSource(label, 'KIS quote', 'dated index sources', () => getOverseasIndexQuote(symbol, label));
  if (primary && quoteQuality(primary, Date.now()) === 'usable') return primary;
  const fallback = await getOverseasIndexWithFallbackChain({ label, kisSymbol: symbol, naverCode, serpQuery });
  if (!fallback) throw new Error(`${label}: all numeric sources unavailable`);
  return fallback;
}

function selectFrontMonthMiniFuture(rows: KisDomesticFuturesRow[]): KisDomesticFuturesRow {
  const candidates = rows
    .map((row) => ({
      row,
      remainingDays: Number.parseInt(row.hts_rmnn_dynu ?? '', 10),
    }))
    .filter(({ row }) => typeof row.hts_kor_isnm === 'string' && row.hts_kor_isnm.startsWith('미니F '))
    .filter(({ row, remainingDays }) => Number.isFinite(remainingDays) && remainingDays >= 0 && !!row.futs_shrn_iscd)
    .sort((left, right) => {
      const leftDays = Number.isFinite(left.remainingDays) ? left.remainingDays : Number.MAX_SAFE_INTEGER;
      const rightDays = Number.isFinite(right.remainingDays) ? right.remainingDays : Number.MAX_SAFE_INTEGER;
      return leftDays - rightDays;
    });

  if (candidates.length === 0) {
    throw new Error('KOSPI200 mini futures board returned no front-month contract');
  }

  return candidates[0].row;
}

function parseKisKoreanExtendedObservedAt(date: string | undefined, time: string | undefined): string | null {
  if (!date || !time || !/^\d{8}$/.test(date) || !/^\d{6}$/.test(time)) return null;
  const hour = Number(time.slice(0, 2));
  if (hour < 24) return parseKisObservedAt(date, time, 'Asia/Seoul');
  if (hour > 47 || !parseKisObservedAt(date, '000000', 'Asia/Seoul')) return null;
  const nextDay = new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(4, 6)) - 1, Number(date.slice(6, 8)) + 1));
  return parseKisObservedAt(
    nextDay.toISOString().slice(0, 10).replace(/-/g, ''),
    `${String(hour - 24).padStart(2, '0')}${time.slice(2)}`,
    'Asia/Seoul'
  );
}

interface MiniFuturesChartObservation {
  price: number;
  observedAt: string;
  sessionDate: string;
  sessionTime: string;
  previousClose: number | null;
}

async function getMiniFuturesChartObservation(code: string, market: 'F' | 'CM'): Promise<MiniFuturesChartObservation | null> {
  const response = await kisGet<KisMiniFuturesChartResponse>(
    '/uapi/domestic-futureoption/v1/quotations/inquire-time-fuopchartprice',
    {
      FID_COND_MRKT_DIV_CODE: market,
      FID_INPUT_ISCD: code,
      FID_HOUR_CLS_CODE: '60',
      FID_PW_DATA_INCU_YN: 'Y',
      FID_FAKE_TICK_INCU_YN: 'N',
      FID_INPUT_DATE_1: formatKisDate(new Date()),
      FID_INPUT_HOUR_1: '',
    },
    'FHKIF03020200'
  );
  const latest = response.output2?.[0]; // KIS returns the newest minute first.
  const price = parseNumber(latest?.futs_prpr);
  const observedAt = parseKisKoreanExtendedObservedAt(latest?.stck_bsop_date, latest?.stck_cntg_hour);
  const previousClose = market === 'F' ? parseNumber(response.output1?.futs_prdy_clpr) : null;
  if (!Number.isFinite(price) || price <= 0 || !observedAt
    || (market === 'F' && (previousClose === null || !Number.isFinite(previousClose) || previousClose <= 0))) return null;
  return {
    price,
    observedAt,
    sessionDate: latest!.stck_bsop_date!,
    sessionTime: latest!.stck_cntg_hour!,
    previousClose,
  };
}

async function getKospi200MiniFutures(): Promise<{ snapshot: Kospi200MiniFuturesSnapshot; dayObservation: MiniFuturesChartObservation | null }> {
  const response = await kisGet<KisDomesticFuturesResponse>(
    '/uapi/domestic-futureoption/v1/quotations/display-board-futures',
    {
      FID_COND_MRKT_DIV_CODE: 'F',
      FID_COND_SCR_DIV_CODE: '20503',
      FID_COND_MRKT_CLS_CODE: 'MKI',
    },
    'FHPIF05030200'
  );

  const rows = Array.isArray(response.output) ? response.output : [];
  const contract = selectFrontMonthMiniFuture(rows);
  const price = parseNumber(contract.futs_prpr);
  const change = parseNumber(contract.futs_prdy_vrss);
  const changePct = parseNumber(contract.futs_prdy_ctrt);

  const remainingDays = Number.parseInt(contract.hts_rmnn_dynu ?? '', 10);
  await requestCooldown();
  const observation = await safeSupplementaryValue('KOSPI200 mini futures chart', () => getMiniFuturesChartObservation(contract.futs_shrn_iscd!, 'F'), null);
  if (!observation) {
    assertPositivePrice(price, 'KOSPI200 mini futures');
    if (!Number.isFinite(change) || !Number.isFinite(changePct)) throw new Error('KOSPI200 mini futures missing change data');
  }

  const snapshot = withDirectValidation({
    code: contract.futs_shrn_iscd ?? 'UNKNOWN',
    label: 'KOSPI200 mini futures',
    contractName: contract.hts_kor_isnm ?? 'Unknown contract',
    remainingDays: Number.isFinite(remainingDays) ? remainingDays : null,
    source: 'KIS',
    price: observation?.price ?? price,
    change: observation ? observation.price - observation.previousClose! : change,
    changePct: observation ? (observation.price - observation.previousClose!) / observation.previousClose! * 100 : changePct,
    observedAt: observation?.observedAt ?? null,
    session: 'day',
    fetchedAt: new Date().toISOString(),
  });
  return { snapshot, dayObservation: observation };
}

async function getNightKospi200MiniFutures(day: Kospi200MiniFuturesSnapshot, dayObservation: MiniFuturesChartObservation): Promise<Kospi200MiniFuturesSnapshot | null> {
  const response = await kisGet<KisMiniFuturesPriceResponse>(
    '/uapi/domestic-futureoption/v1/quotations/inquire-price',
    { FID_COND_MRKT_DIV_CODE: 'CM', FID_INPUT_ISCD: day.code },
    'FHMIF10000000'
  );
  const base = parseNumber(response.output1?.futs_sdpr);
  if (!Number.isFinite(base) || base <= 0) return null;
  await requestCooldown();
  const observation = await getMiniFuturesChartObservation(day.code, 'CM');
  if (!observation) return null;
  const dayClose = observation.sessionDate === dayObservation.sessionDate
    ? dayObservation.sessionTime >= '154500' ? dayObservation.price : null
    : observation.sessionDate < dayObservation.sessionDate ? dayObservation.previousClose : null;
  if (dayClose === null || Math.abs(base - dayClose) > 0.01 + 1e-9) return null;
  const change = observation.price - dayClose;
  return withDirectValidation({
    code: day.code,
    label: 'KOSPI200 mini futures (night)',
    contractName: day.contractName,
    remainingDays: day.remainingDays,
    source: 'KIS',
    price: observation.price,
    change,
    changePct: change / dayClose * 100,
    observedAt: observation.observedAt,
    session: 'night',
    fetchedAt: new Date().toISOString(),
  });
}

async function getSerpFinanceIndicator(
  query: string,
  label: string,
  options: { retryNoResults?: boolean } = {}
): Promise<MarketIndicatorSnapshot | null> {
  const params = {
    engine: 'google_finance',
    q: query,
    hl: 'en',
    gl: 'us',
  };
  let response: SerpApiFinanceResponse;
  try {
    response = await serpGet<SerpApiFinanceResponse>(params);
  } catch (error) {
    if (!options.retryNoResults || snapshotRequestContext.getStore()?.aborted || !(error instanceof Error)
      || error.message !== "SerpAPI request failed: Google Finance hasn't returned any results for this query.") throw error;
    await requestCooldown();
    response = await serpGet<SerpApiFinanceResponse>(params);
  }

  if (!response.summary?.price) {
    return null;
  }

  const price = parseNumber(response.summary.price);

  if (!Number.isFinite(price) || price <= 0) {
    return null;
  }

  const movement = parseSignedMovement(response.summary.price_movement);
  if (!Number.isFinite(movement.change) || !Number.isFinite(movement.changePct)) return null;
  const fetchedAt = new Date().toISOString();

  return withSingleSourceValidation({
    code: query,
    label,
    source: 'SERP_API',
    price,
    change: movement.change,
    changePct: movement.changePct,
    // SerpAPI keeps extensions with summary.price; observed FX extensions preceded summary.date in live data while DJI matched it.
    observedAt: parseSerpFinanceObservedAt(response.summary.extensions?.[0], fetchedAt),
    fetchedAt,
  });
}

export function parseSerpFinanceObservedAt(value: string | undefined, fetchedAt: string): string | null {
  const match = typeof value === 'string'
    ? value.split(' · ')[0].match(/^(?:Closed: )?(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2}), (\d{1,2}):(\d{2}):(\d{2}) (AM|PM) ((?:UTC|GMT)(?:([+-])(\d{1,2})(?::(\d{2}))?)?)$/)
    : null;
  if (!match) return null;
  const [, month, day, hour, minute, second, meridiem, zone, sign, offsetHour, offsetMinute] = match;
  if ((zone !== 'UTC' && !sign) || +day < 1 || +hour < 1 || +hour > 12 || +minute > 59 || +second > 59
    || +(offsetHour ?? 0) > 14 || +(offsetMinute ?? 0) > 59
    || (+offsetHour === 14 && +(offsetMinute ?? 0) !== 0)) return null;
  const monthNumber = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(month) + 1;
  const offset = zone === 'UTC' ? 'Z' : `${sign}${(offsetHour ?? '').padStart(2, '0')}:${(offsetMinute ?? '00').padStart(2, '0')}`;
  const time = `${String(+hour % 12 + (meridiem === 'PM' ? 12 : 0)).padStart(2, '0')}:${minute}:${second}${offset}`;
  const build = (year: number) => parseObservedAt(`${year}-${String(monthNumber).padStart(2, '0')}-${day.padStart(2, '0')}T${time}`, 'UTC');
  const fetched = Date.parse(fetchedAt);
  if (!Number.isFinite(fetched)) return null;
  const year = new Date(fetched).getUTCFullYear();
  return [year - 1, year, year + 1].map(build)
    .filter((candidate): candidate is string => candidate !== null && Date.parse(candidate) <= fetched + 5 * 60_000)
    .sort((a, b) => Math.abs(fetched - Date.parse(a)) - Math.abs(fetched - Date.parse(b)))[0] ?? null;
}

async function getCboeVixIndicator(): Promise<MarketIndicatorSnapshot | null> {
  const response = await fetchWithTimeout('https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv', { method: 'GET' });
  if (!response.ok) throw new Error(`CBOE VIX history: HTTP ${response.status}`);
  const lines = (await response.text()).trim().split(/\r?\n/);
  if (lines[0] !== 'DATE,OPEN,HIGH,LOW,CLOSE') throw new Error('Unexpected CBOE VIX history schema');
  const rows = lines.slice(1).map(line => {
    const [date, , , , close] = line.split(',');
    const match = date?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return { date: match ? `${match[3]}${match[1]}${match[2]}` : '', price: parseNumber(close) };
  }).filter(row => row.date && row.price > 0).sort((a, b) => b.date.localeCompare(a.date));
  if (rows.length < 2 || rows[0].date === rows[1].date) return null;
  const [latest, previous] = rows;
  const sessionDate = `${latest.date.slice(0, 4)}-${latest.date.slice(4, 6)}-${latest.date.slice(6, 8)}`;
  return withSingleSourceValidation({
    code: 'VIX', label: 'VIX', source: 'CBOE', price: latest.price,
    change: latest.price - previous.price, changePct: (latest.price / previous.price - 1) * 100,
    observedAt: parseKisObservedAt(latest.date, getUsSessionCloseTime(sessionDate).replace(':', '') + '00', 'America/New_York'),
    observedAtPrecision: 'session_close', fetchedAt: new Date().toISOString(),
  });
}

async function getNaverWorldIndexIndicator(
  indexCode: string,
  label: string
): Promise<MarketIndicatorSnapshot | null> {
  const response = await fetchWithTimeout(
    `https://api.stock.naver.com/index/${encodeURIComponent(indexCode)}/basic`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0',
      },
    },
    NAVER_INDEX_TIMEOUT_MS
  );

  if (!response.ok) {
    throw new Error(`Naver world index request failed: HTTP ${response.status}`);
  }

  const data = (await response.json()) as NaverDomesticIndexBasicResponse;
  const price = parseNumber(data.closePrice);
  const change = parseSignedNaverApiNumber(
    data.compareToPreviousClosePrice,
    data.compareToPreviousPrice
  );
  const changePct = parseSignedNaverApiNumber(
    data.fluctuationsRatio,
    data.compareToPreviousPrice
  );

  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(change) || !Number.isFinite(changePct)) {
    return null;
  }

  return withSingleSourceValidation({
    code: indexCode,
    label,
    source: 'NAVER_STOCK_API',
    price,
    change,
    changePct,
    observedAt: parseObservedAt(data.localTradedAt, 'America/New_York'),
    fetchedAt: new Date().toISOString(),
  });
}

async function getNaverFinanceExchangeIndicator(
  url: string,
  code: string,
  label: string
): Promise<MarketIndicatorSnapshot | null> {
  const response = await fetchWithTimeout(url, {
    method: 'GET',
    headers: {
      'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
      'User-Agent': 'Mozilla/5.0',
    },
  });

  if (!response.ok) {
    throw new Error(`Naver Finance request failed: HTTP ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const html = new TextDecoder('euc-kr').decode(buffer);
  const $ = cheerio.load(html);
  const price = parseNaverDigitSpans($('p.no_today em').first());
  const changeAbs = parseNaverDigitSpans($('p.no_exday em').first());
  const pctText = $('p.no_exday em').eq(1).text();
  const pctNormalized = stripHtml(pctText).replace(/[()%]/g, '');
  const parsedChangePct = parseNumber(pctNormalized);
  const negative =
    $('p.no_exday em').eq(1).find('.ico.minus').length > 0 ||
    pctNormalized.startsWith('-');
  const sign = negative ? -1 : 1;

  if (!price || changeAbs === null || !Number.isFinite(parsedChangePct)) {
    return null;
  }

  return withSingleSourceValidation({
    code,
    label,
    source: 'NAVER_FINANCE',
    price,
    change: sign * Math.abs(changeAbs),
    changePct: sign * Math.abs(parsedChangePct),
    observedAt: parseObservedAt($('.exchange_info .date').first().text(), 'Asia/Seoul'),
    fetchedAt: new Date().toISOString(),
  });
}

async function getNaverSearchVixIndicator(): Promise<MarketIndicatorSnapshot | null> {
  const response = await fetchWithTimeout(
    `https://search.naver.com/search.naver?${new URLSearchParams({ query: 'VIX 지수' }).toString()}`,
    {
      method: 'GET',
      headers: {
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
        'User-Agent': 'Mozilla/5.0',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Naver search request failed: HTTP ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  const root = $('section._cs_stock').first();

  if (root.length === 0 || !root.find('.stk_nm').first().text().includes('VIX')) {
    return null;
  }

  const price = parseNumber(root.find('.spt_con strong').first().text());
  const changeText = root.find('.n_ch em').first().text();
  const changePctText = root.find('.n_ch em').eq(1).text();
  const changeAbs = parseNumber(stripHtml(changeText));
  const changePct = parseNumber(stripHtml(changePctText).replace(/[()%]/g, ''));

  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(changeAbs) || !Number.isFinite(changePct)) {
    return null;
  }

  const sign = changePct < 0 ? -1 : 1;

  return withSingleSourceValidation({
    code: '.VIX',
    label: 'VIX',
    source: 'NAVER_SEARCH',
    price,
    change: sign * Math.abs(changeAbs),
    changePct,
    observedAt: parseObservedAt(root.find('.stk_info em').first().text(), 'America/New_York'),
    fetchedAt: new Date().toISOString(),
  });
}

function toSupplementaryIndicatorSnapshot(input: {
  label: string;
  query: string;
  title: string;
  link: string;
  price: number;
  change: number;
  changePct: number;
  confirmed: boolean;
  source: SearchIndicatorSnapshot['source'];
  snippet?: string;
  observedAt?: string | null;
}): SearchIndicatorSnapshot {
  return {
    label: input.label,
    query: input.query,
    title: input.title,
    snippet:
      input.snippet ??
      `${input.title} ${input.price.toFixed(2)} (${input.changePct >= 0 ? '+' : ''}${input.changePct.toFixed(2)}%)`,
    link: input.link,
    price: input.price,
    change: input.change,
    changePct: input.changePct,
    confirmed: input.confirmed,
    proxy: false,
    fetchedAt: new Date().toISOString(),
    observedAt: input.observedAt ?? null,
    source: input.source,
  };
}

async function getNaverDomesticIndexSupplementaryIndicator(
  itemCode: string,
  label: string
): Promise<SearchIndicatorSnapshot | null> {
  const response = await fetchWithTimeout(`https://m.stock.naver.com/api/index/${itemCode}/basic`, {
    method: 'GET',
    headers: {
      'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
      'User-Agent': 'Mozilla/5.0',
    },
  });

  if (!response.ok) {
    throw new Error(`Naver stock mobile request failed: HTTP ${response.status}`);
  }

  const data = (await response.json()) as NaverDomesticIndexBasicResponse;
  const price = parseNumber(data.closePrice);
  const change = parseSignedNaverApiNumber(data.compareToPreviousClosePrice, data.compareToPreviousPrice);
  const changePct = parseSignedNaverApiNumber(data.fluctuationsRatio, data.compareToPreviousPrice);

  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(change) || !Number.isFinite(changePct)) {
    return null;
  }

  return toSupplementaryIndicatorSnapshot({
    label,
    query: itemCode,
    title: data.stockName ?? label,
    link: `https://m.stock.naver.com/domestic/index/${itemCode}`,
    price,
    change,
    changePct,
    confirmed: false,
    source: 'NAVER_STOCK_API',
    observedAt: parseObservedAt(data.localTradedAt, 'Asia/Seoul'),
    snippet: `${data.stockName ?? label} ${price.toFixed(2)} (${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%)`,
  });
}

async function getKoreanSpotIndex(code: string): Promise<MarketIndicatorSnapshot | null> {
  const quote = await getNaverDomesticIndexSupplementaryIndicator(code, code);
  if (!quote || quote.price === null || quote.change === null || quote.changePct === null) return null;
  return withSingleSourceValidation({
    code, label: code, source: 'NAVER_STOCK_API',
    price: quote.price, change: quote.change, changePct: quote.changePct,
    observedAt: quote.observedAt, fetchedAt: quote.fetchedAt, session: 'day',
  });
}

async function getNaverNationIndexIndicator(
  nationCode: string,
  label: string,
  matcher: (item: NaverNationIndexItem) => boolean
): Promise<MarketIndicatorSnapshot | null> {
  const response = await fetchWithTimeout(`https://api.stock.naver.com/index/nation/${nationCode}`, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0',
    },
  });

  if (!response.ok) {
    throw new Error(`Naver stock server request failed: HTTP ${response.status}`);
  }

  const payload = (await response.json()) as NaverNationIndexItem[];
  const candidate = Array.isArray(payload) ? payload.find(matcher) : null;

  if (!candidate) {
    return null;
  }

  const price = parseNumber(candidate.closePrice);
  const change = parseSignedNaverApiNumber(candidate.compareToPreviousClosePrice, candidate.compareToPreviousPrice);
  const changePct = parseSignedNaverApiNumber(candidate.fluctuationsRatio, candidate.compareToPreviousPrice);

  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(change) || !Number.isFinite(changePct)) {
    return null;
  }

  return withSingleSourceValidation({
    code: candidate.reutersCode ?? nationCode,
    label,
    source: 'NAVER_STOCK_API',
    price,
    change,
    changePct,
    fetchedAt: new Date().toISOString(),
  });
}

async function getNaverNikkeiFuturesIndicator(): Promise<SearchIndicatorSnapshot | null> {
  const response = await fetchWithTimeout('https://api.stock.naver.com/futures/nation/JPN', {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0',
    },
  });

  if (!response.ok) {
    throw new Error(`Naver stock server request failed: HTTP ${response.status}`);
  }

  const payload = (await response.json()) as NaverNationFuturesItem[];
  const candidate = Array.isArray(payload)
    ? payload.find((item) =>
        [item.futuresName, item.futuresNameEng].some((value) =>
          typeof value === 'string' && /nikkei 225|니케이 225/i.test(value)
        )
      )
    : null;

  if (!candidate) {
    return null;
  }

  const price = parseNumber(candidate.closePrice);
  const change = parseSignedNaverApiNumber(candidate.compareToPreviousClosePrice, candidate.compareToPreviousPrice);
  const changePct = parseSignedNaverApiNumber(candidate.fluctuationsRatio, candidate.compareToPreviousPrice);

  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(change) || !Number.isFinite(changePct)) {
    return null;
  }

  await requestCooldown();
  const nikkeiIndex = await getNaverNationIndexIndicator(
    'JPN',
    'Nikkei 225',
    (item) => [item.indexName, item.indexNameEng].some((value) => typeof value === 'string' && /nikkei 225|n225|니케이 225/i.test(value))
  );
  const directionMatches =
    !nikkeiIndex ||
    Math.sign(changePct) === Math.sign(nikkeiIndex.changePct) ||
    Math.abs(changePct) < 0.05 ||
    Math.abs(nikkeiIndex.changePct) < 0.05;
  const changeGapOk = !nikkeiIndex || Math.abs(changePct - nikkeiIndex.changePct) <= 2.5;

  return toSupplementaryIndicatorSnapshot({
    label: 'Nikkei futures',
    query: 'JPN',
    title: candidate.futuresName ?? candidate.futuresNameEng ?? 'Nikkei 225 futures',
    link: 'https://api.stock.naver.com/futures/nation/JPN',
    price,
    change,
    changePct,
    confirmed: directionMatches && changeGapOk,
    source: 'NAVER_STOCK_API',
    snippet: `${candidate.futuresName ?? candidate.futuresNameEng ?? 'Nikkei 225 futures'} ${price.toFixed(2)} (${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%)${nikkeiIndex ? ` / Nikkei 225 ${nikkeiIndex.changePct >= 0 ? '+' : ''}${nikkeiIndex.changePct.toFixed(2)}%` : ''}`,
  });
}

async function getCrossValidatedIndicator(
  label: string,
  primaryLoader: () => Promise<MarketIndicatorSnapshot | null>,
  secondaryLoader: () => Promise<MarketIndicatorSnapshot | null>,
  options: {
    priceTolerancePct?: number;
    changeTolerance?: number;
    changePctTolerance?: number;
  } = {}
): Promise<MarketIndicatorSnapshot | null> {
  const primary = await safeSupplementaryValue(`${label} primary`, primaryLoader, null);
  await requestCooldown();
  const secondary = await safeSupplementaryValue(`${label} secondary`, secondaryLoader, null);

  if (!primary && !secondary) {
    return null;
  }

  if (!primary) {
    return secondary;
  }

  if (!secondary) {
    return primary;
  }

  const market = label.startsWith('USD/') ? 'fx' : false;
  const primaryUsable = quoteQuality(primary, Date.now(), market) === 'usable';
  const secondaryUsable = quoteQuality(secondary, Date.now(), market) === 'usable';
  if (primaryUsable && !secondaryUsable) return primary;
  if (secondaryUsable && !primaryUsable) return secondary;

  if (!primary.observedAt && secondary.observedAt) return secondary;
  if (!secondary.observedAt && primary.observedAt) return primary;

  if (isMarketIndicatorConsistent(primary, secondary, options)) {
    return withCrossValidation(
      primary,
      secondary.source === 'MULTI_SOURCE' || secondary.source === 'KIS'
        ? 'NAVER_SEARCH'
        : secondary.source
    );
  }

  console.warn(
    `[Market Snapshot] ${label} 교차검증 불일치: ${primary.source} ${primary.price.toFixed(4)} / ${primary.change.toFixed(4)} vs ${secondary.source} ${secondary.price.toFixed(4)} / ${secondary.change.toFixed(4)}`
  );
  return { ...primary, sourceConflict: true };
}

interface OverseasIndexSourceChainConfig {
  label: string;
  kisSymbol: string;
  naverCode: string;
  serpQuery: string;
  tolerances?: {
    priceTolerancePct?: number;
    changeTolerance?: number;
    changePctTolerance?: number;
  };
}

async function tryIndicatorSource(
  label: string,
  sourceLabel: string,
  nextSourceLabel: string | null,
  loader: () => Promise<MarketIndicatorSnapshot | null>
): Promise<MarketIndicatorSnapshot | null> {
  try {
    const indicator = await loader();

    if (!indicator) {
      throw new Error('returned no usable data');
    }

    return indicator;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const nextStep = nextSourceLabel
      ? `, ${nextSourceLabel} fallback 시도`
      : ', unavailable로 처리';
    console.warn(`[Market Snapshot] ${label} ${sourceLabel} 수집 실패${nextStep}: ${errorMsg}`);
    return null;
  }
}

function findCrossCheckedIndicator(
  indicators: MarketIndicatorSnapshot[],
  tolerances: OverseasIndexSourceChainConfig['tolerances']
): MarketIndicatorSnapshot | null {
  for (let primaryIndex = 0; primaryIndex < indicators.length - 1; primaryIndex += 1) {
    for (let secondaryIndex = primaryIndex + 1; secondaryIndex < indicators.length; secondaryIndex += 1) {
      const primary = indicators[primaryIndex];
      const secondary = indicators[secondaryIndex];
      const secondarySource = secondary.source === 'KIS' || secondary.source === 'MULTI_SOURCE'
        ? secondary.secondarySource
        : secondary.source;

      if (secondarySource && isMarketIndicatorConsistent(primary, secondary, tolerances)) {
        return withCrossValidation(primary, secondarySource);
      }
    }
  }

  return null;
}

async function getOverseasIndexWithFallbackChain(
  config: OverseasIndexSourceChainConfig
): Promise<MarketIndicatorSnapshot | null> {
  const kis = await tryIndicatorSource(config.label, 'KIS 일봉', 'Naver', () =>
    getKisOverseasDailyIndexIndicator(config.kisSymbol, config.label)
  );
  await requestCooldown();

  const naver = await tryIndicatorSource(config.label, 'Naver', 'Serp', () =>
    getNaverWorldIndexIndicator(config.naverCode, config.label)
  );
  const firstSources = [kis, naver].filter(
    (indicator): indicator is MarketIndicatorSnapshot => indicator !== null
  );
  const firstCrossChecked = findCrossCheckedIndicator(firstSources, config.tolerances);

  if (firstCrossChecked) {
    return firstCrossChecked;
  }

  if (firstSources.length === 2) {
    console.warn(
      `[Market Snapshot] ${config.label} KIS/Naver 교차검증 불일치, Serp fallback 시도`
    );
  }

  await requestCooldown();
  const serp = await tryIndicatorSource(config.label, 'Serp', null, () =>
    getSerpFinanceIndicator(config.serpQuery, config.label)
  );
  const available = [...firstSources, serp].filter(
    (indicator): indicator is MarketIndicatorSnapshot => indicator !== null
  );
  const crossChecked = findCrossCheckedIndicator(available, config.tolerances);

  if (crossChecked) {
    return crossChecked;
  }

  if (available.length > 1) {
    console.warn(
      `[Market Snapshot] ${config.label} 교차검증 불일치: ${available
        .map((indicator) => `${indicator.source} ${indicator.price.toFixed(4)}`)
        .join(' / ')}`
    );
  }

  const dated = available.filter(quote => !!quote.observedAt);
  if (dated.length > 1) return { ...dated[0], sourceConflict: true };
  return dated[0] ?? available[0] ?? null;
}

async function searchNaverNews(query: string, display = 10): Promise<NaverNewsResponse | null> {
  const credentials = getNaverCredentials();

  if (!credentials) {
    return null;
  }

  const params = new URLSearchParams({
    query,
    display: String(display),
    start: '1',
    sort: 'date',
  });

  const response = await fetchWithTimeout(`https://openapi.naver.com/v1/search/news.json?${params}`, {
    headers: {
      'X-Naver-Client-Id': credentials.clientId,
      'X-Naver-Client-Secret': credentials.clientSecret,
    },
  });

  if (!response.ok) {
    throw new Error(`Naver News request failed: HTTP ${response.status}`);
  }

  return (await response.json()) as NaverNewsResponse;
}

function isRecentNews(pubDate: string, recentDays = 7): boolean {
  const published = new Date(pubDate);

  if (Number.isNaN(published.getTime())) {
    return false;
  }

  const ageMs = Date.now() - published.getTime();
  return ageMs >= 0 && ageMs <= recentDays * 24 * 60 * 60 * 1000;
}

async function collectSerpEventEvidence(query: string, patterns: RegExp[]): Promise<string[]> {
  const response = await serpGet<SerpApiSearchResponse>({
    engine: 'google',
    q: query,
    hl: 'en',
    gl: 'us',
  });

  return (response.organic_results ?? [])
    .slice(0, 6)
    .map((item) => {
      const combined = `${item.title ?? ''} ${item.snippet ?? ''}`.trim();
      if (!combined || !patterns.some((pattern) => pattern.test(combined))) {
        return null;
      }

      const domain = extractSourceDomain(item.link) ?? 'unknown';
      return `[SERP:${domain}] ${combined}`;
    })
    .filter((item): item is string => Boolean(item));
}

async function collectNaverEventEvidence(query: string, patterns: RegExp[]): Promise<string[]> {
  const response = await searchNaverNews(query, 10);

  if (!response) {
    return [];
  }

  return response.items
    .filter((item) => isRecentNews(item.pubDate))
    .map((item) => {
      const title = stripHtml(item.title);
      const description = stripHtml(item.description ?? '');
      const combined = `${title} ${description}`.trim();

      if (!combined || !patterns.some((pattern) => pattern.test(combined))) {
        return null;
      }

      const source = extractSourceDomain(item.originallink || item.link) ?? 'naver';
      return `[NAVER:${source}] ${title}`;
    })
    .filter((item): item is string => Boolean(item));
}

function makeEventSignal(
  serpEvidence: string[],
  naverEvidence: string[]
): EventSignal {
  const uniqueSerpEvidence = [...new Set(serpEvidence)];
  const uniqueNaverEvidence = [...new Set(naverEvidence)];
  const naverSources = new Set(
    uniqueNaverEvidence
      .map((item) => item.match(/^\[NAVER:([^\]]+)\]/)?.[1] ?? null)
      .filter((item): item is string => Boolean(item))
  );
  const detected = uniqueSerpEvidence.length >= 1 && uniqueNaverEvidence.length >= 2 && naverSources.size >= 2;

  return {
    detected,
    evidence: [...uniqueSerpEvidence.slice(0, 1), ...uniqueNaverEvidence.slice(0, 2)],
    sourceCount: (uniqueSerpEvidence.length > 0 ? 1 : 0) + naverSources.size,
  };
}

async function getEventSignals(): Promise<EventSignals> {
  if (serpDisabledReason || !process.env.SERP_API_KEY) {
    if (!serpDisabledReason) serpDisabledReason = 'serpapi: api key missing';
    return emptyEventSignals();
  }
  const configs: Array<{
    key: keyof EventSignals;
    serpQuery: string;
    naverQuery: string;
    patterns: RegExp[];
  }> = [
    {
      key: 'tariffs',
      serpQuery: 'tariff trade war retaliatory tariff markets today',
      naverQuery: '관세 무역분쟁 보복관세 증시',
      patterns: [/tariff/i, /trade war/i, /retaliatory/i, /관세/, /무역분쟁/, /보복관세/],
    },
    {
      key: 'geopolitics',
      serpQuery: 'war missile sanction geopolitical markets today',
      naverQuery: '전쟁 미사일 제재 지정학 증시',
      patterns: [/war/i, /missile/i, /sanction/i, /geopolitical/i, /전쟁/, /미사일/, /제재/, /지정학/],
    },
    {
      key: 'centralBankSurprise',
      serpQuery: 'FOMC emergency rate decision hawkish surprise markets today',
      naverQuery: 'FOMC 긴급 금리 결정 매파 서프라이즈 증시',
      patterns: [/fomc/i, /central bank/i, /rate hike/i, /hawkish/i, /emergency rate/i, /긴급 금리/, /매파/, /서프라이즈/],
    },
    {
      key: 'financialInstitutionFailure',
      serpQuery: 'bank collapse bank run liquidity crisis default markets today',
      naverQuery: '은행 파산 뱅크런 유동성 위기 디폴트 증시',
      patterns: [/bank collapse/i, /bank run/i, /liquidity crisis/i, /default/i, /receivership/i, /파산/, /뱅크런/, /유동성 위기/, /디폴트/],
    },
    {
      key: 'pandemic',
      serpQuery: 'pandemic outbreak public health emergency WHO markets today',
      naverQuery: '팬데믹 전염병 WHO 비상사태 증시',
      patterns: [/pandemic/i, /outbreak/i, /who/i, /public health emergency/i, /state of emergency/i, /팬데믹/, /전염병/, /비상사태/],
    },
  ];

  const signals = emptyEventSignals();
  const startedAt = Date.now();
  const withinBudget = () => Date.now() - startedAt < EVENT_SIGNALS_BUDGET_MS;
  let serpAvailable = true;
  let naverAvailable = true;
  const collectEvidence = async (label: string, loader: () => Promise<string[]>, disable: () => void): Promise<string[]> => {
    try {
      return await loader();
    } catch (error) {
      if (snapshotRequestContext.getStore()?.aborted) throw error;
      disable();
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.warn(`[Market Snapshot] ${label} 수집 실패: ${errorMsg}`);
      return [];
    }
  };

  for (let index = 0; index < configs.length; index += 1) {
    snapshotRequestContext.getStore()?.throwIfAborted();
    if (!withinBudget()) break;
    const config = configs[index];
    const serpEvidence = serpAvailable
      ? await collectEvidence(`${config.key} Serp event signals`, () => collectSerpEventEvidence(config.serpQuery, config.patterns), () => { serpAvailable = false; })
      : [];
    let naverEvidence: string[] = [];
    if (naverAvailable && withinBudget()) {
      await requestCooldown();
      snapshotRequestContext.getStore()?.throwIfAborted();
      if (withinBudget()) {
        naverEvidence = await collectEvidence(`${config.key} Naver event signals`, () => collectNaverEventEvidence(config.naverQuery, config.patterns), () => { naverAvailable = false; });
      }
    }
    signals[config.key] = makeEventSignal(serpEvidence, naverEvidence);

    if (index < configs.length - 1 && withinBudget() && (serpAvailable || naverAvailable)) {
      await requestCooldown();
    }
  }

  return signals;
}

function emptyEventSignals(): EventSignals {
  return {
    tariffs: { detected: false, evidence: [] },
    geopolitics: { detected: false, evidence: [] },
    centralBankSurprise: { detected: false, evidence: [] },
    financialInstitutionFailure: { detected: false, evidence: [] },
    pandemic: { detected: false, evidence: [] },
  };
}

async function safeSupplementaryValue<T>(
  label: string,
  loader: () => Promise<T>,
  fallback: T
): Promise<T> {
  try {
    return await loader();
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.warn(`[Market Snapshot] ${label} 수집 실패: ${errorMsg}`);
    return fallback;
  }
}

export async function getKisMarketAssessmentSnapshot(): Promise<MarketAssessmentSnapshot> {
  if (snapshotCache.value && snapshotCache.expiresAt > Date.now()) return structuredClone(snapshotCache.value);
  if (!snapshotInFlight) {
    snapshotInFlight = snapshotRequestContext.run(AbortSignal.timeout(SNAPSHOT_TIMEOUT_MS), collectMarketAssessmentSnapshot)
      .finally(() => { snapshotInFlight = null; });
  }
  return structuredClone(await snapshotInFlight);
}

async function collectMarketAssessmentSnapshot(): Promise<MarketAssessmentSnapshot> {
  const now = Date.now();

  if (snapshotCache.value && snapshotCache.expiresAt > now) {
    return snapshotCache.value;
  }

  // Retry circuits are scoped to one snapshot so quota recovery is not permanent.
  serpDisabledReason = null;
  const sp500 = await safeSupplementaryValue('S&P 500', () => getRequiredUsIndex('SPX', '.INX', 'S&P 500', '.INX:INDEXSP'), null);
  await requestCooldown();

  const dowJones = await getOverseasIndexWithFallbackChain({
    label: 'Dow Jones',
    kisSymbol: '.DJI',
    naverCode: '.DJI',
    serpQuery: '.DJI:INDEXDJX',
  });
  await requestCooldown();

  const nasdaqComposite = await safeSupplementaryValue('NASDAQ', () => getRequiredUsIndex('COMP', '.IXIC', 'NASDAQ Composite', '.IXIC:INDEXNASDAQ'), null);

  await requestCooldown();

  const dayMiniFutures = await safeSupplementaryValue('KOSPI200 mini futures', () => getKospi200MiniFutures(), null);
  const kospi200MiniFutures = dayMiniFutures?.snapshot ?? null;
  await requestCooldown();
  const nightKospiMiniFutures = kospi200MiniFutures && dayMiniFutures?.dayObservation
    ? await safeSupplementaryValue('KOSPI200 mini futures night', () => getNightKospi200MiniFutures(kospi200MiniFutures, dayMiniFutures.dayObservation!), null)
    : null;
  await requestCooldown();

  const kospi = await safeSupplementaryValue('KOSPI spot', () => getKoreanSpotIndex('KOSPI'), null);
  const kosdaq = await safeSupplementaryValue('KOSDAQ spot', () => getKoreanSpotIndex('KOSDAQ'), null);

  const kospi200Futures = await safeSupplementaryValue(
    'KOSPI 200 futures',
    () => getNaverDomesticIndexSupplementaryIndicator('FUT', 'KOSPI 200 futures'),
    null
  );
  await requestCooldown();

  const vix = await safeSupplementaryValue(
    'VIX',
    () =>
      getCrossValidatedIndicator(
        'VIX',
        () => getCboeVixIndicator(),
        async () => (await safeSupplementaryValue('Naver VIX API', () => getNaverWorldIndexIndicator('.VIX', 'VIX'), null))
          ?? getNaverSearchVixIndicator(),
        { priceTolerancePct: 2, changeTolerance: 1.5, changePctTolerance: 0.75 }
      ),
    null
  );
  await requestCooldown();

  const usdKrw = await safeSupplementaryValue(
    'USD/KRW',
    () =>
      getCrossValidatedIndicator(
        'USD/KRW',
        () => getSerpFinanceIndicator('USD-KRW', 'USD/KRW', { retryNoResults: true }),
        () =>
          getNaverFinanceExchangeIndicator(
            'https://finance.naver.com/marketindex/exchangeDetail.naver?marketindexCd=FX_USDKRW',
            'FX_USDKRW',
            'USD/KRW'
          ),
        { priceTolerancePct: 0.5, changeTolerance: 2, changePctTolerance: 0.25 }
      ),
    null
  );
  await requestCooldown();

  // FX@JPY KIS daily rows do not prove a session close, so do not add KIS-derived observedAt.
  const usdJpy = await safeSupplementaryValue(
    'USD/JPY',
    () =>
      getCrossValidatedIndicator(
        'USD/JPY',
        () => getSerpFinanceIndicator('USD-JPY', 'USD/JPY', { retryNoResults: true }),
        () =>
          getNaverFinanceExchangeIndicator(
            'https://finance.naver.com/marketindex/worldExchangeDetail.naver?marketindexCd=FX_USDJPY',
            'FX_USDJPY',
            'USD/JPY'
          ),
        { priceTolerancePct: 0.5, changeTolerance: 1, changePctTolerance: 0.25 }
      ),
    null
  );
  await requestCooldown();

  const nikkeiFutures = await safeSupplementaryValue(
    'Nikkei futures',
    () => getNaverNikkeiFuturesIndicator(),
    null
  );
  await requestCooldown();

  const events = await safeSupplementaryValue('Event signals', () => getEventSignals(), emptyEventSignals());

  const preMarketHours = isKstPreMarketHours();
  // The CM price and minute chart jointly establish the night-session quote and its observation time.

  const snapshot: MarketAssessmentSnapshot = {
    fetchedAt: new Date().toISOString(),
    degradedSources: [
      ...(serpDisabledReason ? [serpDisabledReason] : []),
      ...(snapshotRequestContext.getStore()?.aborted ? ['snapshot deadline exceeded; partial data only'] : []),
      ...(!nightKospiMiniFutures ? ['timestamped night futures unavailable; dated Korea spot used'] : []),
    ],
    indicators: {
      sp500,
      dowJones,
      nasdaqComposite,
      kospi200MiniFutures,
      vix,
      usdKrw,
      usdJpy,
      kospi,
      kosdaq,
    },
    nightSession: {
      kospiMiniFutures: nightKospiMiniFutures,
      isPreMarketHours: preMarketHours,
    },
    supplementary: {
      kospi200Futures,
      nikkeiFutures,
    },
    events,
  };

  // Retain a verified severe price warning even if optional feeds hit the deadline.
  // Failed/partial-deadline snapshots are not cached, so the next call can recover.
  if (!snapshotRequestContext.getStore()?.aborted && assessMarketDataQuality(snapshot, Date.now()).quality.status !== 'unavailable') {
    snapshotCache.value = structuredClone(snapshot);
    snapshotCache.expiresAt = Date.now() + SNAPSHOT_TTL_MS;
  }

  return snapshot;
}

export function evaluateMarketAssessmentSnapshot(
  snapshot: MarketAssessmentSnapshot,
  now: Date = new Date(snapshot.fetchedAt)
): MarketAssessmentEvidence {
  const { quality, usableIndicators: i } = assessMarketDataQuality(snapshot, now.getTime());
  const effectiveKoreaIndicator = i.nightFutures ?? i.kospi200MiniFutures ?? i.kospi ?? i.kosdaq ?? null;
  const us = [i.sp500, i.dowJones, i.nasdaqComposite].filter((x): x is MarketIndicatorSnapshot => !!x);
  const usDown = us.filter(x => x.changePct <= -1.5).length >= 2;
  const koreaDown = !!effectiveKoreaIndicator && effectiveKoreaIndicator.changePct <= -1.5;
  const directionCoherence: DirectionCoherence = usDown && koreaDown ? 'coherent_crash'
    : koreaDown ? 'korea_specific' : usDown ? 'mixed' : 'coherent_normal';
  const vixRegime = getVixRegime(i.vix?.price ?? null);
  const { crashScore, signalDetails } = calculateCrashScore(snapshot, directionCoherence, vixRegime, i);
  const decision = decideMarketRisk({ crashScore, quality, indicators: i });
  const tier1Signals: string[] = [];
  const tier2Signals: string[] = [];
  for (const indicator of [...us, ...[effectiveKoreaIndicator, i.kospi, i.kosdaq].filter((x): x is MarketIndicatorSnapshot => !!x)]) {
    const text = `${indicator.label} ${indicator.changePct.toFixed(2)}% [observed ${indicator.observedAt}]`;
    if (indicator.changePct <= -2.5 && !tier1Signals.includes(text)) tier1Signals.push(text);
    else if (indicator.changePct <= -1.5 && !tier2Signals.includes(text)) tier2Signals.push(text);
  }
  if (i.vix && i.vix.price >= 25) tier2Signals.push(`VIX ${i.vix.price.toFixed(2)} (volatility, not direction)`);
  if (i.usdKrw && i.usdKrw.changePct >= 1) tier2Signals.push(`USD/KRW +${i.usdKrw.changePct.toFixed(2)}%`);
  const kospiDataStale = quality.indicators.kospi200MiniFutures !== 'usable';
  const stalenessNote = kospiDataStale ? `KOSPI200 mini futures excluded: ${quality.indicators.kospi200MiniFutures}` : null;
  return {
    policyVersion: MARKET_RISK_POLICY_VERSION,
    verdict: decision.verdict, severity: decision.severity, reasonCodes: decision.reasons,
    dataQuality: quality, effectiveKoreaIndicator,
    tier1Signals, tier2Signals,
    tier3Signals: Object.entries(snapshot.events).filter(([, value]) => value.detected).map(([key]) => `${key} [unverified search context; not scored]`),
    supportingNotes: [
      ...quality.issues, ...(snapshot.degradedSources ?? []),
      'Risk score and data coverage are not calibrated crash probabilities. NORMAL means no rule triggered, not a safety guarantee.',
    ],
    kospiDataStale, stalenessNote, crashScore,
    confidence: quality.score, // Legacy field: data coverage only; never gates a warning.
    confidenceLabel: decision.severity === 'critical' ? 'critical' : 'warning',
    directionCoherence, vixRegime,
    crossValidationRatio: calculateCrossValidationRatio(snapshot), signalDetails,
  };
}

export function formatMarketAssessmentSnapshot(snapshot: MarketAssessmentSnapshot): string {
  const entries = Object.entries({ ...snapshot.indicators, nightFutures: snapshot.nightSession.kospiMiniFutures });
  return [
    ...entries.map(([key, quote]) => quote
      ? `- ${quote.label} (${quote.code}): ${quote.price.toFixed(2)} (${quote.changePct.toFixed(2)}%) [${quote.source}; ${quote.validation}; observed=${quote.observedAt ?? 'UNKNOWN'}; fetched=${quote.fetchedAt}]`
      : `- ${key}: unavailable`),
    `- Degraded sources: ${(snapshot.degradedSources ?? []).join(', ')}`,
  ].join('\n');
}

export function resetKisMarketAssessmentCacheForTest(): void {
  resetKisClientCacheForTest();
  snapshotCache.value = null;
  snapshotCache.expiresAt = 0;
  configCache = null;
  serpDisabledReason = null;
  snapshotInFlight = null;
}
