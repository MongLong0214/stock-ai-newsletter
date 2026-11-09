/**
 * 블로그 글용 실측 시세 컨텍스트
 *
 * 키워드가 가리키는 종목(또는 테마의 대표 종목)의 1년 일봉을 KIS에서 직접 받아
 * 차트·수익률 표·본문 생성 근거로 쓴다. DB의 stock_daily_prices는 종목마다 수집 시작일이
 * 다르고(대형주 2026-01, 다수 2026-10) 7~10일 결측 구간이 있어 52주 고저를 틀리게 만든다 —
 * 그래서 쓰지 않는다. KIS 수정주가라 액면분할로 인한 가짜 급락도 없다.
 *
 * 전부 best-effort다. 실패하면 null을 돌려주고 글은 시세 없이 진행한다.
 */

import { getServerSupabaseClient } from '@/lib/supabase/server-client';
import { fetchAllRows } from '@/lib/supabase/paginate';
import { getKSTDateString } from '@/lib/tli/date-utils';
import { fetchDailyRangePriceRows } from '@/app/archive/_utils/api/kis/client';
import { findThemeForKeyword } from '../_utils/theme-match';

export interface PricePoint {
  readonly date: string;
  readonly close: number;
  readonly volume: number | null;
}

export interface StockSnapshot {
  readonly code: string;
  readonly name: string;
  readonly market: 'KOSPI' | 'KOSDAQ';
  /** 기간 일봉 (오래된 순) */
  readonly series: readonly PricePoint[];
  readonly asOf: string;
  readonly close: number;
  /** 단순 등락률(%) — 거래일 수가 모자라면 null */
  readonly returns: { readonly m1: number | null; readonly m3: number | null; readonly y1: number | null };
  readonly high: PricePoint;
  readonly low: PricePoint;
  /** 기간 최고 종가 대비(%) — 0 이하 */
  readonly fromHighPct: number;
  /** 기간이 1년을 채우는가 (상장 1년 미만이면 false) */
  readonly fullYear: boolean;
}

export interface ThemeRef {
  readonly id: string;
  readonly name: string;
}

export interface MarketContext {
  /** 차트·표에 실을 종목 (키워드 직접 언급 종목 우선, 없으면 테마 대표 종목) */
  readonly stocks: readonly StockSnapshot[];
  /** 키워드가 가리키는 테마 (내부 링크용) */
  readonly theme: ThemeRef | null;
  /** 종목이 키워드에 직접 등장했는가 — false면 테마 대표 종목이다 */
  readonly direct: boolean;
  readonly asOf: string;
}

/** 키워드 직접 언급 종목 상한 */
const MAX_DIRECT_STOCKS = 4;
/** 테마 대표 종목 상한 — 비교 차트 계열 수(4)와 같게 둬서 차트·표·문장이 같은 종목을 말한다 */
const MAX_THEME_STOCKS = 4;
/** 차트로 쓸 최소 거래일 — 이보다 짧으면 추세를 말할 수 없다 */
const MIN_TRADING_DAYS = 60;
/** 1년 수익률을 말하려면 기간이 이만큼은 돼야 한다 (연휴로 첫 거래일이 밀리는 정도만 허용) */
const FULL_YEAR_MIN_DAYS = 350;
/** KRX 가격제한폭 ±30%. 이를 넘는 하루 변동은 상장 첫날·데이터 단절이다 */
const MAX_DAILY_MOVE = 0.305;
/** 행 사이가 이보다 벌어지면 거래정지 구간이다 (최장 연휴 ~10일) — 그 앞 구간은 쓰지 않는다 */
const MAX_ROW_GAP_DAYS = 14;
/** 마지막 시세가 이보다 오래되면 거래정지·상장폐지로 보고 뺀다 */
const MAX_STALE_DAYS = 10;
/** KIS 일봉 1콜 = 최대 100영업일 → 140일 창이면 넘치지 않는다 */
const KIS_WINDOW_DAYS = 140;
/** KIS 초당 호출 제한(2/s) 아래로 */
const KIS_CALL_GAP_MS = 600;

