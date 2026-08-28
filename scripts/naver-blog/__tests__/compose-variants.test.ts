import { describe, expect, it } from 'vitest';

import { composeRanking, composeSimilar } from '../compose-variants';

const ROWS = Array.from({ length: 12 }, (_, i) => ({
  change: i % 3 === 0 ? 3 : i % 3 === 1 ? -2 : 0,
  name: `테마${i}`,
  score: 80 - i,
  stageKo: '정점',
}));

const COMPARISONS = [
  { currentDay: 201, pastPeakDay: 138, pastTheme: '엔젤산업', pastTotalDays: 173, similarity: 0.891 },
  { currentDay: 201, pastPeakDay: 90, pastTheme: '조림사업', pastTotalDays: 150, similarity: 0.74 },
];

describe('composeRanking', () => {
  const r = composeRanking(ROWS, '2026-08-27', 'https://stockmatrix.co.kr');

  it('규격 길이를 지킨다', () => {
    const plain = r.body.replace(/>> |\*\*|\[\[[rb]:|\]\]|\{\{image:[^}]+\}\}/g, '');
    expect(plain.length).toBeGreaterThanOrEqual(1500);
    expect(plain.length).toBeLessThanOrEqual(2500);
  });

  it('상위 10개만 나열한다', () => {
    expect(r.body).toContain('테마0');
    expect(r.body).toContain('테마9');
    expect(r.body).not.toContain('테마10');
  });

  it('투자 권유·단정 표현을 쓰지 않는다 (YMYL)', () => {
    // 면책 고지의 "매수·매도를 권하는 것이 아니며"는 정상이므로 권유형만 잡는다
    const withoutDisclaimer = r.body.replace(/특정 종목의 매수·매도를 권하는 것이 아니며[^.]*\./g, '');
    expect(withoutDisclaimer).not.toMatch(/지금\s*매수|매수\s*추천|목표가\s*[\d,]+원|수익률?\s*\d+\s*%\s*보장|급등\s*예정/);
  });

  it('면책 고지와 딥링크를 포함한다', () => {
    expect(r.body).toContain('투자자 본인의 책임');
    expect(r.body).toContain('stockmatrix.co.kr/themes');
  });
});

describe('composeSimilar', () => {
  const r = composeSimilar('면세점', 68, '정점', COMPARISONS, '2026-08-27', 'https://stockmatrix.co.kr/themes/x');

  it('규격 길이를 지킨다 (비교 건수가 적어도)', () => {
    const plain = r.body.replace(/>> |\*\*|\[\[[rb]:|\]\]|\{\{image:[^}]+\}\}/g, '');
    expect(plain.length).toBeGreaterThanOrEqual(1500);
  });

  it('유사도를 예측이 아니라 관측으로 서술한다', () => {
    expect(r.body).toContain('예측하는 값이 아닙니다');
    expect(r.body).toContain('인과관계가 아닙니다');
    const withoutDisclaimer = r.body.replace(/특정 종목의 매수·매도를 권하는 것이 아니며[^.]*\./g, '');
    expect(withoutDisclaimer).not.toMatch(/지금\s*매수|목표가\s*[\d,]+원/);
  });

  it('제목에 테마명과 유사도를 담는다', () => {
    expect(r.title).toContain('면세점');
    expect(r.title).toContain('89%');
  });
});
