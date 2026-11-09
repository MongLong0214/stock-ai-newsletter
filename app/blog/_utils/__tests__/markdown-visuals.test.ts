import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { MarketContext, StockSnapshot } from '../../_services/market-data';
import {
  buildDataSection,
  chartAlt,
  dataSectionTitle,
  extractCoverImage,
  imageMarkdown,
  insertAfterFirstSection,
  insertCover,
  insertInSection,
  listH2Headings,
  stripLeadingH1,
} from '../markdown-visuals';

const BASE = 'https://x.supabase.co/storage/v1/object/public/blog-images/posts/s';

beforeAll(() => { vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://x.supabase.co'); });
afterAll(() => { vi.unstubAllEnvs(); });
const img = (name: string) => ({ url: `${BASE}/r-${name}-1536x1024.webp`, alt: `${name} 대체텍스트`, caption: `${name} 캡션` });

const DOC = [
  '# 제목',
  '',
  '도입 문단입니다.',
  '',
  '## 첫 섹션',
  '',
  '첫 섹션 문단 한 줄.',
  '이어지는 줄.',
  '',
  '- 목록',
  '',
  '## 표 섹션',
  '',
  '| a | b |',
  '|--|--|',
  '| 1 | 2 |',
  '',
  '```',
  '## 코드 안 헤딩',
  '```',
  '',
  '## 마지막 섹션',
  '',
  '끝 문단.',
].join('\n');

function snapshot(name: string, closes: number[], fullYear = true): StockSnapshot {
  const series = closes.map((close, i) => ({ date: `2026-${String(1 + Math.floor(i / 28)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`, close, volume: 10 }));
  const high = series.reduce((a, b) => (b.close > a.close ? b : a));
  const low = series.reduce((a, b) => (b.close < a.close ? b : a));
  const close = closes.at(-1)!;
  return {
    code: '000000', name, market: 'KOSPI', series, asOf: series.at(-1)!.date, close,
    returns: { m1: 1.5, m3: -2.25, y1: fullYear ? Math.round((close / closes[0] - 1) * 1000) / 10 : null },
    high, low, fromHighPct: Math.round((close / high.close - 1) * 1000) / 10, fullYear,
  };
}

describe('image markdown', () => {
  it('neutralises characters that would break the image syntax', () => {
    expect(imageMarkdown({ url: 'https://a/b.webp', alt: '알트 [링크](x) "따옴표" <b>', caption: '캡션 | 표 `코드`' }))
      .toBe('![알트 링크 (x) 따옴표 b](https://a/b.webp "캡션 표 코드")');
  });
});

describe('insertion', () => {
  it('lists H2 headings outside code fences', () => {
    expect(listH2Headings(DOC)).toEqual(['첫 섹션', '표 섹션', '마지막 섹션']);
  });

  it('puts the cover right after the leading H1, or first when there is none', () => {
    const withH1 = insertCover(DOC, img('cover'));
    expect(withH1.split('\n').slice(0, 3)).toEqual(['# 제목', '', imageMarkdown(img('cover'))]);
    expect(insertCover('본문만', img('cover')).startsWith(imageMarkdown(img('cover')))).toBe(true);
  });

  it('places a section image after the first paragraph, or right after the heading before a table', () => {
    const afterParagraph = insertInSection(DOC, '첫 섹션', img('s1'))!;
    const lines = afterParagraph.split('\n');
    const at = lines.indexOf(imageMarkdown(img('s1')));
    expect(lines[at - 2]).toBe('이어지는 줄.');
    expect(lines[at + 2]).toBe('- 목록');

    const beforeTable = insertInSection(DOC, '표 섹션', img('s2'))!.split('\n');
    expect(beforeTable[beforeTable.indexOf('## 표 섹션') + 2]).toBe(imageMarkdown(img('s2')));
  });

  it('refuses headings that do not exist, including ones inside code fences', () => {
    expect(insertInSection(DOC, '없는 섹션', img('x'))).toBeNull();
    expect(insertInSection(DOC, '코드 안 헤딩', img('x'))).toBeNull();
  });

  it('inserts a block before the second H2, or appends it when there is only one', () => {
    const out = insertAfterFirstSection(DOC, '## 데이터 블록\n\n내용').split('\n');
    expect(out.indexOf('## 데이터 블록')).toBeLessThan(out.indexOf('## 표 섹션'));
    expect(out.indexOf('## 데이터 블록')).toBeGreaterThan(out.indexOf('## 첫 섹션'));
    expect(insertAfterFirstSection('## 하나\n\n본문', '## 블록').endsWith('## 블록\n')).toBe(true);
  });

  it('never splits a numbered list of sections', () => {
    const numbered = ['도입', '', '## 1. 첫째', '', '가', '', '## 2. 둘째', '', '나', '', '## 자주 묻는 질문', '', '다'].join('\n');
    const out = insertAfterFirstSection(numbered, '## 데이터 블록').split('\n');
    expect(out.indexOf('## 데이터 블록')).toBeLessThan(out.indexOf('## 1. 첫째'));
    const steps = ['## 개요', '', '가', '', '## Step 1: 하나', '', '나', '', '## Step 2: 둘', '', '다'].join('\n');
    const stepOut = insertAfterFirstSection(steps, '## 데이터 블록').split('\n');
    expect(stepOut.indexOf('## 데이터 블록')).toBeGreaterThan(stepOut.indexOf('## 개요'));
    expect(stepOut.indexOf('## 데이터 블록')).toBeLessThan(stepOut.indexOf('## Step 1: 하나'));
  });
});

describe('data section', () => {
  const single: MarketContext = { stocks: [snapshot('LG화학', [100, 120, 90, 110])], theme: { id: 't1', name: '2차전지' }, direct: true, asOf: '2026-01-04' };
  const themed: MarketContext = {
    stocks: [snapshot('한화', [100, 150]), snapshot('현대로템', [100, 80], false)],
    theme: { id: 't2', name: '방산' }, direct: false, asOf: '2026-01-02',
  };

  it('writes deterministic facts, a table, the method note and the theme link', () => {
    const md = buildDataSection(single, img('chart'));
    expect(md.startsWith('## 데이터로 보는 LG화학 주가 흐름')).toBe(true);
    expect(md).toContain(imageMarkdown(img('chart')));
    expect(md).toContain('LG화학의 2026-01-04 종가는 110원입니다. 최근 1년 동안 주가는 10.0% 올랐습니다.');
    expect(md).toContain('최저가는 90원(2026-01-03)입니다.');
    expect(md).toContain('최고 종가보다 8.3% 낮습니다');
    expect(md).not.toMatch(/원로|원였고/);
    expect(md).toContain('| LG화학 | 110원 | +1.5% | -2.3% | +10.0% | 120원 | -8.3% |');
    expect(md).toContain('과거 주가 흐름이 앞으로의 수익을 보장하지 않습니다');
    expect(md).toContain('[2차전지 테마 데이터](/themes/t1)');
  });

  it('describes theme picks by trading value and uses the period label when a stock lacks a full year', () => {
    expect(dataSectionTitle(themed)).toBe('방산 테마 대표 종목 주가');
    const md = buildDataSection(themed, null);
    expect(md).not.toContain('![');
    expect(md).toContain('최근 거래일 거래대금이 많은 방산 테마 종목 2개');
    expect(md).toContain('2026-01-01 이후 등락률은 한화 +50.0%, 현대로템 -20.0%');
    expect(md).toContain('두 종목 중 등락률이 더 높은 종목은 한화입니다.');
  });

  it('compares by higher and lower return so the wording holds when every stock rose', () => {
    const allUp: MarketContext = {
      stocks: [snapshot('가종목', [100, 130]), snapshot('나종목', [100, 110]), snapshot('다종목', [100, 120])],
      theme: null, direct: true, asOf: '2026-01-02',
    };
    const md = buildDataSection(allUp, null);
    expect(md).toContain('등락률이 가장 높은 종목은 가종목, 가장 낮은 종목은 나종목입니다.');
    expect(md).not.toContain('내린 종목');
    expect(md).not.toContain('테마 데이터');
  });

  it('ranks stocks with different histories from the common start date, like the chart', () => {
    const late = { ...snapshot('신규상장', [100, 100, 100, 200], false) };
    const shifted = { ...late, series: late.series.slice(2) }; // 첫 거래일 2026-01-03
    const ctx: MarketContext = { stocks: [snapshot('기존', [100, 100, 50, 60]), shifted], theme: null, direct: true, asOf: '2026-01-04' };
    const md = buildDataSection(ctx, null);
    expect(md).toContain('2026-01-03 이후 등락률은 기존 +20.0%, 신규상장 +100.0%입니다.');
    expect(chartAlt(ctx)).toContain('(2026-01-03 이후). 기존 +20.0%, 신규상장 +100.0%');
  });

  it('never calls a flat year a rise or a close just below the high the high', () => {
    const flat = buildDataSection({ stocks: [snapshot('평탄', [100, 120, 100])], theme: null, direct: true, asOf: '2026-01-03' }, null);
    expect(flat).toContain('주가는 거의 변동이 없었습니다.');
    const nearHigh = snapshot('근접', [80000, 100000, 99980]);
    const md = buildDataSection({ stocks: [{ ...nearHigh, fromHighPct: -0 }], theme: null, direct: true, asOf: '2026-01-03' }, null);
    expect(md).not.toContain('최고 종가입니다');
    expect(md).toContain('최고 종가보다 0.1% 낮습니다');
  });

  it('describes the chart numbers in the alt text', () => {
    expect(chartAlt(single)).toContain('LG화학 최근 1년 일별 종가 차트');
    expect(chartAlt(themed)).toContain('시작일 종가 100으로 환산');
  });
});

describe('cover extraction and H1 stripping', () => {
  it('only treats our own storage cover as the cover image', () => {
    const md = insertCover(DOC, img('cover'));
    expect(extractCoverImage(md)).toEqual({ url: img('cover').url, alt: img('cover').alt, caption: img('cover').caption, width: 1536, height: 1024 });
    expect(extractCoverImage('![x](https://evil.example/r-cover-1536x1024.webp "c")')).toBeNull();
    expect(extractCoverImage('![x](https://evil.example/storage/v1/object/public/blog-images/x-cover-1200x630.png "c")')).toBeNull();
    expect(extractCoverImage(insertInSection(DOC, '첫 섹션', img('section1'))!)).toBeNull();
    expect(extractCoverImage(null)).toBeNull();
  });

  it('removes only a leading H1', () => {
    expect(stripLeadingH1(DOC).startsWith('도입 문단입니다.')).toBe(true);
    expect(stripLeadingH1('## 섹션\n\n본문')).toBe('## 섹션\n\n본문');
    expect(stripLeadingH1('본문\n\n# 중간 H1')).toBe('본문\n\n# 중간 H1');
  });
});