const DAY_MS = 24 * 60 * 60 * 1000;

// --- 순수 함수 (테스트 대상) ---

export interface MasterStock {
  readonly symbol: string;
  readonly name: string;
  readonly market: 'KOSPI' | 'KOSDAQ';
}

/** 종목명 바로 뒤에 붙어도 되는 말 — 조사·주식 관련 접미어. 그 밖이면 다른 단어의 일부다(하이브리드 ≠ 하이브) */
const NAME_TAIL_RE = /^(?:의|은|는|이|가|을|를|과|와|도|만|에|에서|로|으로|랑|하고|주가|주식|전망|관련주|수혜주|테마주|대장주|실적|배당|시세|목표가|분석|비교)*$/;
/** 시세 차트가 글 주제에 맞는 키워드 — 주가·종목 의도어 */
const STOCK_INTENT_RE = /주가|주식|전망|관련주|수혜주|테마주|대장주|실적|배당|시세|목표가|분석|비교|vs|종목|매수|추천|흐름/i;
/** 종목명이 들어 있어도 시세가 주제가 아닌 키워드 (증권사 수수료·계좌, 예적금, 세금 등) */
const NON_PRICE_TOPIC_RE = /수수료|계좌|개설|이벤트|혜택|적금|예금|금리|대출|카드|보험|연금|ISA|청약|세금|절세|과세|양도세|금투세|공모주|비상장|앱/i;

/** 실측 시세 활성화 여부 — `BLOG_MARKET_DATA=off`로 끌 수 있다(프롬프트 시세·데이터 섹션 모두) */
function marketDataEnabled(): boolean {
  return process.env.BLOG_MARKET_DATA !== 'off';
}

/** 주가 데이터 섹션을 붙여도 되는 키워드인가 */
export function hasStockPriceIntent(keyword: string): boolean {
  return STOCK_INTENT_RE.test(keyword) && !NON_PRICE_TOPIC_RE.test(keyword);
}

const norm = (text: string) => text.replace(/\s+/g, '').toUpperCase();
/** 두 글자 종목명 앞에 오면 종목 나열로 볼 수 있는 어절 */
const SHORT_NAME_CONTEXT_RE = /^(?:VS|관련주|수혜주|대장주|테마주|및)$/;
/** "A vs B" 비교 키워드 */
const VERSUS_RE = /(?:^|\s)vs(?:\s|$)/i;

/**
 * 키워드에 등장하는 종목 (키워드 순서).
 *
 * 종목명은 어절 경계에서 시작해야 하고, 끝은 어절 경계이거나 조사·주식 접미어("삼성전자주가")만
 * 뒤따라야 한다. 띄어 쓴 이름("LG 에너지솔루션", "SK 하이닉스")은 이어지는 어절을 붙여 찾는다.
 * 같은 자리에서는 가장 긴 이름을 택해 "LG에너지솔루션"이 "LG"로 읽히지 않게 한다.
 *
 * 두 글자 이름(대상·동방·나노…)은 일반 명사와 겹친다 — "투자 대상"을 대상(주)로 읽으면
 * 엉뚱한 차트가 실린다. 그래서 어절 하나와 정확히 같고, 첫 어절이거나 종목 나열 안에 있을 때만
 * 인정한다("기아 주가", "KG이니시스 vs 다날", "원전 관련주 태광 태웅"은 잡고 "투자 대상"은 버린다).
 */
