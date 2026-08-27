import { describe, expect, it } from 'vitest';
import {
  hasUsableDataLine,
  isEmptyChartCopy,
  isExcludedThemeSection,
  shouldIncludeTrend,
  shouldSplitStocks,
  stockRowsMatch,
} from '../capture-validate';

describe('빈 차트 차단', () => {
  it('비교선 없음 문구가 있으면 빈 차트로 본다', () => {
    expect(isEmptyChartCopy('비교선이 아직 없어요')).toBe(true);
  });

  it('축만 있는 짧은 path는 데이터 선이 아니다', () => {
    expect(hasUsableDataLine([{ d: 'M0,0 L100,0' }])).toBe(false);
  });

  it('곡선 path는 통과한다', () => {
    const d = `M0,80 C10,70 20,30 40,40 C60,50 80,10 120,20 C140,25 160,40 200,30`;
    expect(hasUsableDataLine([{ d }])).toBe(true);
  });

  it('빈 trend fixture는 이미지 수에 넣지 않는다', () => {
    expect(shouldIncludeTrend({ emptyCopy: true, dataLineCount: 0 })).toBe(false);
    expect(shouldIncludeTrend({ emptyCopy: false, dataLineCount: 1 })).toBe(true);
  });
});

describe('관련종목 행 수', () => {
  it('전체 8인데 7행이면 실패다', () => {
    expect(stockRowsMatch(7, 8)).toBe(false);
    expect(stockRowsMatch(8, 8)).toBe(true);
  });

  it('5행 이상이면 두 장으로 나눈다', () => {
    expect(shouldSplitStocks(4)).toBe(false);
    expect(shouldSplitStocks(8)).toBe(true);
  });
});

describe('theme 기본 제외', () => {
  it('outlook·pattern 이미지를 theme에 넣지 않는다', () => {
    expect(isExcludedThemeSection('5-outlook')).toBe(true);
    expect(isExcludedThemeSection('4-pattern')).toBe(true);
    expect(isExcludedThemeSection('1-hero')).toBe(false);
  });
});
