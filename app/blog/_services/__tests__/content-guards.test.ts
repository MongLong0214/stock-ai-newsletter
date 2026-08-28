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
  it('목록 마커·서수 정리는 반려하지 않는다 — 오탐 회귀 방지', () => {
    // 맨 숫자에 개수 비교를 걸었을 때 실측 3편 중 2편이 이 이유로 반려됐다
    const original = body('10%').replace('수치를 봅니다.', '수치를 봅니다. 1) 첫째 2) 둘째 3) 셋째.');
    const candidate = original.replace('1) 첫째 2) 둘째 3) 셋째.', '첫째와 둘째, 셋째를 차례로 봅니다.');
    const verdict = evaluateHumanization(original, candidate, '주식 기술적 분석');
    // 다른 가드(AI 티 등)에 걸릴 수는 있지만 **수치** 사유로는 반려되지 않아야 한다
    expect(verdict.reason ?? '').not.toContain('수치');
  });

  it('5000만원 → 5천만원 재표기는 반려하지 않는다', () => {
    const original = body('10%').replace('수치를 봅니다.', '수치를 봅니다. 공제 한도는 5000만원입니다.');
    const candidate = original.replace('5000만원', '5천만원');
    const verdict = evaluateHumanization(original, candidate, '주식 기술적 분석');
    expect(verdict.accepted, verdict.reason ?? '').toBe(true);
  });

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

describe('findFutureDateClaim — KST 기준 (UTC 러너 회귀 방지)', () => {
  it('KST로 9월이 됐으면 (2026.09)를 미래로 보지 않는다', () => {
    // UTC 2026-08-31 20:30 == KST 2026-09-01 05:30. 크론이 도는 시각이다.
    const utcRunner = new Date('2026-08-31T20:30:00Z');
    expect(findFutureDateClaim('반도체 관련주 전망 (2026.09)', utcRunner)).toBeNull();
  });

  it('KST로도 아직 안 온 달은 미래로 잡는다', () => {
    expect(findFutureDateClaim('반도체 관련주 전망 (2026.10)', new Date('2026-08-31T20:30:00Z'))).toBe('2026.10');
  });
});

describe('countFigureTokens — 자릿수 환산 + 단위 구분', () => {
  it('원화와 달러를 구분한다', () => {
    const counts = countFigureTokens('매출 10억원과 수출 10억달러');
    expect(counts.get('1000000000원')).toBe(1);
    expect(counts.get('1000000000달러')).toBe(1);
  });

  it('5000만원과 5천만원을 같은 값으로 본다 — 한국어 재표기 허용', () => {
    expect(countFigureTokens('공제 5000만원').get('500000000원'))
      .toBe(countFigureTokens('공제 5천만원').get('500000000원'));
  });
});

describe('checkYmyl 모호 출처 — 수식어 + 결과 조합', () => {
  it('"최근 연구 결과에 따르면"을 잡는다', async () => {
    const { checkYmyl } = await import('../ymyl-gate');
    const v = await checkYmyl('최근 연구 결과에 따르면 응답자의 80% 이상이 그렇다.', '시장 분석');
    expect(v.some((x) => x.rule === 'vague-source')).toBe(true);
  });

  it('기관명 인용은 계속 통과한다', async () => {
    const { checkYmyl } = await import('../ymyl-gate');
    const v = await checkYmyl('한국은행 통계에 따르면 금리가 동결됐다.', '시장 분석');
    expect(v.filter((x) => x.rule === 'vague-source')).toHaveLength(0);
  });
});

describe('volumeProbes — 롱테일 구절이 아니라 주제(헤드)를 잰다', () => {
  it('전체 구절·앞 두 어절·첫 어절을 조회 대상으로 만든다', async () => {
    const { volumeProbes } = await import('../keyword-generator');
    expect(volumeProbes('리비안 관련주 HL만도 vs TCC스틸')).toEqual([
      '리비안 관련주 HL만도 vs TCC스틸',
      '리비안 관련주',
      '리비안',
    ]);
  });

  it('두 어절 키워드는 중복 없이 두 개만 만든다', async () => {
    const { volumeProbes } = await import('../keyword-generator');
    expect(volumeProbes('IPO 일정')).toEqual(['IPO 일정', 'IPO']);
  });

  it('한 어절이면 하나만', async () => {
    const { volumeProbes } = await import('../keyword-generator');
    expect(volumeProbes('공모주')).toEqual(['공모주']);
  });

  it('한 글자 토큰은 힌트로 쓰지 않는다', async () => {
    const { volumeProbes } = await import('../keyword-generator');
    expect(volumeProbes('A 관련주 분석')).not.toContain('A');
  });
});

describe('INVESTMENT_SOLICITATION_RE — 명령형 투자권유', () => {
  it('직접 권유 문장을 잡는다', async () => {
    const { checkYmyl } = await import('../ymyl-gate');
    for (const bad of [
      '이 종목은 지금 매수하세요.',
      '전문가들은 매수를 권합니다.',
      '지금 사세요, 기회입니다.',
      '비중을 늘리세요.',
      '목표가 85,000원을 제시합니다.',
    ]) {
      const v = await checkYmyl(bad, '전망');
      expect(v.some((x) => x.rule === 'solicitation'), bad).toBe(true);
    }
  });

  it('사실 서술은 통과한다', async () => {
    const { checkYmyl } = await import('../ymyl-gate');
    for (const ok of [
      '이번 주 관련 기사는 41건으로 지난주보다 늘었습니다.',
      '점수는 71점이며 정점 구간입니다.',
    ]) {
      const v = await checkYmyl(ok, '시장 분석');
      expect(v.filter((x) => x.rule === 'solicitation'), ok).toHaveLength(0);
    }
  });
});