export function matchStocksInKeyword(keyword: string, master: readonly MasterStock[]): MasterStock[] {
  const tokens = keyword.trim().split(/\s+/).filter(Boolean).map(norm);
  const named = master
    .map((stock) => ({ stock, key: norm(stock.name) }))
    .filter((m) => m.key.length >= 2);

  const hits: Array<{ stock: MasterStock; start: number; end: number; short: boolean }> = [];
  for (let i = 0; i < tokens.length;) {
    // i번째 어절부터 최대 3어절을 붙인 문자열과 각 어절 끝 위치
    const span = tokens.slice(i, i + 3);
    const joined = span.join('');
    const ends = span.map((_, k) => span.slice(0, k + 1).join('').length);

    let best: { stock: MasterStock; tokensUsed: number; length: number } | null = null;
    for (const { stock, key } of named) {
      if (!joined.startsWith(key) || (best && key.length <= best.length)) continue;
      const k = ends.findIndex((e) => e >= key.length);
      const exact = ends[k] === key.length;
      if (!exact && !NAME_TAIL_RE.test(span[k].slice(span[k].length - (ends[k] - key.length)))) continue;
      if (key.length <= 2 && (k !== 0 || !exact)) continue;
      best = { stock, tokensUsed: k + 1, length: key.length };
    }

    if (best) hits.push({ stock: best.stock, start: i, end: i + best.tokensUsed, short: best.length <= 2 });
    i += best?.tokensUsed ?? 1;
  }

  // 두 글자 이름은 확실한 자리(첫 어절·나열 표지 뒤)나 이미 인정된 종목 바로 옆일 때만 인정한다.
  // 두 글자끼리 서로를 근거로 삼으면 "투자 대상 다날"처럼 일반 명사가 끌려 들어온다.
  const accepted = new Set(hits.filter((h) => !h.short || h.start === 0 || SHORT_NAME_CONTEXT_RE.test(tokens[h.start - 1])));
  for (let grew = true; grew;) {
    grew = false;
    for (const h of hits) {
      if (accepted.has(h)) continue;
      if ([...accepted].some((a) => a.end === h.start || a.start === h.end)) { accepted.add(h); grew = true; }
    }
  }
  const found: MasterStock[] = [];
  for (const h of hits) {
    if (accepted.has(h) && !found.some((f) => f.symbol === h.stock.symbol)) found.push(h.stock);
  }
  return found.slice(0, MAX_DIRECT_STOCKS);
}

/** 가격제한폭을 넘는 단절·장기 거래정지 이후 구간만 남긴다 */
export function trimToContinuousSegment(series: readonly PricePoint[]): PricePoint[] {
  let start = 0;
  for (let i = 1; i < series.length; i++) {
    const move = Math.abs(series[i].close / series[i - 1].close - 1);
    const gapDays = (Date.parse(series[i].date) - Date.parse(series[i - 1].date)) / DAY_MS;
    if (move > MAX_DAILY_MOVE || gapDays > MAX_ROW_GAP_DAYS) start = i;
  }
  return series.slice(start);
}

const pct = (to: number, from: number | undefined): number | null =>
  from && from > 0 ? Math.round((to / from - 1) * 1000) / 10 : null;

/**
 * 일봉 → 스냅샷. 기간 1년, 거래일 부족·시세 정체·단절이면 null.
 * @param today - KST 오늘(YYYY-MM-DD). 이날 행은 버리고, 마지막 시세가 너무 오래됐는지 판단한다.
 */
export function buildStockSnapshot(
  stock: MasterStock,
  rawSeries: readonly PricePoint[],
  today: string,
): StockSnapshot | null {
  // 당일 행은 장중이면 현재가다 — 확정된 직전 거래일까지만 쓴다(05:30 정기 실행엔 원래 없다)
  const sorted = rawSeries.filter((p) => p.date < today).sort((a, b) => a.date.localeCompare(b.date));
  const deduped = sorted.filter((p, i) => i === 0 || p.date !== sorted[i - 1].date);
  const last = deduped.at(-1);
  if (!last) return null;
  if ((Date.parse(today) - Date.parse(last.date)) / DAY_MS > MAX_STALE_DAYS) return null;

  const yearAgo = new Date(Date.parse(last.date) - 365 * DAY_MS).toISOString().slice(0, 10);
  const series = trimToContinuousSegment(deduped.filter((p) => p.date >= yearAgo));
  if (series.length < MIN_TRADING_DAYS) return null;

  const close = last.close;
  const spanDays = (Date.parse(last.date) - Date.parse(series[0].date)) / DAY_MS;
  const fullYear = spanDays >= FULL_YEAR_MIN_DAYS;
  const back = (n: number) => series[series.length - 1 - n]?.close;
  let high = series[0];
  let low = series[0];
  for (const p of series) {
    if (p.close > high.close) high = p;
    if (p.close < low.close) low = p;
  }

  return {
    code: stock.symbol.split(':').pop() ?? stock.symbol,
    name: stock.name,
    market: stock.market,
    series,
    asOf: last.date,
    close,
    returns: {
      m1: pct(close, back(21)),
      m3: pct(close, back(63)),
      y1: fullYear ? pct(close, series[0].close) : null,
    },
    high,
    low,
    fromHighPct: Math.round((close / high.close - 1) * 1000) / 10,
    fullYear,
  };
}

