import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import { validateKisEnv } from '@/lib/_utils/env-validator';

const FETCH_TIMEOUT_MS = 8_000;
const REQUEST_DELAY_MS = 350;
const TOKEN_TTL_MS = 23 * 60 * 60 * 1000;
const SNAPSHOT_TTL_MS = 30_000;

type KisConfig = ReturnType<typeof validateKisEnv>;

interface KisToken {
  accessToken: string;
  expiresAt: number;
}

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

type MarketIndicatorSource =
  | 'KIS'
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
  price: number;
  change: number;
  changePct: number;
  validation: MarketIndicatorValidation;
  secondarySource?: Exclude<MarketIndicatorSource, 'KIS' | 'MULTI_SOURCE'> | null;
  fetchedAt: string;
}

export interface Kospi200MiniFuturesSnapshot extends MarketIndicatorSnapshot {
  contractName: string;
  remainingDays: number | null;
}

export interface MarketAssessmentSnapshot {
  fetchedAt: string;
  indicators: {
    sp500: MarketIndicatorSnapshot;
    dowJones: MarketIndicatorSnapshot;
    nasdaqComposite: MarketIndicatorSnapshot;
    kospi200MiniFutures: Kospi200MiniFuturesSnapshot;
    vix: MarketIndicatorSnapshot | null;
    usdKrw: MarketIndicatorSnapshot | null;
    usdJpy: MarketIndicatorSnapshot | null;
  };
  supplementary: {
    kospi200Futures: SearchIndicatorSnapshot | null;
    nikkeiFutures: SearchIndicatorSnapshot | null;
    foreignerNetSelling: ForeignerNetSellingSnapshot | null;
  };
  events: EventSignals;
}

export interface MarketAssessmentEvidence {
  tier1Signals: string[];
  tier2Signals: string[];
  tier3Signals: string[];
  supportingNotes: string[];
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
  source: 'SERP_API' | 'NAVER_STOCK_API';
}

export interface ForeignerNetSellingRow {
  name: string;
  quantityK: number;
  amountMillion: number;
  volume: number;
}

