import { describe, expect, it } from 'vitest';
import { findUngroundedAttributedFigures } from '../source-grounding';

const SOURCES = [
  '한국은행은 기준금리를 연 3.25%로 동결했다.',
  '삼성전자 2024년 배당금 총액은 9조 8,094억원이다.',
  '검증 시세: 삼성전자 종가 55,300원, 1년 등락률 -12.4%',
].join('\n');

describe('findUngroundedAttributedFigures', () => {
  it('기관명을 붙였어도 근거에 없는 수치는 잡는다', () => {
    const text = '한국은행에 따르면 가계부채는 2,100조원에 달합니다. 금융감독원이 발표한 연체율은 0.8%입니다.';
    expect(findUngroundedAttributedFigures(text, SOURCES)).toEqual([
      '한국은행에 따르면 가계부채는 2,100조원에 달합니다.',
      '금융감독원이 발표한 연체율은 0.8%입니다.',
    ]);
  });

  it('근거에 있는 수치는 쉼표 표기가 달라도 통과한다', () => {
    const text = '한국은행에 따르면 기준금리는 3.25%입니다. 공시 자료에서 배당금 총액은 9조 8094억원으로 확인됩니다. 한국거래소 자료에 따르면 종가는 55300원이었습니다.';
    expect(findUngroundedAttributedFigures(text, SOURCES)).toEqual([]);
  });

  it('출처를 달지 않은 문장과 기간 표현은 보지 않는다', () => {
    const text = '배당락일 이후 주가는 3% 안팎 움직일 수 있습니다. 증권사 보고서에서 최근 6개월 흐름을 다뤘습니다.';
    expect(findUngroundedAttributedFigures(text, SOURCES)).toEqual([]);
  });

  it('숫자 일부만 겹치는 경우는 근거로 보지 않는다', () => {
    // 근거의 3.25를 3.2나 25로 착각하지 않는다
    expect(findUngroundedAttributedFigures('한국은행에 따르면 금리는 3.2%입니다.', SOURCES)).toHaveLength(1);
    expect(findUngroundedAttributedFigures('한국은행에 따르면 금리는 25%입니다.', SOURCES)).toHaveLength(1);
  });
});