// --- 조회 ---

let masterCache: Promise<MasterStock[]> | null = null;

function loadStockMaster(): Promise<MasterStock[]> {
  masterCache ??= fetchAllRows<MasterStock>((from, to) =>
    getServerSupabaseClient()
      .from('stock_master')
      .select('symbol, name, market')
      .eq('is_active', true)
      .order('symbol')
      .range(from, to),
  ).catch((error: unknown) => {
    masterCache = null;
    throw error;
  });
  return masterCache;
}

const toKisDate = (iso: string) => iso.replaceAll('-', '');
const isoDaysAgo = (base: string, days: number) =>
  new Date(Date.parse(base) - days * DAY_MS).toISOString().slice(0, 10);

/** 1년+여유 일봉 (KIS 수정주가). 창 단위로 끊어 받는다. 마감을 넘기면 다음 창을 부르지 않고 throw. */
async function fetchYearSeries(symbol: string, today: string, deadline: number): Promise<PricePoint[]> {
  const points: PricePoint[] = [];
  // 1년 + 첫 거래일 여유(휴장) 14일
  for (let offset = 379; offset > 0; offset -= KIS_WINDOW_DAYS) {
    if (Date.now() > deadline) throw new Error('시세 조회 마감 초과');
    const start = isoDaysAgo(today, offset);
    const end = isoDaysAgo(today, Math.max(0, offset - KIS_WINDOW_DAYS + 1));
    const rows = await fetchDailyRangePriceRows(symbol, toKisDate(start), toKisDate(end));
    points.push(...rows.map((r) => ({ date: r.date, close: r.close, volume: r.volume })));
    await new Promise((r) => setTimeout(r, KIS_CALL_GAP_MS));
  }
  return points;
}

interface ThemeStockRow {
  readonly symbol: string;
  readonly name: string;
  readonly market: string;
  readonly current_price: number | null;
  readonly volume: number | null;
}

/** 최근 거래일 거래대금(현재가 × 거래량) 내림차순 */
export function rankByTradingValue<T extends Pick<ThemeStockRow, 'current_price' | 'volume'>>(rows: readonly T[]): T[] {
  const value = (r: T) => (r.current_price ?? 0) * (r.volume ?? 0);
  return [...rows].sort((a, b) => value(b) - value(a));
}

/**
 * 테마 대표 종목 = 최근 거래일 거래대금 상위.
 *
 * theme_stocks.relevance는 전부 1.0 동점이라 그 순서로 자르면 코드 순이 된다
 * (실측: "방산" 대표가 기아·한화·그린광학). 거래대금은 시장이 그 테마로 실제 거래하는
 * 종목을 가리킨다. stock_daily_prices는 종목별 수집 범위가 달라(현대로템·한국항공우주 결측)
 * 순위를 왜곡하므로, 테마 구성 종목 전부에 매일 갱신되는 theme_stocks의 현재가·거래량을 쓴다.
 */
async function loadThemeStocks(themeId: string): Promise<MasterStock[]> {
  const { data, error } = await getServerSupabaseClient()
    .from('theme_stocks')
    .select('symbol, name, market, current_price, volume')
    .eq('theme_id', themeId)
    .eq('is_active', true)
    .order('symbol')
    .limit(500);
  if (error) throw error;
  return rankByTradingValue((data ?? []) as ThemeStockRow[])
    .filter((r): r is ThemeStockRow & { market: MasterStock['market'] } => r.market === 'KOSPI' || r.market === 'KOSDAQ')
    .slice(0, MAX_THEME_STOCKS * 2)
    .map((r) => ({ symbol: `${r.market}:${r.symbol}`, name: r.name, market: r.market }));
}

