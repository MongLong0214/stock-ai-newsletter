import { describe, expect, it } from 'vitest';

import { evergreenIndexForDate, kstDayIndex, pickType, THEME_COOLDOWN_DAYS, typeForDate } from '../post-types';

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
    expect(pickType(0)).toBe('theme');
    expect(pickType(3)).toBe('similar');
  });

  it('테마 쿨다운은 2주 — 매일 발행 시 상승 목록이 며칠씩 겹친다', () => {
    expect(THEME_COOLDOWN_DAYS).toBeGreaterThanOrEqual(7);
  });
});

describe('날짜 파생 로테이션 — CI에 상태가 없어도 유형이 돈다', () => {
  const day = (iso: string) => Date.parse(iso);

  it('KST 날짜가 바뀌면 유형도 바뀐다', () => {
    const d0 = kstDayIndex(day('2026-08-27T01:00:00Z')); // KST 10:00
    const d1 = kstDayIndex(day('2026-08-28T01:00:00Z'));
    expect(d1 - d0).toBe(1);
    expect(typeForDate(day('2026-08-27T01:00:00Z'))).toBe(pickType(d0));
  });

  it('UTC 자정을 넘겨도 같은 KST 날짜면 같은 유형이다', () => {
    // KST 2026-08-27 08:00 == UTC 2026-08-26 23:00
    expect(kstDayIndex(day('2026-08-26T23:00:00Z'))).toBe(kstDayIndex(day('2026-08-27T05:00:00Z')));
  });

  it('7일 주기로 같은 유형이 돌아온다', () => {
    const base = day('2026-08-27T01:00:00Z');
    expect(typeForDate(base + 7 * 86_400_000)).toBe(typeForDate(base));
  });

  it('evergreen 주제 인덱스는 7발행마다 하나씩 넘어간다', () => {
    const base = day('2026-08-27T01:00:00Z');
    expect(evergreenIndexForDate(base + 7 * 86_400_000) - evergreenIndexForDate(base)).toBe(1);
  });
});
