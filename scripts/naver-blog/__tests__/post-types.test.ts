import { describe, expect, it } from 'vitest';

import { pickType, THEME_COOLDOWN_DAYS, typeForHistory } from '../post-types';

describe('발행 유형 로테이션', () => {
  it('7일 주기로 5종을 돈다', () => {
    const week = Array.from({ length: 7 }, (_, i) => pickType(i));
    expect(week).toEqual(['theme', 'ranking', 'theme', 'similar', 'theme', 'news', 'evergreen']);
  });

  it('같은 유형이 이틀 연속 나오지 않는다 — 동일 템플릿 반복이 저품질 신호다', () => {
    for (let i = 0; i < 21; i++) {
      expect(pickType(i), `회차 ${i}`).not.toBe(pickType(i + 1));
    }
  });

  it('주기를 넘어가도 순서가 이어진다', () => {
    expect(pickType(7)).toBe(pickType(0));
    expect(pickType(15)).toBe(pickType(1));
  });

  it('발행 기록 수로 회차를 센다 (별도 카운터 없음)', () => {
    expect(typeForHistory(0)).toBe('theme');
    expect(typeForHistory(3)).toBe('similar');
  });

  it('테마 쿨다운은 2주 — 매일 발행 시 상승 목록이 며칠씩 겹친다', () => {
    expect(THEME_COOLDOWN_DAYS).toBeGreaterThanOrEqual(7);
  });
});