async function loadKeywordTheme(keyword: string): Promise<ThemeRef | null> {
  const themes = await fetchAllRows<{ id: string; name: string | null }>((from, to) =>
    getServerSupabaseClient().from('themes').select('id, name').eq('is_active', true).order('id').range(from, to),
  );
  const match = findThemeForKeyword(keyword, themes);
  return match?.name ? { id: match.id, name: match.name } : null;
}

/**
 * 키워드 → 실측 시세 컨텍스트. 주가 의도가 없거나 종목도 테마도 특정되지 않으면 null.
 * 키워드가 직접 부른 종목은 전부 받아야 쓴다("A vs B"가 A 하나로 줄면 제목·비교가 틀린다).
 * 테마 대표 종목은 받은 것만 쓴다.
 * @param deadline - epoch ms. 넘기면 남은 조회를 멈춘다(바깥 타임아웃 뒤에 KIS 호출이 계속 돌지 않게).
 */
export async function buildMarketContext(keyword: string, deadline: number): Promise<MarketContext | null> {
  if (!marketDataEnabled() || !hasStockPriceIntent(keyword)) return null;
  const today = getKSTDateString();
  const [master, theme] = await Promise.all([
    loadStockMaster(),
    loadKeywordTheme(keyword).catch(() => null),
  ]);

  const direct = matchStocksInKeyword(keyword, master);
  // "A vs B"에서 한쪽만 찾았으면(상장명 변경·비상장) 비교가 성립하지 않는다
  if (VERSUS_RE.test(keyword) && direct.length < 2) return null;
  const candidates = direct.length > 0 ? direct : theme ? await loadThemeStocks(theme.id) : [];
  const limit = direct.length > 0 ? MAX_DIRECT_STOCKS : MAX_THEME_STOCKS;

  const stocks: StockSnapshot[] = [];
  for (const stock of candidates) {
    if (stocks.length >= limit || Date.now() > deadline) break;
    try {
      const snapshot = buildStockSnapshot(stock, await fetchYearSeries(stock.symbol, today, deadline), today);
      if (snapshot) stocks.push(snapshot);
      else console.warn(`[MarketData] ${stock.name} 시세 부족·정체 — 제외`);
    } catch (error) {
      console.warn(`[MarketData] ${stock.name} 시세 조회 실패: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (stocks.length === 0) return null;
  if (direct.length > 0 && stocks.length < direct.length) {
    console.warn(`[MarketData] 키워드 종목 ${direct.length}개 중 ${stocks.length}개만 확보 — 데이터 섹션 생략`);
    return null;
  }
  const asOf = stocks.map((s) => s.asOf).sort().at(-1) ?? today;
  console.log(`[MarketData] ${stocks.map((s) => s.name).join(', ')} (기준일 ${asOf}${theme ? `, 테마 ${theme.name}` : ''})`);
  return { stocks, theme, direct: direct.length > 0, asOf };
}

// --- 본문 대조 ---

const PERIOD_RE = /1년|일 년|한 해|연간|52주|1개월|한 달|한달|3개월|석 달|세 달/;
const PRICE_MOVE_RE = /주가|종가|등락|상승|하락|올랐|내렸|오른|내린|올라|내려|떨어|빠졌|급등|급락|수익률/;
/** 주가 등락률이 아닌 % 수치를 말하는 문장 (실적·밸류에이션·지분 등) */
const NON_PRICE_FIGURE_RE = /영업이익|매출|순이익|이익|실적|배당|PER|PBR|ROE|점유율|성장률|목표|지분|금리|비중|확률/i;
const PERCENT_RE = /(\d+(?:\.\d+)?)\s*%/g;
/** 본문 수치와 검증값의 허용 오차(%p) — "약 45%"처럼 반올림한 표현은 받아 준다 */
const FIGURE_TOLERANCE = 0.6;

/**
 * 본문에서 검증 시세와 어긋나는 등락률을 말하는 문장.
 *
 * 검증 종목명·기간어·주가 변동어가 함께 있고 실적·밸류에이션 수치가 아닌 문장만 본다.
 * 그 문장의 % 수치가 문장 속 종목의 검증값(1·3개월, 1년·기간, 최고가 대비, 최저가 대비)
 * 어디에도 맞지 않으면 어긋난 문장이다. 표는 건너뛴다.
 */
export function findContradictedSentences(ctx: MarketContext, body: string): string[] {
  const figures = (s: StockSnapshot) =>
    [s.returns.m1, s.returns.m3, s.returns.y1, pct(s.close, s.series[0]?.close), s.fromHighPct, pct(s.close, s.low.close)]
      .filter((v): v is number => v !== null)
      .map(Math.abs);
  const out: string[] = [];
  for (const sentence of body.split(/\n+|(?<=[.!?])\s+/)) {
    if (sentence.trimStart().startsWith('|')) continue;
    const named = ctx.stocks.filter((s) => sentence.includes(s.name));
    if (named.length === 0 || !PERIOD_RE.test(sentence) || !PRICE_MOVE_RE.test(sentence) || NON_PRICE_FIGURE_RE.test(sentence)) continue;
    const allowed = named.flatMap(figures);
    const stated = [...sentence.matchAll(PERCENT_RE)].map((m) => Number(m[1]));
    if (stated.some((v) => !allowed.some((a) => Math.abs(a - v) <= FIGURE_TOLERANCE))) out.push(sentence.trim());
  }
  return out;
}

/**
 * 발행 본문에 맞춘 시세 컨텍스트 (시각자료 직전).
 * - 테마 대표 종목은 본문이 실제로 다루는 종목만 남긴다 — 글에 없는 종목의 순위를 싣지 않는다.
 * - 본문 등락률이 검증값과 어긋나면 null — 한 페이지에서 두 숫자가 부딪히게 두지 않는다.
 */
export function alignMarketToBody(ctx: MarketContext | null, body: string): MarketContext | null {
  if (!ctx) return null;
  const stocks = ctx.direct ? ctx.stocks : ctx.stocks.filter((s) => body.includes(s.name));
  if (stocks.length === 0) {
    console.warn('[MarketData] 본문이 테마 대표 종목을 다루지 않음 — 데이터 섹션 생략');
    return null;
  }
  const aligned: MarketContext = { ...ctx, stocks, asOf: stocks.map((s) => s.asOf).sort().at(-1) ?? ctx.asOf };
  const contradicted = findContradictedSentences(aligned, body);
  if (contradicted.length > 0) {
    console.warn(`[MarketData] 본문 등락률이 검증값과 다름 — 데이터 섹션 생략: ${contradicted.map((c) => c.slice(0, 80)).join(' / ')}`);
    return null;
  }
  return aligned;
}

// --- 프롬프트용 요약 ---

const won = (v: number) => `${Math.round(v).toLocaleString('ko-KR')}원`;
const signed = (v: number | null) => (v === null ? '해당 없음' : `${v > 0 ? '+' : ''}${v.toFixed(1)}%`);

/** 본문 생성 프롬프트에 넣을 검증된 시세 요약 */
export function formatMarketDataForPrompt(ctx: MarketContext | null): string {
  if (!ctx) return '';
  const lines = ctx.stocks.map((s) => {
    const period = s.fullYear ? '최근 1년' : `최근 ${s.series.length}거래일`;
    return `- ${s.name}(${s.code}, ${s.market}): ${s.asOf} 종가 ${won(s.close)}, 1개월 ${signed(s.returns.m1)}, 3개월 ${signed(s.returns.m3)}, 1년 ${signed(s.returns.y1)}, ${period} 종가 최고 ${won(s.high.close)}(${s.high.date})·최저 ${won(s.low.close)}(${s.low.date}), 최고가 대비 ${signed(s.fromHighPct)}`;
  });
  return lines.join('\n');
}
