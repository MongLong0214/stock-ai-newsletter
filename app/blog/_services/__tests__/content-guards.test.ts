import { describe, expect, it } from 'vitest';
import { findFutureDateClaim } from '../content-generator';
import { countFigureTokens, evaluateHumanization } from '../humanizer';
import { isClickbait } from '../../_config/clickbait-patterns';

const NOW = new Date('2026-08-27T00:00:00Z');

describe('findFutureDateClaim — 미래 시점 제목', () => {
  it('괄호 점 표기를 잡는다', () => {
    expect(findFutureDateClaim('2차전지 관련주 전망 (2026.10)', NOW)).toBe('2026.10');
  });

  it('괄호 밖 표기도 잡는다 — 예전 정규식이 놓치던 형태', () => {
    for (const title of ['2027년 1월 반도체 전망', '[2027.01] 코스피 시나리오', '2027-01 기준 정리']) {
      expect(findFutureDateClaim(title, NOW), title).not.toBeNull();
    }
  });

  it('연도만 있어도 미래면 잡는다', () => {
    expect(findFutureDateClaim('2027년 코스피 전망', NOW)).toBe('2027');
  });

  it('과거·현재 시점은 통과한다', () => {
    for (const title of ['2026년 8월 정리', '2025년 실적 리뷰', '2026.08 기준 관련주']) {
      expect(findFutureDateClaim(title, NOW), title).toBeNull();
    }
  });

  it('월 범위를 벗어난 숫자는 연월로 보지 않는다', () => {
    expect(findFutureDateClaim('종목 2027-99 코드', NOW)).toBe('2027');
  });
});

describe('countFigureTokens — 단위까지 보존 검증', () => {
  it('값과 단위를 함께 센다', () => {
    const counts = countFigureTokens('수익률 10%와 주가 10원');
    expect(counts.get('10%')).toBe(1);
    expect(counts.get('10원')).toBe(1);
  });

  it('같은 값이 여러 번 나오면 개수로 센다', () => {
    expect(countFigureTokens('10%에서 10%로').get('10%')).toBe(2);
  });
});

/** 가드의 길이·키워드 하한을 통과하는 본문 */
const body = (figures: string) =>
  [
    '## 주식 기술적 분석 기초',
    `주식 기술적 분석에서 ${figures} 수치를 봅니다. `.repeat(3),
    '주식 기술적 분석은 지표를 해석하는 방법입니다. '.repeat(20),
  ].join('\n\n');

describe('evaluateHumanization — 수치 변형·창작 차단', () => {
  it('단위가 바뀌면 반려한다 — Set 비교로는 통과하던 구멍', () => {
    const original = body('10%');
    const candidate = original.replace(/10%/g, '10원');
    const verdict = evaluateHumanization(original, candidate, '주식 기술적 분석');
    expect(verdict.accepted).toBe(false);
    expect(verdict.reason).toContain('수치');
  });

  it('원문에 없던 수치를 지어내면 반려한다', () => {
    const original = body('10%');
    const candidate = original.replace('수치를 봅니다.', '수치를 봅니다. 응답자의 85%가 그렇습니다.');
    const verdict = evaluateHumanization(original, candidate, '주식 기술적 분석');
    expect(verdict.accepted).toBe(false);
    expect(verdict.reason).toContain('없던 수치');
  });
});

describe('isClickbait — 활용형까지 잡는다', () => {
  it('1차 재작성이 놓쳤던 어미를 잡는다', () => {
    for (const title of [
      '2026년 3D 프린터 관련주 정리: 아직도 예전 종목만 보다가 수익 놓치실 건가요?',
      '차트 분석 없이 들어갔다간 큰일 납니다',
      'PER만 보면 놓치는 고성장주',
      '건기식 관련주 중 진짜는 따로 있었다',
    ]) {
      expect(isClickbait(title), title).toBe(true);
    }
  });

  it('사실형 제목은 통과한다', () => {
    for (const title of [
      '카카오뱅크 관련주 7종목 — 지분 구조와 IT 파트너십 정리 (2026.08)',
      '2차전지 관련주 전망 — 생명주기 점수와 관련주 현황',
    ]) {
      expect(isClickbait(title), title).toBe(false);
    }
  });
});
