import { describe, expect, it } from 'vitest';
import { composeBody, composeTags, composeTitle, type ThemeDetail } from '../make-draft';
import { checkFormat, FORMAT } from '../format';
import { countBold, countColor, countQuotes, firstSentence, stripFormat } from '../draft-model';

const DUTY_FREE: ThemeDetail = {
  name: '면세점',
  score: {
    change7d: 7,
    components: { activity: 0.67, interest: 0.89, newsMomentum: 0.76, volatility: 0.3 },
    raw: { baseline30dAvg: 85.5, newsLastWeek: 89, newsThisWeek: 59, recent7dAvg: 89.3 },
    stageKo: '정점',
    updatedAt: '2026-08-26',
    value: 68,
  },
  stockCount: 8,
  stocks: [
    { market: 'KOSDAQ', name: 'JTC', symbol: '950170' },
    { market: 'KOSPI', name: '신세계', symbol: '004170' },
    { market: 'KOSDAQ', name: '토니모리', symbol: '214420' },
    { market: 'KOSPI', name: '한국정보통신', symbol: '025770' },
    { market: 'KOSPI', name: '현대백화점', symbol: '069960' },
    { market: 'KOSDAQ', name: '글로벌텍스프리', symbol: '204620' },
    { market: 'KOSPI', name: '호텔신라', symbol: '008770' },
    { market: 'KOSPI', name: 'HDC', symbol: '012630' },
  ],
};

const THEME_ID = '76d40722-382b-4653-9a7c-49f948f04a67';

describe('composeTitle', () => {
  it('25~45자이고 관련주 키워드로 시작하며 숫자를 포함한다', () => {
    const title = composeTitle(DUTY_FREE, 8);
    expect(title.length).toBeGreaterThanOrEqual(FORMAT.titleMin);
    expect(title.length).toBeLessThanOrEqual(FORMAT.titleMax);
    expect(title.startsWith('면세점 관련주')).toBe(true);
    expect(title).toMatch(/\d/);
  });

  it('긴 테마명은 45자 이하로 축약한다', () => {
    const long: ThemeDetail = {
      ...DUTY_FREE,
      name: '초장대한테마이름열두글자넘김처리',
    };
    expect(composeTitle(long, 8).length).toBeLessThanOrEqual(FORMAT.titleMax);
  });
});

describe('composeBody', () => {
  const body = composeBody(DUTY_FREE, THEME_ID);
  const plain = stripFormat(body);

  it('상세 API change7d(+7)를 쓰고 랭킹 +3을 쓰지 않는다', () => {
    expect(body).toContain('+7점');
    expect(body).not.toContain('+3점');
  });

  it('공용 글자 수 1,500~2,500, 권장 1,800~2,200', () => {
    expect(plain.length).toBeGreaterThanOrEqual(FORMAT.bodyMin);
    expect(plain.length).toBeLessThanOrEqual(FORMAT.bodyMax);
    expect(plain.length).toBeGreaterThanOrEqual(FORMAT.bodyRecommendedMin);
    expect(plain.length).toBeLessThanOrEqual(FORMAT.bodyRecommendedMax);
  });

  it('첫 문장에 목표 키워드가 정확 일치한다', () => {
    expect(firstSentence(body)).toContain('면세점 관련주');
  });

  it('인용구 3~5개, 권장 4개', () => {
    expect(countQuotes(body)).toBeGreaterThanOrEqual(FORMAT.quoteMin);
    expect(countQuotes(body)).toBeLessThanOrEqual(FORMAT.quoteMax);
    expect(body).toContain('>> 점수 현황');
    expect(body).toContain('>> 점수를 만든 네 가지 요소');
    expect(body).toContain('>> 관련종목 8개');
    expect(body).toContain('>> 정리');
    expect(body).not.toContain('>> 생명주기 단계는 무엇을 뜻하나');
    expect(body).not.toContain('>> 데이터는 어떻게 갱신되나');
  });

  it('볼드 10~20회, 색상 마커가 있다', () => {
    expect(countBold(body)).toBeGreaterThanOrEqual(FORMAT.boldMin);
    expect(countBold(body)).toBeLessThanOrEqual(FORMAT.boldMax);
    expect(countColor(body)).toBeGreaterThanOrEqual(1);
    expect(body).toContain('[[r:+7점]]');
  });

  it('고지·출처·기준일·CTA·방법론 링크가 있다', () => {
    expect(plain).toContain('투자 판단과 그 결과는');
    expect(plain).toContain('네이버 데이터랩');
    expect(plain).toContain('2026-08-26');
    expect(body).toContain(`https://stockmatrix.co.kr/themes/${THEME_ID}`);
    expect(body).toContain('https://stockmatrix.co.kr/themes/methodology');
  });

  it('전망·추천 문구가 없다', () => {
    const withoutDisclaimer = body.replace(/특정 종목의 매수·매도를 권하는 것이 아니며[^.]*\./g, '');
    expect(withoutDisclaimer).not.toMatch(/테마 전망|상승 가능성|독자적 흐름 가능성|추천합니다/);
  });

  it('checkFormat을 통과한다', () => {
    const tags = composeTags(DUTY_FREE);
    expect(tags).toHaveLength(11);
    expect(checkFormat({
      body,
      images: ['a.png', 'b.png', 'c.png', 'd.png'],
      meta: { sourceSnapshot: { score: 68, change7d: 7 } },
      outsideUrl: `https://stockmatrix.co.kr/themes/${THEME_ID}`,
      tags,
      title: composeTitle(DUTY_FREE, 8),
    })).toEqual([]);
  });
});
