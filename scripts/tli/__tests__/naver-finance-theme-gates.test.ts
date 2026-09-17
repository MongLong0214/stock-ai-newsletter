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
    const { stocks, syncedThemeIds } = await collectNaverFinanceStocks([
      { id: 'theme-broken', naverThemeId: '999' },
      { id: 'theme-ok-1', naverThemeId: '111' },
      { id: 'theme-ok-2', naverThemeId: '222' },
      { id: 'theme-ok-3', naverThemeId: '333' },
    ]);

    expect(stocks.length).toBe(60);
    expect(stocks.every((stock) => stock.themeId !== 'theme-broken')).toBe(true);
    // 게이트 실패 테마는 sweep 범위에 절대 들어가지 않는다 — 결과를 모르는 테마를
    // 범위에 넣으면 소스가 잠깐 비었을 때 멀쩡한 종목이 대량 비활성화된다.
    expect(syncedThemeIds).not.toContain('theme-broken');
    expect([...syncedThemeIds].sort()).toEqual(['theme-ok-1', 'theme-ok-2', 'theme-ok-3']);
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

describe('KRX 영숫자 단축코드', () => {
  /**
   * 2026-09-11 회귀.
   *
   * KRX는 신규상장·SPAC에 영숫자 단축코드를 발급한다(0130H0 엔에이치스팩33호,
   * 0220W0 한화머시너리앤서비스홀딩스). 스키마가 숫자 6자리만 허용하던 동안
   * 구 HTML 스크래퍼는 이들을 조용히 건너뛰어 데이터가 샜고(SPAC 테마 69개 중 31개 유실),
   * JSON API 이전 후에는 파싱률 게이트에 걸려 테마가 통째로 버려졌다.
   */
  const gateRow = (symbol: string) => ({
    themeId: 'theme-ai',
    symbol,
    name: `stock ${symbol}`,
    market: 'KOSPI',
    currentPrice: 50000,
    priceChangePct: 1.2,
    volume: 100000,
  })

  it('영숫자 코드를 유효한 종목으로 받는다', () => {
    const rows = [gateRow('0130H0'), gateRow('0220W0')]

    expect(() => validateNaverFinanceThemeStocks(rows, { expectedRows: 2 })).not.toThrow()
  })

  it('숫자 코드도 그대로 받는다', () => {
    expect(() => validateNaverFinanceThemeStocks([gateRow('005930')], { expectedRows: 1 }))
      .not.toThrow()
  })

  it('6자리가 아니거나 소문자면 여전히 거부한다', () => {
    for (const bad of ['00593', '0059300', 'abc123', '00-930', '']) {
      expect(
        () => validateNaverFinanceThemeStocks([gateRow(bad)], { expectedRows: 1 }),
        bad,
      ).toThrow(NaverFinanceThemeGateError)
    }
  })
})

describe('빈 테마 (네이버 totalCount=0)', () => {
  /**
   * API가 "이 테마엔 종목이 0개"라고 명시적으로 답한 것은 파싱 실패가 아니다.
   * 게이트에 넘기면 매 실행 invalidExpectedRows+zeroRows로 실패 집계된다.
   */
  it('빈 테마는 게이트 실패 없이 건너뛰고 나머지는 수집한다', async () => {
    const healthy = Array.from({ length: 20 }, (_, i) => buildNaverThemeRow(String(200000 + i)))
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      url.includes('/theme/268')
        ? new Response(JSON.stringify({ stocks: [], totalCount: 0 }), { status: 200 })
        : new Response(buildNaverThemePage(healthy), { status: 200 }),
    ))

    const { stocks, syncedThemeIds } = await collectNaverFinanceStocks([
      { id: 'theme-empty', naverThemeId: '268' },
      { id: 'theme-ok', naverThemeId: '111' },
    ])

    // 빈 테마는 기여 0건, 정상 테마는 그대로 — 붕괴 판정도 걸리지 않는다
    expect(stocks).toHaveLength(20)
    expect(stocks.every((s) => s.themeId === 'theme-ok')).toBe(true)
    // 네이버가 "0개"라고 명시한 테마는 **동기화 성공**이다. sweep 범위에 넣어야
    // 그 테마의 잔여 종목이 정리된다(실측: 밸류업 테마 212건이 영원히 활성이었다).
    expect([...syncedThemeIds].sort()).toEqual(['theme-empty', 'theme-ok'])
  })

  it('모든 테마가 비면 여전히 붕괴로 잡는다 — 안전장치는 유지된다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ stocks: [], totalCount: 0 }), { status: 200 },
    )))

    await expect(collectNaverFinanceStocks([
      { id: 'a', naverThemeId: '1' },
      { id: 'b', naverThemeId: '2' },
    ])).rejects.toThrow(/붕괴/)
  })
})

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