export interface ForeignerNetSellingSnapshot {
  date: string | null;
  dominantStock: string | null;
  topRows: ForeignerNetSellingRow[];
  topSellAmountMillion: number;
  topSellQuantityK: number;
  fetchedAt: string;
  source: 'NAVER_FINANCE';
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

const tokenCache: { value: KisToken | null } = { value: null };
const snapshotCache: { value: MarketAssessmentSnapshot | null; expiresAt: number } = {
  value: null,
  expiresAt: 0,
};

let configCache: KisConfig | null = null;

function getConfig(): KisConfig {
  if (!configCache) {
    configCache = validateKisEnv();
  }

  return configCache;
}

function getSerpApiKey(): string {
  const apiKey = process.env.SERP_API_KEY;

  if (!apiKey) {
    throw new Error('SERP_API_KEY 환경 변수가 설정되지 않았습니다.');
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
  const delayMs = getRequestDelayMs();
  if (delayMs > 0) {
    await delay(delayMs);
  }
}

async function fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
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

  if (!response.ok) {
    throw new Error(`SerpAPI request failed: HTTP ${response.status}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(`SerpAPI request failed: ${data.error}`);
  }

  return data as T;
}

async function issueAccessToken(): Promise<KisToken> {
  const config = getConfig();

  const response = await fetchWithTimeout(`${config.KIS_BASE_URL}/oauth2/tokenP`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      appkey: config.KIS_APP_KEY,
      appsecret: config.KIS_APP_SECRET,
    }),
  });

  if (!response.ok) {
    let message = `HTTP ${response.status}`;

    try {
      message = parseKisError(await response.json());
    } catch {
      // noop
    }

    throw new Error(`Failed to issue KIS access token: ${message}`);
  }

  const data = await response.json();

  if (!data.access_token) {
    throw new Error('Failed to issue KIS access token: missing access_token');
  }

  return {
    accessToken: data.access_token as string,
    expiresAt: Date.now() + TOKEN_TTL_MS,
  };
}

async function getAccessToken(): Promise<string> {
  const now = Date.now();

  if (tokenCache.value && tokenCache.value.expiresAt > now) {
    return tokenCache.value.accessToken;
  }

  tokenCache.value = await issueAccessToken();
  return tokenCache.value.accessToken;
}

async function kisGet<T>(path: string, params: Record<string, string>, trId: string): Promise<T> {
  const config = getConfig();
  const token = await getAccessToken();
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

  const parsed = Number.parseFloat(value.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function parseSignedMovement(movement: SerpApiPriceMovement | undefined): {
  change: number;
  changePct: number;
} {
  if (!movement) {
    return { change: 0, changePct: 0 };
  }

  const sign = movement.movement === 'Down' ? -1 : 1;
  const rawChange =
    typeof movement.value === 'number' ? movement.value :
    typeof movement.price === 'number' ? movement.price :
    0;
  const rawChangePct = typeof movement.percentage === 'number' ? movement.percentage : 0;

  return {
    change: sign * Math.abs(rawChange),
    changePct: sign * Math.abs(rawChangePct),
  };
}

function parseSignedInteger(value: string | undefined): number {
  if (!value) return Number.NaN;

  const normalized = value.replace(/,/g, '').trim();
  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
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

function resolveDirectionSign(compare: NaverCompareToPreviousPrice | undefined): number {
  return compare?.name === 'FALLING' ? -1 : 1;
}

function parseSignedNaverApiNumber(
  value: string | undefined,
  compare: NaverCompareToPreviousPrice | undefined
): number {
  const parsed = parseNumber(value);

  if (!Number.isFinite(parsed)) {
    return Number.NaN;
  }

  return resolveDirectionSign(compare) * Math.abs(parsed);
}

function formatTrillionKrwFromMillion(amountMillion: number): string {
  return `${(amountMillion / 1_000_000).toFixed(2)}T KRW`;
}

function summarizeForeignerNetSelling(snapshot: ForeignerNetSellingSnapshot | null): string | null {
  if (!snapshot || snapshot.topRows.length === 0) {
    return null;
  }

  return `Foreigner top5 net sell ${formatTrillionKrwFromMillion(snapshot.topSellAmountMillion)}${snapshot.dominantStock ? ` (${snapshot.dominantStock} lead)` : ''}`;
}

function formatSearchIndicator(indicator: SearchIndicatorSnapshot | null): string | null {
  if (!indicator?.price) {
    return null;
  }

  const tags: string[] = [];

  if (indicator.proxy) {
    tags.push('proxy');
  }

  if (!indicator.confirmed) {
    tags.push('single-source');
  }

  const tagSuffix = tags.length > 0 ? ` [${tags.join(', ')}]` : '';

  if (typeof indicator.changePct === 'number') {
    return `${indicator.label} ${indicator.changePct >= 0 ? '+' : ''}${indicator.changePct.toFixed(2)}%${tagSuffix}`;
  }

  return `${indicator.label} ${indicator.price.toFixed(2)}${tagSuffix}`;
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

function formatIndicatorForSupport(indicator: MarketIndicatorSnapshot | null): string | null {
  if (!indicator) {
    return null;
  }

  const tags: string[] = [];

  if (indicator.validation === 'single_source') {
    tags.push('single-source');
  } else if (indicator.validation === 'cross_checked') {
    tags.push('cross-checked');
  }

  if (indicator.secondarySource) {
    tags.push(indicator.secondarySource.toLowerCase());
  }

  const tagSuffix = tags.length > 0 ? ` [${tags.join(', ')}]` : '';
  return `${indicator.label} ${indicator.price.toFixed(2)} (${indicator.change >= 0 ? '+' : ''}${indicator.change.toFixed(2)}, ${indicator.changePct >= 0 ? '+' : ''}${indicator.changePct.toFixed(2)}%)${tagSuffix}`;
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
    validation: 'cross_checked',
    secondarySource,
  };
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

  assertPositivePrice(price, label);

  return withDirectValidation({
    code: symbol,
    label,
    source: 'KIS',
    price,
    change: Number.isFinite(change) ? change : 0,
    changePct: Number.isFinite(changePct) ? changePct : 0,
    fetchedAt: new Date().toISOString(),
  });
}

function selectFrontMonthMiniFuture(rows: KisDomesticFuturesRow[]): KisDomesticFuturesRow {
  const candidates = rows
    .map((row) => ({
      row,
      remainingDays: Number.parseInt(row.hts_rmnn_dynu ?? '', 10),
    }))
    .filter(({ row }) => typeof row.hts_kor_isnm === 'string' && row.hts_kor_isnm.startsWith('미니F '))
    .filter(({ row }) => Number.isFinite(parseNumber(row.futs_prpr)))
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

async function getKospi200MiniFutures(): Promise<Kospi200MiniFuturesSnapshot> {
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

  assertPositivePrice(price, 'KOSPI200 mini futures');

  const remainingDays = Number.parseInt(contract.hts_rmnn_dynu ?? '', 10);

  return withDirectValidation({
    code: contract.futs_shrn_iscd ?? 'UNKNOWN',
    label: 'KOSPI200 mini futures',
    contractName: contract.hts_kor_isnm ?? 'Unknown contract',
    remainingDays: Number.isFinite(remainingDays) ? remainingDays : null,
    source: 'KIS',
    price,
    change: Number.isFinite(change) ? change : 0,
    changePct: Number.isFinite(changePct) ? changePct : 0,
    fetchedAt: new Date().toISOString(),
  });
}

async function getSerpFinanceIndicator(
  query: string,
  label: string
): Promise<MarketIndicatorSnapshot | null> {
  const response = await serpGet<SerpApiFinanceResponse>({
    engine: 'google_finance',
    q: query,
    hl: 'en',
    gl: 'us',
  });

  if (!response.summary?.price) {
    return null;
  }

  const price = parseNumber(response.summary.price);

  if (!Number.isFinite(price) || price <= 0) {
    return null;
  }

  const movement = parseSignedMovement(response.summary.price_movement);

  return withSingleSourceValidation({
    code: query,
    label,
    source: 'SERP_API',
    price,
    change: movement.change,
    changePct: movement.changePct,
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

  if (!price || !changeAbs || !Number.isFinite(parsedChangePct)) {
    return null;
  }

  return withSingleSourceValidation({
    code,
    label,
    source: 'NAVER_FINANCE',
    price,
    change: sign * Math.abs(changeAbs),
    changePct: sign * Math.abs(parsedChangePct),
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
    snippet: `${data.stockName ?? label} ${price.toFixed(2)} (${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%)`,
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
  const primary = await primaryLoader();
  await requestCooldown();
  const secondary = await secondaryLoader();

  if (!primary && !secondary) {
    return null;
  }

  if (!primary) {
    return secondary;
  }

  if (!secondary) {
    return primary;
  }

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
  return primary;
}

async function getNaverForeignerNetSelling(): Promise<ForeignerNetSellingSnapshot | null> {
  const response = await fetchWithTimeout(
    'https://finance.naver.com/sise/sise_deal_rank_iframe.naver?sosok=01&investor_gubun=9000&type=sell',
    {
      method: 'GET',
      headers: {
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
        'User-Agent': 'Mozilla/5.0',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Naver Finance request failed: HTTP ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const html = new TextDecoder('euc-kr').decode(buffer);
  const $ = cheerio.load(html);
  const rows: ForeignerNetSellingRow[] = [];

  $('table.type_1 tr').each((_, element) => {
    const $row = $(element);
    const cells = $row.find('td');

    if (cells.length !== 4) {
      return;
    }

    const name = $row.find('a.tltle').attr('title')?.trim() || $row.find('a.tltle').text().trim();
    const quantityK = parseSignedInteger($(cells[1]).text());
    const amountMillion = Math.abs(parseSignedInteger($(cells[2]).text()));
    const volume = parseSignedInteger($(cells[3]).text());

    if (!name || !Number.isFinite(quantityK) || !Number.isFinite(amountMillion) || !Number.isFinite(volume)) {
      return;
    }

    rows.push({
      name,
      quantityK: Math.abs(quantityK),
      amountMillion,
      volume,
    });
  });

  const topRows = rows.slice(0, 5);

  if (topRows.length === 0) {
    return null;
  }

  const topSellAmountMillion = topRows.reduce((sum, row) => sum + row.amountMillion, 0);
  const topSellQuantityK = topRows.reduce((sum, row) => sum + row.quantityK, 0);
  const date = $('.sise_guide_date').first().text().trim() || null;

  return {
    date,
    dominantStock: topRows[0]?.name ?? null,
    topRows,
    topSellAmountMillion,
    topSellQuantityK,
    fetchedAt: new Date().toISOString(),
    source: 'NAVER_FINANCE',
  };
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
  return ageMs <= recentDays * 24 * 60 * 60 * 1000;
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

  for (let index = 0; index < configs.length; index += 1) {
    const config = configs[index];
    const serpEvidence = await collectSerpEventEvidence(config.serpQuery, config.patterns);
    await requestCooldown();
    const naverEvidence = await collectNaverEventEvidence(config.naverQuery, config.patterns);
    signals[config.key] = makeEventSignal(serpEvidence, naverEvidence);

    if (index < configs.length - 1) {
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
  const now = Date.now();

  if (snapshotCache.value && snapshotCache.expiresAt > now) {
    return snapshotCache.value;
  }

  const sp500 = await getOverseasIndexQuote('SPX', 'S&P 500');
  await requestCooldown();

  const dowJones = await getOverseasIndexQuote('.DJI', 'Dow Jones');
  await requestCooldown();

  const nasdaqComposite = await getOverseasIndexQuote('COMP', 'NASDAQ Composite');

  await requestCooldown();

  const kospi200MiniFutures = await getKospi200MiniFutures();
  await requestCooldown();

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
        () => getSerpFinanceIndicator('VIX:INDEXCBOE', 'VIX'),
        () => getNaverSearchVixIndicator(),
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
        () => getSerpFinanceIndicator('USD-KRW', 'USD/KRW'),
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

  const usdJpy = await safeSupplementaryValue(
    'USD/JPY',
    () =>
      getCrossValidatedIndicator(
        'USD/JPY',
        () => getSerpFinanceIndicator('USD-JPY', 'USD/JPY'),
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

  const foreignerNetSelling = await safeSupplementaryValue(
    'Foreigner net selling',
    () => getNaverForeignerNetSelling(),
    null
  );
  await requestCooldown();

  const events = await safeSupplementaryValue('Event signals', () => getEventSignals(), emptyEventSignals());

  const snapshot: MarketAssessmentSnapshot = {
    fetchedAt: new Date().toISOString(),
    indicators: {
      sp500,
      dowJones,
      nasdaqComposite,
      kospi200MiniFutures,
      vix,
      usdKrw,
      usdJpy,
    },
    supplementary: {
      kospi200Futures,
      nikkeiFutures,
      foreignerNetSelling,
    },
    events,
  };

  snapshotCache.value = snapshot;
  snapshotCache.expiresAt = now + SNAPSHOT_TTL_MS;

  return snapshot;
}

export function evaluateMarketAssessmentSnapshot(
  snapshot: MarketAssessmentSnapshot
): MarketAssessmentEvidence {
  const tier1Signals: string[] = [];
  const tier2Signals: string[] = [];
  const tier3Signals: string[] = [];
  const supportingNotes: string[] = [];
  const usIndexChanges = [
    snapshot.indicators.sp500.changePct,
    snapshot.indicators.dowJones.changePct,
    snapshot.indicators.nasdaqComposite.changePct,
  ];
  const kospiPriceGapPct = calculatePriceGapPct(
    snapshot.indicators.kospi200MiniFutures.price,
    snapshot.supplementary.kospi200Futures?.confirmed
      ? snapshot.supplementary.kospi200Futures.price
      : null
  );
  const hasKospiPriceConflict = typeof kospiPriceGapPct === 'number' && kospiPriceGapPct >= 1.5;
  const nikkeiChangePct = snapshot.supplementary.nikkeiFutures?.changePct;
  const hasConfirmedNikkeiSignal = snapshot.supplementary.nikkeiFutures?.confirmed === true;
  const hasValidatedVix = snapshot.indicators.vix?.validation === 'cross_checked';
  const hasValidatedUsdKrw = snapshot.indicators.usdKrw?.validation === 'cross_checked';
  const hasValidatedUsdJpy = snapshot.indicators.usdJpy?.validation === 'cross_checked';

  if (snapshot.indicators.sp500.changePct <= -3) {
    tier1Signals.push(`S&P 500 ${snapshot.indicators.sp500.changePct.toFixed(2)}%`);
  }

  if (usIndexChanges.filter((value) => value <= -2.5).length >= 2) {
    tier1Signals.push('2 of 3 US indexes <= -2.5%');
  }

  if (!hasKospiPriceConflict && snapshot.indicators.kospi200MiniFutures.changePct <= -2.5) {
    tier1Signals.push(
      `KOSPI200 mini futures ${snapshot.indicators.kospi200MiniFutures.changePct.toFixed(2)}%`
    );
  }

  if (snapshot.indicators.vix && hasValidatedVix) {
    if (snapshot.indicators.vix.price >= 35 || snapshot.indicators.vix.change >= 10) {
      tier1Signals.push(
        `VIX ${snapshot.indicators.vix.price.toFixed(2)} / ${snapshot.indicators.vix.change.toFixed(2)}pt`
      );
    } else if (
      snapshot.indicators.vix.price >= 25 ||
      snapshot.indicators.vix.change >= 5
    ) {
      tier2Signals.push(
        `VIX ${snapshot.indicators.vix.price.toFixed(2)} / ${snapshot.indicators.vix.change.toFixed(2)}pt`
      );
    }
  }

  if (usIndexChanges.filter((value) => value <= -2).length >= 2) {
    tier2Signals.push('2 of 3 US indexes <= -2.0%');
  }

  if (
    !hasKospiPriceConflict &&
    snapshot.indicators.kospi200MiniFutures.changePct <= -1.5 &&
    snapshot.indicators.kospi200MiniFutures.changePct > -2.5
  ) {
    tier2Signals.push(
      `KOSPI200 mini futures ${snapshot.indicators.kospi200MiniFutures.changePct.toFixed(2)}%`
    );
  }

  if (snapshot.indicators.usdKrw && hasValidatedUsdKrw && snapshot.indicators.usdKrw.change >= 15) {
    tier2Signals.push(`USD/KRW +${snapshot.indicators.usdKrw.change.toFixed(2)} KRW`);
  }

  if (snapshot.indicators.usdJpy && hasValidatedUsdJpy && Math.abs(snapshot.indicators.usdJpy.change) >= 5) {
    tier2Signals.push(`USD/JPY ${snapshot.indicators.usdJpy.change.toFixed(2)} JPY`);
  }

  if (hasConfirmedNikkeiSignal && typeof nikkeiChangePct === 'number' && nikkeiChangePct <= -3) {
    tier2Signals.push(`Nikkei futures ${nikkeiChangePct.toFixed(2)}%`);
  }

  if (
    snapshot.supplementary.foreignerNetSelling &&
    snapshot.supplementary.foreignerNetSelling.topSellAmountMillion >= 2_000_000 &&
    (
      (snapshot.indicators.usdKrw?.change ?? 0) >= 10 ||
      snapshot.indicators.kospi200MiniFutures.changePct <= -1 ||
      usIndexChanges.filter((value) => value <= -1.5).length >= 2 ||
      (hasConfirmedNikkeiSignal && typeof nikkeiChangePct === 'number' && nikkeiChangePct <= -2)
    )
  ) {
    tier2Signals.push(
      `Foreigner net sell ${formatTrillionKrwFromMillion(snapshot.supplementary.foreignerNetSelling.topSellAmountMillion)}`
    );
  }

  const kospiDirectNote = formatSearchIndicator(snapshot.supplementary.kospi200Futures);
  if (kospiDirectNote) {
    supportingNotes.push(kospiDirectNote);
  }

  const vixSupport = snapshot.indicators.vix && snapshot.indicators.vix.validation !== 'cross_checked'
    ? formatIndicatorForSupport(snapshot.indicators.vix)
    : null;
  if (vixSupport) {
    supportingNotes.push(vixSupport);
  }

  const usdKrwSupport = snapshot.indicators.usdKrw && snapshot.indicators.usdKrw.validation !== 'cross_checked'
    ? formatIndicatorForSupport(snapshot.indicators.usdKrw)
    : null;
  if (usdKrwSupport) {
    supportingNotes.push(usdKrwSupport);
  }

  const usdJpySupport = snapshot.indicators.usdJpy && snapshot.indicators.usdJpy.validation !== 'cross_checked'
    ? formatIndicatorForSupport(snapshot.indicators.usdJpy)
    : null;
  if (usdJpySupport) {
    supportingNotes.push(usdJpySupport);
  }

  if (hasKospiPriceConflict && snapshot.supplementary.kospi200Futures?.price) {
    supportingNotes.push(
      `KOSPI quote mismatch ${snapshot.supplementary.kospi200Futures.price.toFixed(2)} vs mini ${snapshot.indicators.kospi200MiniFutures.price.toFixed(2)}`
    );
  }

  const nikkeiNote = formatSearchIndicator(snapshot.supplementary.nikkeiFutures);
  if (nikkeiNote) {
    supportingNotes.push(nikkeiNote);
  }

  const foreignerFlow = summarizeForeignerNetSelling(snapshot.supplementary.foreignerNetSelling);
  if (foreignerFlow) {
    supportingNotes.push(foreignerFlow);
  }

  if (snapshot.events.tariffs.detected) tier3Signals.push('Tariff / trade conflict');
  if (snapshot.events.geopolitics.detected) tier3Signals.push('Geopolitical shock');
  if (snapshot.events.centralBankSurprise.detected) tier3Signals.push('Central bank surprise');
  if (snapshot.events.financialInstitutionFailure.detected) tier3Signals.push('Financial institution stress');
  if (snapshot.events.pandemic.detected) tier3Signals.push('Pandemic / outbreak');

  return {
    tier1Signals,
    tier2Signals,
    tier3Signals,
    supportingNotes,
  };
}

export function formatMarketAssessmentSnapshot(snapshot: MarketAssessmentSnapshot): string {
  const { sp500, dowJones, nasdaqComposite, kospi200MiniFutures, vix, usdKrw, usdJpy } = snapshot.indicators;
  const formatIndicatorLine = (indicator: MarketIndicatorSnapshot): string => {
    const tags: string[] = [];

    if (indicator.validation === 'cross_checked') {
      tags.push('cross-checked');
    } else if (indicator.validation === 'single_source') {
      tags.push('single-source');
    }

    if (indicator.secondarySource) {
      tags.push(indicator.secondarySource.toLowerCase());
    }

    const suffix = tags.length > 0 ? ` [${tags.join(', ')}]` : '';
    return `${indicator.label}: ${indicator.price.toFixed(4)} (${indicator.change >= 0 ? '+' : ''}${indicator.change.toFixed(4)}, ${indicator.changePct >= 0 ? '+' : ''}${indicator.changePct.toFixed(4)}%)${suffix}`;
  };

  const lines = [
    `- S&P 500 (SPX): ${sp500.price.toFixed(2)} (${sp500.change >= 0 ? '+' : ''}${sp500.change.toFixed(2)}, ${sp500.changePct >= 0 ? '+' : ''}${sp500.changePct.toFixed(2)}%)`,
    `- Dow Jones (.DJI): ${dowJones.price.toFixed(2)} (${dowJones.change >= 0 ? '+' : ''}${dowJones.change.toFixed(2)}, ${dowJones.changePct >= 0 ? '+' : ''}${dowJones.changePct.toFixed(2)}%)`,
    `- NASDAQ Composite (${nasdaqComposite.code}): ${nasdaqComposite.price.toFixed(2)} (${nasdaqComposite.change >= 0 ? '+' : ''}${nasdaqComposite.change.toFixed(2)}, ${nasdaqComposite.changePct >= 0 ? '+' : ''}${nasdaqComposite.changePct.toFixed(2)}%)`,
    `- KOSPI200 mini futures (${kospi200MiniFutures.contractName}, ${kospi200MiniFutures.code}): ${kospi200MiniFutures.price.toFixed(2)} (${kospi200MiniFutures.change >= 0 ? '+' : ''}${kospi200MiniFutures.change.toFixed(2)}, ${kospi200MiniFutures.changePct >= 0 ? '+' : ''}${kospi200MiniFutures.changePct.toFixed(2)}%)`,
  ];

  if (vix) {
    lines.push(`- ${formatIndicatorLine(vix)}`);
  }

  if (usdKrw) {
    lines.push(`- ${formatIndicatorLine(usdKrw)}`);
  }

  if (usdJpy) {
    lines.push(`- ${formatIndicatorLine(usdJpy)}`);
  }

  if (snapshot.supplementary.kospi200Futures?.price) {
    lines.push(
      `- KOSPI 200 futures: ${snapshot.supplementary.kospi200Futures.price.toFixed(2)}${typeof snapshot.supplementary.kospi200Futures.changePct === 'number' ? ` (${snapshot.supplementary.kospi200Futures.changePct >= 0 ? '+' : ''}${snapshot.supplementary.kospi200Futures.changePct.toFixed(2)}%)` : ''} (${snapshot.supplementary.kospi200Futures.title})`
    );
  }

  if (snapshot.supplementary.nikkeiFutures?.price) {
    lines.push(
      `- Nikkei futures: ${snapshot.supplementary.nikkeiFutures.price.toFixed(2)}${typeof snapshot.supplementary.nikkeiFutures.changePct === 'number' ? ` (${snapshot.supplementary.nikkeiFutures.changePct >= 0 ? '+' : ''}${snapshot.supplementary.nikkeiFutures.changePct.toFixed(2)}%)` : ''} (${snapshot.supplementary.nikkeiFutures.title})`
    );
  }

  const foreignerFlow = summarizeForeignerNetSelling(snapshot.supplementary.foreignerNetSelling);
  if (foreignerFlow) {
    lines.push(`- Foreigner flow: ${foreignerFlow}`);
  }

  return lines.join('\n');
}

export function resetKisMarketAssessmentCacheForTest(): void {
  tokenCache.value = null;
  snapshotCache.value = null;
  snapshotCache.expiresAt = 0;
  configCache = null;
}
