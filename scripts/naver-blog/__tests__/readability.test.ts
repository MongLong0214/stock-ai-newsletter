import { describe, expect, it } from 'vitest';
import { applyReadabilityLayout, layoutBlock, splitSentences, MAX_PARAGRAPH_CHARS } from '../readability';

describe('splitSentences — 한국어 종결어미 기준', () => {
  it('마침표가 아니라 종결어미를 본다', () => {
    expect(splitSentences('점수는 71점입니다. 기준일은 2026-08-26입니다.')).toEqual([
      '점수는 71점입니다.',
      '기준일은 2026-08-26입니다.',
    ]);
  });

  it('숫자·도메인의 마침표를 문장 끝으로 오해하지 않는다', () => {
    expect(splitSentences('7일 평균은 40.3이며 기준일은 2026.08입니다.')).toHaveLength(1);
    expect(splitSentences('출처는 stockmatrix.co.kr 입니다.')).toHaveLength(1);
  });
});

describe('layoutBlock', () => {
  it('볼드 리드를 별도 문단으로 떼어낸다 — 한 줄로 붙던 문제', () => {
    const block = '**생명주기 단계는 무엇을 뜻하나** 점수의 절대값과 최근 추세를 함께 봅니다. 같은 점수라도 방향에 따라 다른 단계가 됩니다.';
    const out = layoutBlock(block);
    expect(out[0]).toBe('**생명주기 단계는 무엇을 뜻하나**');
    expect(out.length).toBeGreaterThan(1);
    expect(out[1]).not.toContain('생명주기 단계는 무엇을 뜻하나');
  });

  it('긴 문단을 2문장 이하로 쪼갠다', () => {
    const block = ['가나다라마바사아자차카타파하입니다.', '나다라마바사아자차카타파하가입니다.', '다라마바사아자차카타파하가나입니다.', '라마바사아자차카타파하가나다입니다.'].join(' ');
    const out = layoutBlock(block);
    expect(out.length).toBe(2);
    for (const p of out) expect(splitSentences(p).length).toBeLessThanOrEqual(2);
  });

  it('길이 상한을 넘으면 2문장이어도 쪼갠다', () => {
    const long = `${'가'.repeat(90)}입니다.`;
    const out = layoutBlock(`${long} ${long}`);
    expect(out.length).toBe(2);
    for (const p of out) expect(p.length).toBeLessThanOrEqual(MAX_PARAGRAPH_CHARS + long.length);
  });

  it('인용구·이미지 슬롯·URL·번호목록은 건드리지 않는다', () => {
    for (const block of [
      '>> 점수 현황',
      '{{image:1-hero}}',
      'https://stockmatrix.co.kr/themes/x',
      '① **삼성전자** (KOSPI 005930)\n② **신일전자** (KOSPI 002700)',
    ]) {
      expect(layoutBlock(block)).toEqual([block]);
    }
  });
});

describe('applyReadabilityLayout', () => {
  it('블록 구분(\\n\\n)을 유지하면서 문단 수를 늘린다', () => {
    const body = ['도입 문장입니다. 두 번째 문장입니다. 세 번째 문장입니다.', '>> 소제목', '본문 문장입니다.'].join('\n\n');
    const out = applyReadabilityLayout(body);
    expect(out.split('\n\n').length).toBeGreaterThan(body.split('\n\n').length);
    expect(out).toContain('>> 소제목');
  });

  it('텍스트를 잃지 않는다', () => {
    const body = '**리드** 첫 문장입니다. 둘째 문장입니다.\n\n>> 소제목\n\n셋째 문장입니다.';
    const strip = (t: string) => t.replace(/\s+/g, '');
    expect(strip(applyReadabilityLayout(body))).toBe(strip(body));
  });
});

describe('splitSentences — 서식 마커가 문장 끝에 붙은 경우', () => {
  it('색상 마커 뒤 마침표도 경계로 본다', () => {
    const out = splitSentences('기사는 41건으로 지난주보다 [[r:늘었습니다]]. 검색 관심도는 낮습니다.');
    expect(out).toHaveLength(2);
    expect(out[0]).toBe('기사는 41건으로 지난주보다 [[r:늘었습니다]].');
  });

  it('볼드 마커 뒤 마침표도 경계로 본다', () => {
    expect(splitSentences('점수는 **71점입니다**. 기준일은 어제입니다.')).toHaveLength(2);
  });
});
