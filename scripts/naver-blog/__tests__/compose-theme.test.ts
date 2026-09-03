import { describe, expect, it } from 'vitest';
import { composeBody, composeTags, composeTitle, type ThemeDetail } from '../make-draft';
import { checkFormat, FORMAT } from '../format';
import { countBold, countColor, countQuotes, firstSentence, stripFormat, type ImagePlacement } from '../draft-model';
import { applyReadabilityLayout } from '../readability';
import { planBodyActions } from '../publish-plan';

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

/**
 * 이미지 배치 간격 — FORMAT-SPEC §4의 숫자는 실측값이므로 여기서 고정한다.
 *
 * 개수·연속배치·CTA 뒤 검사는 planBodyActions가 런타임에 막는다. 하지만 "이미지 사이에
 * 읽을 텍스트가 얼마나 있나"는 어디서도 재지 않아서, 조합기 문구를 손대면 한쪽에 몰려도
 * 아무도 모른다. 발행 경로에 하한을 박으면 8자짜리 합성 픽스처까지 전부 막히고
 * 무인 발행이 사소한 문구 수정에 걸리므로, 실제 조합기 출력만 여기서 잰다.
 */
describe('이미지 배치 간격', () => {
  const place = (id: string): ImagePlacement => ({
    afterBlock: 'body',
    caption: `${id} 캡션`,
    capturedAt: '2026-08-26T00:00:00.000Z',
    id,
    path: `/tmp/${id}.png`,
    sha256: 'abc',
    sourceSection: id,
  });

  /** 이미지마다 그 앞에 놓인 본문·인용구 글자 수(공백 제외) */
  const gapsOf = (ids: readonly string[]): Array<{ before: number; id: string }> => {
    const actions = planBodyActions(applyReadabilityLayout(composeBody(DUTY_FREE, THEME_ID)), ids.map(place));
    const gaps: Array<{ before: number; id: string }> = [];
    let acc = 0;
    for (const action of actions) {
      if (action.kind === 'image') {
        gaps.push({ before: acc, id: action.path.replace(/^.*\//, '').replace(/\.png$/, '') });
        acc = 0;
        continue;
      }
      if (action.kind === 'paragraph' || action.kind === 'quote') {
        acc += stripFormat(action.text).replace(/\s/g, '').length;
      }
    }
    return gaps;
  };

  // 8종목이면 관련종목 표가 4개씩 두 장으로 나뉜다(shouldSplitStocks) — 실제 발행 경로다.
  it('분할 캡처(8종목) 실측 간격', () => {
    expect(gapsOf(['1-hero', '3-trend', '2-stocks-a', '2-stocks-b', '4-news'])).toEqual([
      { before: 98, id: '1-hero' },
      { before: 380, id: '3-trend' },
      { before: 188, id: '2-stocks-a' },
      { before: 82, id: '2-stocks-b' },
      { before: 397, id: '4-news' },
    ]);
  });

  it('미분할(4종목 이하) 실측 간격', () => {
    expect(gapsOf(['1-hero', '3-trend', '2-stocks', '4-news'])).toEqual([
      { before: 98, id: '1-hero' },
      { before: 380, id: '3-trend' },
      { before: 188, id: '2-stocks' },
      { before: 479, id: '4-news' },
    ]);
  });

  it('이미지 앞에 최소 한 문단은 있다 — 몰림 방지', () => {
    for (const ids of [
      ['1-hero', '3-trend', '2-stocks-a', '2-stocks-b', '4-news'],
      ['1-hero', '3-trend', '2-stocks', '4-news'],
    ]) {
      for (const gap of gapsOf(ids)) {
        expect(gap.before, `${gap.id} 앞 텍스트`).toBeGreaterThanOrEqual(80);
      }
    }
  });
});
