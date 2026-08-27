import { beforeEach, describe, expect, it, vi } from 'vitest';

// theme_stocks 로드는 DB 의존이므로 모듈 목으로 대체
vi.mock('@/lib/supabase/paginate', () => ({
  fetchAllRows: vi.fn(async () => [
    { name: '삼성전자' }, { name: '카카오페이' }, { name: 'KG이니시스' }, { name: '갤럭시아머니트리' },
  ]),
}));
vi.mock('@/lib/supabase/server-client', () => ({
  getServerSupabaseClient: vi.fn(() => ({ from: vi.fn() })),
}));

import { checkYmyl, countRealStocks, resetStockNamesCache } from '../ymyl-gate';

beforeEach(() => resetStockNamesCache());

describe('checkYmyl — 실제 발행물에서 나온 문제를 재현해 잡는다', () => {
  it('모호 출처 통계를 잡는다 (실측: "정부 통계에 따르면 … 200% 급증")', async () => {
    const v = await checkYmyl('정부 통계에 따르면 딥페이크 관련 범죄 발생률은 전년 대비 200% 이상 급증했으며', '보안주');
    expect(v.some((x) => x.rule === 'vague-source')).toBe(true);
  });

  it('구체 기관 인용은 통과한다', async () => {
    const v = await checkYmyl('금융감독원 공시에 따르면 해당 기업의 부채비율은 120%다.', '재무 분석');
    expect(v.filter((x) => x.rule === 'vague-source')).toHaveLength(0);
  });

  it('투자 권유 단정을 잡는다', async () => {
    const v = await checkYmyl('전문가들은 지금 매수 타이밍이라고 본다. 목표가 85,000원.', '전망');
    expect(v.some((x) => x.rule === 'solicitation')).toBe(true);
  });

  it('브랜드 언급 상한 초과를 잡는다 (실측: 16/20이 본문 광고)', async () => {
    const v = await checkYmyl('Stock Matrix가 좋다. 스탁매트릭스를 쓰자.', '뉴스레터');
    expect(v.some((x) => x.rule === 'brand-overuse')).toBe(true);
  });

  it('관련주 글에 실재 종목이 3개 미만이면 잡는다', async () => {
    const v = await checkYmyl('삼성전자와 카카오페이가 주목받는다.', '스테이블코인 관련주');
    expect(v.some((x) => x.rule === 'ghost-stocks')).toBe(true);
  });

  it('실재 종목 3개 이상 + 위반 없음이면 통과한다', async () => {
    const clean = '삼성전자, 카카오페이, KG이니시스가 이 테마의 주요 종목이다. 한국거래소 자료에 따르면 거래량이 늘었다.';
    expect(await checkYmyl(clean, '스테이블코인 관련주')).toHaveLength(0);
  });

  it('관련주류가 아닌 키워드에는 종목 검사를 하지 않는다', async () => {
    const v = await checkYmyl('RSI는 상대강도지수다. 70 이상은 과매수 구간이다.', 'RSI 활용법');
    expect(v.filter((x) => x.rule === 'ghost-stocks')).toHaveLength(0);
  });
});

describe('countRealStocks', () => {
  it('본문에 등장하는 사전 내 종목만 센다', () => {
    const dict = new Set(['삼성전자', '카카오페이']);
    expect(countRealStocks('삼성전자와 유령종목월드가 있다', dict)).toBe(1);
  });
});
