import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server-client', () => ({ getServerSupabaseClient: vi.fn() }));
vi.mock('@/app/archive/_utils/api/kis/client', () => ({ fetchDailyRangePriceRows: vi.fn() }));

import {
  alignMarketToBody,
  buildStockSnapshot,
  findContradictedSentences,
  formatMarketDataForPrompt,
  hasStockPriceIntent,
  matchStocksInKeyword,
  rankByTradingValue,
  trimToContinuousSegment,
  type MasterStock,
  type PricePoint,
} from '../market-data';

const stock = (symbol: string, name: string, market: 'KOSPI' | 'KOSDAQ' = 'KOSPI'): MasterStock => ({ symbol: `${market}:${symbol}`, name, market });

const MASTER: MasterStock[] = [
  stock('051910', 'LG화학'),
  stock('003550', 'LG'),
  stock('000270', '기아'),
  stock('001680', '대상'),
  stock('005930', '삼성전자'),
  stock('012450', '한화에어로스페이스'),
  stock('000880', '한화'),
  stock('098460', '고영', 'KOSDAQ'),
  stock('373220', 'LG에너지솔루션'),
  stock('000660', 'SK하이닉스'),
  stock('034730', 'SK'),
  stock('352820', '하이브'),
  stock('039490', '키움증권'),
  stock('064260', '다날', 'KOSDAQ'),
  stock('023160', '태광'),
  stock('044490', '태웅', 'KOSDAQ'),
  stock('094480', 'KG이니시스'),
];

/** 기준일부터 거꾸로 평일만 n개 (오래된 순) */
function weekdays(end: string, n: number): string[] {
  const out: string[] = [];
  for (let t = Date.parse(end); out.length < n; t -= 86_400_000) {
    const d = new Date(t);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) out.unshift(d.toISOString().slice(0, 10));
  }
  return out;
}

const series = (end: string, closes: number[]): PricePoint[] =>
  weekdays(end, closes.length).map((date, i) => ({ date, close: closes[i], volume: 1000 }));

describe('matchStocksInKeyword', () => {
  it('consumes the longest name first so a parent brand is not double counted', () => {
    expect(matchStocksInKeyword('LG화학 실적 분석', MASTER).map((s) => s.name)).toEqual(['LG화학']);
    expect(matchStocksInKeyword('한화에어로스페이스 주가', MASTER).map((s) => s.name)).toEqual(['한화에어로스페이스']);
  });

  it('accepts a two-character name only as the first word or inside a list of stocks', () => {
    expect(matchStocksInKeyword('기아 주가 전망', MASTER).map((s) => s.name)).toEqual(['기아']);
    expect(matchStocksInKeyword('투자 대상 고르는 법', MASTER)).toEqual([]);
    expect(matchStocksInKeyword('고영 주가', MASTER).map((s) => s.name)).toEqual(['고영']);
    expect(matchStocksInKeyword('KG이니시스 vs 다날 비교', MASTER).map((s) => s.name)).toEqual(['KG이니시스', '다날']);
    expect(matchStocksInKeyword('원전 관련주 태광 태웅 실적 비교', MASTER).map((s) => s.name)).toEqual(['태광', '태웅']);
    expect(matchStocksInKeyword('배당 투자 대상 다날 분석', MASTER).map((s) => s.name)).toEqual([]);
  });

  it('keeps keyword order for comparisons and caps the count', () => {
    expect(matchStocksInKeyword('삼성전자 vs LG화학 비교', MASTER).map((s) => s.name)).toEqual(['삼성전자', 'LG화학']);
    const many = Array.from({ length: 6 }, (_, i) => stock(`10000${i}`, `가나다종목${i}`));
    expect(matchStocksInKeyword(many.map((s) => s.name).join(' '), many)).toHaveLength(4);
  });

  it('returns nothing for a generic keyword', () => {
    expect(matchStocksInKeyword('배당주 투자 방법', MASTER)).toEqual([]);
  });

  it('joins a name written with a space instead of falling back to the parent brand', () => {
    expect(matchStocksInKeyword('LG 에너지솔루션 주가 전망', MASTER).map((s) => s.name)).toEqual(['LG에너지솔루션']);
    expect(matchStocksInKeyword('한화 에어로스페이스 실적', MASTER).map((s) => s.name)).toEqual(['한화에어로스페이스']);
    expect(matchStocksInKeyword('SK 하이닉스 vs 삼성전자', MASTER).map((s) => s.name)).toEqual(['SK하이닉스', '삼성전자']);
  });

  it('matches a name only on word boundaries, allowing particles and stock suffixes after it', () => {
    expect(matchStocksInKeyword('하이브리드 관련주 전망', MASTER)).toEqual([]);
    expect(matchStocksInKeyword('신삼성전자 분석', MASTER)).toEqual([]);
    expect(matchStocksInKeyword('삼성전자주가 전망', MASTER).map((s) => s.name)).toEqual(['삼성전자']);
    expect(matchStocksInKeyword('하이브의 실적 분석', MASTER).map((s) => s.name)).toEqual(['하이브']);
  });
});

