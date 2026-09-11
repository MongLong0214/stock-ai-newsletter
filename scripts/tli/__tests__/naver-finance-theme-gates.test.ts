import { afterEach, describe, expect, it, vi } from 'vitest';
import { collectNaverFinanceStocks } from '../collectors/naver-finance-themes';
import {
  NAVER_FINANCE_THEME_GATE_DEFAULTS,
  NaverFinanceThemeGateError,
  shouldRejectStockCollection,
  validateNaverFinanceThemeStocks,
} from '../collectors/naver-finance-theme-gates';

vi.mock('@/scripts/tli/shared/utils', () => ({
  sleep: vi.fn(() => Promise.resolve()),
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

const healthyFixture = Array.from({ length: 20 }, (_, index) => ({
  themeId: 'theme-ai',
  symbol: String(100000 + index),
  name: `AI stock ${index}`,
  market: index % 2 === 0 ? 'KOSPI' : 'KOSDAQ',
  currentPrice: 50000 + index,
  priceChangePct: index % 2 === 0 ? 2.4 : -1.7,
  volume: 100000 + index,
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Naver finance theme scraper gates', () => {
  it('passes a healthy scraper fixture', () => {
    // Given: all scraped rows are present, parseable, and numerically sane.
    // When: the Naver finance theme gate validates the collector output.
    const result = validateNaverFinanceThemeStocks(healthyFixture, { expectedRows: 20 });

    // Then: downstream collection can use the parsed metrics.
    expect(result).toMatchObject({
      minimumCoverage: NAVER_FINANCE_THEME_GATE_DEFAULTS.minimumCoverage,
      rowCoverage: 1,
      schemaParseRate: 1,
    });
  });

  it('fails validation when the scrape returns zero rows', () => {
    // Given: Naver returned a successful page parse with no usable rows.
    // When/Then: the gate fails loudly instead of accepting empty data.
    expect(() => validateNaverFinanceThemeStocks([], { expectedRows: 20 })).toThrow(
      NaverFinanceThemeGateError,
    );
  });

  it('fails validation when malformed rows lower schema parse rate', () => {
    // Given: enough rows were scraped, but multiple rows do not match the schema.
    const malformedRows = healthyFixture.map((row, index) =>
      index < 2
        ? {
            ...row,
            symbol: 'bad-code',
            currentPrice: null,
          }
        : row,
    );

    // When/Then: the schema parse-rate gate rejects the fixture.
    expect(() => validateNaverFinanceThemeStocks(malformedRows, { expectedRows: 20 })).toThrow(
      NaverFinanceThemeGateError,
    );
  });

  it('fails validation when numeric fields are out of range', () => {
    // Given: rows parse structurally but contain impossible market values.
    const outOfRangeRows = healthyFixture.map((row, index) =>
      index === 0
        ? {
            ...row,
            currentPrice: 0,
            priceChangePct: 99,
            volume: -1,
          }
        : row,
    );

    // When/Then: the value-sanity gate rejects the fixture.
    expect(() => validateNaverFinanceThemeStocks(outOfRangeRows, { expectedRows: 20 })).toThrow(
      NaverFinanceThemeGateError,
    );
  });

  it('fails validation when scraped row coverage is below the minimum', () => {
    // Given: the scrape captures only 60% of the expected Naver table rows.
    const insufficientRows = healthyFixture.slice(0, 12);

    // When/Then: the row-coverage gate rejects the fixture.
    expect(() => validateNaverFinanceThemeStocks(insufficientRows, { expectedRows: 20 })).toThrow(
      NaverFinanceThemeGateError,
    );
  });

  it('propagates collector gate failures into the caller when every attempted theme fails (systemic collapse)', async () => {
    const rows = [
      buildNaverThemeRow('100000'),
      ...Array.from({ length: 19 }, buildMalformedNaverThemeRow),
    ];
    vi.stubGlobal('fetch', vi.fn(async () => new Response(buildNaverThemePage(rows), { status: 200 })));

    await expect(
      collectNaverFinanceStocks([{ id: 'theme-ai', naverThemeId: '123' }]),
    ).rejects.toThrow(/붕괴/);
  });

  it('isolates a single theme gate failure and preserves the other healthy theme results', async () => {
    const healthyRows = Array.from({ length: 20 }, (_, index) => buildNaverThemeRow(String(200000 + index)));
    const failingRows = [
      buildNaverThemeRow('300000'),
      ...Array.from({ length: 19 }, buildMalformedNaverThemeRow),
    ];

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.includes('/theme/999')
          ? new Response(buildNaverThemePage(failingRows), { status: 200 })
          : new Response(buildNaverThemePage(healthyRows), { status: 200 }),
      ),
    );

    // 4개 테마 중 1개만 게이트 실패(25%) → 30% 붕괴 임계값 미만이라 격리만 되고 throw는 발생하지 않아야 함
    const stocks = await collectNaverFinanceStocks([
      { id: 'theme-broken', naverThemeId: '999' },
      { id: 'theme-ok-1', naverThemeId: '111' },
      { id: 'theme-ok-2', naverThemeId: '222' },
      { id: 'theme-ok-3', naverThemeId: '333' },
    ]);

    expect(stocks.length).toBe(60);
    expect(stocks.every((stock) => stock.themeId !== 'theme-broken')).toBe(true);
  });

  it('throws systemic collapse when every attempted theme (2+) fails its gate', async () => {
    const failingRows = [
      buildNaverThemeRow('300000'),
      ...Array.from({ length: 19 }, buildMalformedNaverThemeRow),
    ];
    vi.stubGlobal('fetch', vi.fn(async () => new Response(buildNaverThemePage(failingRows), { status: 200 })));

    await expect(
      collectNaverFinanceStocks([
        { id: 'theme-a', naverThemeId: '111' },
        { id: 'theme-b', naverThemeId: '222' },
      ]),
    ).rejects.toThrow(/붕괴/);
  });
});

describe('shouldRejectStockCollection', () => {
  it('rejects when the collected count falls below 70% of the previous active baseline', () => {
    expect(shouldRejectStockCollection({ prevCount: 1000, collectedCount: 650 })).toBe(true);
  });

  it('passes at exactly the 70% retention boundary', () => {
    expect(shouldRejectStockCollection({ prevCount: 1000, collectedCount: 700 })).toBe(false);
  });

  it('skips the collapse check when the previous baseline is a small/bootstrap count', () => {
    expect(shouldRejectStockCollection({ prevCount: 30, collectedCount: 5 })).toBe(false);
  });
});

/**
 * 2026-09-10 이후 수집기는 HTML이 아니라 JSON API를 읽는다.
 * `totalCount`가 게이트의 expectedRows이므로 행 수와 같게 둔다(구 DOM 행수 계산과 동일 의미).
 */
function buildNaverThemePage(rows: readonly unknown[]): string {
  return JSON.stringify({ stocks: rows, totalCount: rows.length });
}

/** 종목코드가 6자리가 아니라 Zod 스키마에서 떨어진다 — 파싱 성공률 게이트를 때린다 */
function buildMalformedNaverThemeRow(): unknown {
  return {
    accumulatedTradingVolumeRaw: '100000',
    closePriceRaw: '50000',
    compareToPreviousPrice: { name: 'RISING' },
    fluctuationsRatio: '2.4',
    itemCode: 'BADCODE',
    stockExchangeType: { name: 'KOSPI' },
    stockName: 'Broken Stock',
  };
}

function buildNaverThemeRow(symbol: string): unknown {
  return {
    accumulatedTradingVolumeRaw: '100000',
    closePriceRaw: '50000',
    compareToPreviousPrice: { name: 'RISING' },
    fluctuationsRatio: '2.4',
    itemCode: symbol,
    stockExchangeType: { name: 'KOSPI' },
    stockName: `Stock ${symbol}`,
  };
}
