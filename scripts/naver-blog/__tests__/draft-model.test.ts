import { describe, expect, it } from 'vitest';
import {
  countBold,
  countColor,
  countQuotes,
  DEFAULT_BLOG_ID,
  detectBlogIdFromUrl,
  firstSentence,
  formatChange,
  parseRich,
  pickDetailNumbers,
  resolveBlogId,
  stripFormat,
  tagsToEnter,
  titleKeyword,
} from '../draft-model';

describe('서식 마커', () => {
  it('색상 마커를 볼드로 강등하지 않는다', () => {
    const segments = parseRich('최근 7일 변화는 [[r:+7점]]입니다');
    expect(segments).toEqual([
      { kind: 'text', text: '최근 7일 변화는 ' },
      { kind: 'color', color: 'r', text: '+7점' },
      { kind: 'text', text: '입니다' },
    ]);
  });

  it('볼드와 색상을 각각 센다', () => {
    const body = '점수는 **68점**, 변화는 [[r:+7점]]입니다.';
    expect(countBold(body)).toBe(1);
    expect(countColor(body)).toBe(1);
  });

  it('이미지 슬롯은 글자 수에서 빠진다', () => {
    expect(stripFormat('안녕\n\n{{image:1-hero}}\n\n세계')).toBe('안녕\n\n세계');
  });
});

describe('데이터 단일 소스', () => {
  it('랭킹 +3과 상세 +7이 다르면 상세를 택한다', () => {
    const picked = pickDetailNumbers({ score: 68, change7d: 3 }, { score: 68, change7d: 7 });
    expect(picked.change7d).toBe(7);
    expect(picked.diverged).toBe(true);
  });

  it('면세점 fixture에서 +7이 본문에 쓰일 값이다', () => {
    expect(formatChange(7)).toBe('+7점');
    expect(formatChange(-3)).toBe('-3점');
  });
});

describe('첫 문장 키워드', () => {
  it('제목의 "면세점 관련주"를 뽑는다', () => {
    expect(titleKeyword('면세점 관련주 TOP 8 — 정점 단계, 점수 68점 (2026.08)')).toBe('면세점 관련주');
  });

  it('첫 문장에서 키워드를 찾는다', () => {
    const body = '면세점 관련주 8개를 묶은 테마 점수가 이번 주 **68점**을 기록했습니다. 다음 문장.';
    expect(firstSentence(body)).toContain('면세점 관련주');
  });
});

describe('태그', () => {
  it('11개 태그를 10개로 자르지 않는다', () => {
    const tags = Array.from({ length: 11 }, (_, i) => `태그${i}`);
    expect(tagsToEnter(tags)).toHaveLength(11);
  });

  it('범위를 벗어나면 잘라내지 않고 중단한다', () => {
    expect(() => tagsToEnter(['하나'])).toThrow(/태그 1개/);
  });
});

describe('블로그 ID', () => {
  it('하이픈이 있는 stock-matrix를 감지한다', () => {
    expect(detectBlogIdFromUrl('https://blog.naver.com/stock-matrix/postwrite')).toBe('stock-matrix');
  });

  it('이전 계정 세션이면 재로그인을 요구한다', () => {
    expect(() => resolveBlogId('isaac0214', undefined)).toThrow(/npm run naver:login 재실행 필요/);
  });

  it('기본 대상은 stock-matrix다', () => {
    expect(resolveBlogId('stock-matrix', undefined)).toBe(DEFAULT_BLOG_ID);
    expect(resolveBlogId('stock-matrix', 'stock-matrix')).toBe('stock-matrix');
  });
});

describe('인용구 수', () => {
  it('인용구 줄을 센다', () => {
    const body = '>> 점수 현황\n\n본문\n\n>> 정리\n\n끝';
    expect(countQuotes(body)).toBe(2);
  });
});