describe('hasStockPriceIntent', () => {
  it('requires a price topic and rejects fee, account and tax topics', () => {
    expect(hasStockPriceIntent('삼성전자 주가 전망')).toBe(true);
    expect(hasStockPriceIntent('방산 관련주')).toBe(true);
    expect(hasStockPriceIntent('삼성전기 vs 삼화콘덴서 비교')).toBe(true);
    expect(hasStockPriceIntent('대상 포인트 투자')).toBe(false);
    expect(hasStockPriceIntent('키움증권 수수료 비교')).toBe(false);
    expect(hasStockPriceIntent('은행 적금 금리 비교')).toBe(false);
    expect(hasStockPriceIntent('배당소득세 분리과세 절세 방법')).toBe(false);
  });
});

describe('trimToContinuousSegment', () => {
  it('drops everything before a move beyond the daily price limit', () => {
    const s = series('2026-11-06', [100, 101, 102, 150, 151, 152]);
    expect(trimToContinuousSegment(s).map((p) => p.close)).toEqual([150, 151, 152]);
  });

  it('keeps a series whose moves stay within the limit', () => {
    const s = series('2026-11-06', [100, 129, 100, 71]);
    expect(trimToContinuousSegment(s)).toHaveLength(4);
  });

  it('drops everything before a trading halt even when the price barely moved', () => {
    const s: PricePoint[] = [
      { date: '2026-03-02', close: 100, volume: 1 },
      { date: '2026-03-03', close: 101, volume: 1 },
      { date: '2026-04-20', close: 102, volume: 1 },
      { date: '2026-04-21', close: 103, volume: 1 },
    ];
    expect(trimToContinuousSegment(s).map((p) => p.date)).toEqual(['2026-04-20', '2026-04-21']);
    // 추석 연휴(최장 ~10일)는 단절이 아니다
    const holiday: PricePoint[] = [{ date: '2026-09-23', close: 100, volume: 1 }, { date: '2026-10-05', close: 101, volume: 1 }];
    expect(trimToContinuousSegment(holiday)).toHaveLength(2);
  });
});

describe('buildStockSnapshot', () => {
  const TODAY = '2026-11-09';
  const yearCloses = Array.from({ length: 260 }, (_, i) => 1000 + i * 10);

  it('computes period returns, extremes and distance from the high over one year', () => {
    const raw = series('2026-11-06', yearCloses);
    const snap = buildStockSnapshot(MASTER[0], raw, TODAY);
    expect(snap).not.toBeNull();
    const s = snap!;
    expect(s.code).toBe('051910');
    expect(s.asOf).toBe('2026-11-06');
    expect(s.close).toBe(3590);
    expect(s.fullYear).toBe(true);
    expect(s.returns.m1).toBe(Math.round((3590 / 3380 - 1) * 1000) / 10);
    expect(s.returns.m3).toBe(Math.round((3590 / 2960 - 1) * 1000) / 10);
    expect(s.returns.y1).toBe(Math.round((3590 / s.series[0].close - 1) * 1000) / 10);
    expect(s.high.close).toBe(3590);
    expect(s.fromHighPct).toBe(0);
    expect(s.series[0].date >= '2025-11-06').toBe(true);
  });

  it('ignores a same-day row, which is an intraday price during market hours', () => {
    const raw = series('2026-11-09', yearCloses);
    const snap = buildStockSnapshot(MASTER[0], raw, '2026-11-09')!;
    expect(snap.asOf).toBe('2026-11-06');
    expect(snap.close).toBe(3580);
  });

  it('sorts and de-duplicates rows from overlapping KIS windows', () => {
    const raw = series('2026-11-06', yearCloses);
    const shuffled = [...raw.slice(100), ...raw.slice(0, 120)];
    const snap = buildStockSnapshot(MASTER[0], shuffled, TODAY)!;
    expect(snap.series.map((p) => p.date)).toEqual(raw.filter((p) => p.date >= snap.series[0].date).map((p) => p.date));
  });

  it('reports no one-year return for a recent listing and labels it as partial', () => {
    const snap = buildStockSnapshot(MASTER[0], series('2026-11-06', yearCloses.slice(0, 120)), TODAY)!;
    expect(snap.fullYear).toBe(false);
    expect(snap.returns.y1).toBeNull();
    expect(snap.returns.m3).not.toBeNull();
  });

  it('rejects stale, short or broken series', () => {
    expect(buildStockSnapshot(MASTER[0], series('2026-10-20', yearCloses), TODAY)).toBeNull();
    expect(buildStockSnapshot(MASTER[0], series('2026-11-06', yearCloses.slice(0, 59)), TODAY)).toBeNull();
    expect(buildStockSnapshot(MASTER[0], [], TODAY)).toBeNull();
    // 단절 후 남은 구간이 60거래일 미만
    const broken = series('2026-11-06', [...yearCloses.slice(0, 220), ...Array.from({ length: 40 }, () => 9000)]);
    expect(buildStockSnapshot(MASTER[0], broken, TODAY)).toBeNull();
  });
});

