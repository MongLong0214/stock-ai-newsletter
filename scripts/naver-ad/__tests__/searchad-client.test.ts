import { describe, expect, it } from 'vitest';

import { HINT_KEYWORD_LIMIT, parseCount, sign } from '@/lib/naver-searchad';
import { chunk, demandKeywords, normalize, pickVolumes } from '../theme-demand';

describe('parseCount', () => {
  it('숫자는 그대로 쓴다', () => expect(parseCount(15700)).toBe(15700));
  it("'< 10' 검열값은 0으로 본다 (0~9 범위라는 뜻 — 10으로 치면 과대평가)", () => {
    expect(parseCount('< 10')).toBe(0);
    expect(parseCount('1,390')).toBe(1390);
  });
  it('알 수 없는 값은 0', () => {
    expect(parseCount(null)).toBe(0);
    expect(parseCount('N/A')).toBe(0);
  });
});

describe('sign', () => {
  it('서명 포맷이 고정된다 (바뀌면 인증이 통째로 깨진다)', () => {
    const a = sign('secret', '1700000000000', 'GET', '/keywordstool');
    expect(a).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(sign('secret', '1700000000000', 'GET', '/keywordstool')).toBe(a);
    expect(sign('other', '1700000000000', 'GET', '/keywordstool')).not.toBe(a);
    expect(sign('secret', '1700000000001', 'GET', '/keywordstool')).not.toBe(a);
  });
});

describe('chunk', () => {
  it('힌트 키워드 상한 단위로 자른다', () => {
    expect(chunk([1, 2, 3, 4, 5, 6, 7], HINT_KEYWORD_LIMIT)).toEqual([[1, 2, 3, 4, 5], [6, 7]]);
  });
  it('빈 배열은 빈 배치', () => expect(chunk([], HINT_KEYWORD_LIMIT)).toEqual([]));
});

describe('pickVolumes', () => {
  const rows = [
    { keyword: '2차전지', pc: 5040, mobile: 15700, total: 20740 },
    { keyword: '2차전지관련주', pc: 800, mobile: 3200, total: 4000 },
    { keyword: '2차전지테마주', pc: 20, mobile: 80, total: 100 },
  ];
  it('관련주와 테마주 두 축을 분리한다', () =>
    expect(pickVolumes('2차전지', rows)).toEqual({ related: 4000, themeStock: 100 }));
  it('공백이 있어도 매칭된다 (네이버가 힌트에서 공백을 무시)', () =>
    expect(pickVolumes('2차 전지', rows).related).toBe(4000));
  it('브랜드 검색량은 옵션으로만 포함한다', () =>
    expect(pickVolumes('2차전지', rows, true)).toEqual({ related: 4000, themeStock: 100, brand: 20740 }));
  it('없는 테마는 0/0', () =>
    expect(pickVolumes('없는테마', rows)).toEqual({ related: 0, themeStock: 0 }));
});

describe('demandKeywords', () => {
  it('실제 측정할 힌트 키워드를 직접 만든다', () => {
    expect(demandKeywords('로봇')).toEqual({
      brand: '로봇',
      related: '로봇 관련주',
      themeStock: '로봇 테마주',
    });
  });
});

describe('normalize', () => {
  it('공백을 제거하고 ASCII를 대문자로 맞춘다', () => {
    expect(normalize(' 2차 전지 ')).toBe('2차전지');
    expect(normalize(' U- Healthcare ')).toBe('U-HEALTHCARE');
  });
});