describe('valueRange 경계 — KRX 법정 범위', () => {
  const row = (over: Partial<{ currentPrice: number; priceChangePct: number; volume: number }> = {}) => ({
    themeId: 'theme-a',
    symbol: '458350',
    name: '에스팀',
    market: 'KOSPI' as const,
    currentPrice: 34_000,
    priceChangePct: 1.2,
    volume: 1_000,
    ...over,
  })

  const validate = (over: Parameters<typeof row>[0]) =>
    () => validateNaverFinanceThemeStocks([row(over)], { expectedRows: 1 })

  /**
   * 이 테스트가 이 블록의 존재 이유다.
   *
   * 게이트 목적은 시장 이상치 제거가 아니라 소스 열화·파싱 붕괴 탐지다. 평시 가격제한폭
   * (±30%)을 경계로 쓰면 합법적인 신규상장 시세 한 건이 테마 전체(수십 종목)를 버린다.
   * 실측: 에스팀(458350) 2026-03-09 +300%, 종가 34,000원.
   */
  it('신규상장일 따상(+300%)을 통과시킨다 — 공모가의 400%가 KRX 상한이다', () => {
    expect(validate({ priceChangePct: 300 })).not.toThrow()
  })

  it('신규상장일 하한(-40%)을 통과시킨다 — 공모가의 60%', () => {
    expect(validate({ priceChangePct: -40 })).not.toThrow()
  })

  it('정리매매 급락(-95%)을 통과시킨다 — 가격제한폭이 없다', () => {
    expect(validate({ priceChangePct: -95 })).not.toThrow()
  })

  it('법정 상한을 넘으면 여전히 막는다 — 파싱 붕괴 탐지력은 유지된다', () => {
    expect(validate({ priceChangePct: 301 })).toThrow(NaverFinanceThemeGateError)
    expect(validate({ priceChangePct: -101 })).toThrow(NaverFinanceThemeGateError)
  })

  it('등락률 칸에 거래량이 들어오는 전형적 파싱 붕괴를 잡는다', () => {
    expect(validate({ priceChangePct: 1_234_567 })).toThrow(NaverFinanceThemeGateError)
  })

  /**
   * 2026-09-17 회귀: 로그에 `valueRange`만 찍혀 어떤 종목의 어떤 값이 걸렸는지 알 수 없었고
   * 원인 규명에 조사를 한 바퀴 더 돌아야 했다. 2026-09-10 리다이렉트 사고와 같은 실패 방식이다.
   */
  it('실패 메시지가 종목·필드·값·허용범위를 싣는다', () => {
    expect(validate({ priceChangePct: 999 })).toThrow(/458350/)
    expect(validate({ priceChangePct: 999 })).toThrow(/priceChangePct=999/)
    expect(validate({ priceChangePct: 999 })).toThrow(/허용 -100~300/)
  })

  it('여러 필드가 걸리면 전부 싣는다', () => {
    let message = ''
    try {
      validate({ currentPrice: 0, volume: -1 })()
    } catch (error) {
      message = error instanceof Error ? error.message : ''
    }
    expect(message).toContain('currentPrice=0')
    expect(message).toContain('volume=-1')
  })
})