describe('rankByTradingValue', () => {
  it('orders by price × volume and puts rows without quotes last', () => {
    const rows = [
      { name: '가', current_price: 100, volume: 10 },
      { name: '나', current_price: 50, volume: 1000 },
      { name: '다', current_price: null, volume: 5000 },
      { name: '라', current_price: 9000, volume: null },
    ];
    expect(rankByTradingValue(rows).map((r) => r.name)).toEqual(['나', '가', '다', '라']);
  });
});

describe('body alignment', () => {
  const snap = buildStockSnapshot(MASTER[0], series('2026-11-06', Array.from({ length: 260 }, (_, i) => 1000 + i * 10)), '2026-11-09')!;
  const other = { ...snap, name: '한화', code: '000880' };
  const y1 = snap.returns.y1!;

  it('accepts sentences that quote the verified figures, rounded or not', () => {
    const ctx = { stocks: [snap], theme: null, direct: true, asOf: snap.asOf };
    const body = [
      `LG화학 주가는 최근 1년 동안 ${y1.toFixed(1)}% 올랐습니다.`,
      `LG화학 주가는 1년 새 약 ${Math.round(y1)}% 상승했습니다.`,
      'LG화학의 1년 영업이익은 40% 늘었습니다.',
      '| LG화학 | 3,590원 | +6.2% |',
    ].join('\n');
    expect(findContradictedSentences(ctx, body)).toEqual([]);
  });

  it('flags a period return that disagrees with the verified data', () => {
    const ctx = { stocks: [snap], theme: null, direct: true, asOf: snap.asOf };
    const wrong = `LG화학 주가는 최근 1년 동안 ${(y1 + 30).toFixed(0)}% 올랐습니다.`;
    expect(findContradictedSentences(ctx, `도입.\n${wrong}`)).toEqual([wrong]);
    expect(alignMarketToBody(ctx, wrong)).toBeNull();
  });

  it('keeps only theme stocks the article actually discusses', () => {
    const theme = { stocks: [snap, other], theme: { id: 't', name: '방산' }, direct: false, asOf: snap.asOf };
    expect(alignMarketToBody(theme, '한화의 수주 흐름을 봅니다.')?.stocks.map((s) => s.name)).toEqual(['한화']);
    expect(alignMarketToBody(theme, '테마 일반론만 다룹니다.')).toBeNull();
    // 직접 언급 종목은 키워드 주제이므로 그대로 둔다
    const direct = { ...theme, direct: true };
    expect(alignMarketToBody(direct, '본문')?.stocks).toHaveLength(2);
    expect(alignMarketToBody(null, '본문')).toBeNull();
  });
});

describe('formatMarketDataForPrompt', () => {
  it('is empty without context and lists verified figures otherwise', () => {
    expect(formatMarketDataForPrompt(null)).toBe('');
    const snap = buildStockSnapshot(MASTER[0], series('2026-11-06', Array.from({ length: 260 }, (_, i) => 1000 + i * 10)), '2026-11-09')!;
    const text = formatMarketDataForPrompt({ stocks: [snap], theme: null, direct: true, asOf: snap.asOf });
    expect(text).toContain('LG화학(051910, KOSPI): 2026-11-06 종가 3,590원');
    expect(text).toContain('최근 1년');
  });
});
