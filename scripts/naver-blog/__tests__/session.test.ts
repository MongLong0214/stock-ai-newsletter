import { describe, expect, it } from 'vitest';

import { canPublish, recentPublishCount, WEEKLY_PUBLISH_LIMIT } from '../session';

const NOW = Date.parse('2026-08-27T00:00:00Z');
const daysAgo = (n: number) => new Date(NOW - n * 24 * 60 * 60 * 1000).toISOString();

describe('네이버 발행량 상한', () => {
  it('7일 안쪽 발행만 센다', () => {
    const history = [daysAgo(1), daysAgo(6), daysAgo(8), daysAgo(30)];
    expect(recentPublishCount(history, NOW)).toBe(2);
  });

  it('7일 경계에 6시간 여유를 둔다 — 매일 발행과 경계 충돌 방지', () => {
    // 정확히 168시간으로 두면 7일 전 글이 10:08에 발행되고 오늘 게이트가 10:06에
    // 돌 때 그 글이 아직 윈도우 안이라, 러너 실행 시각 흔들림만으로 정상 8일째
    // 발행이 거절된다. 6시간 여유가 그 충돌을 없앤다.
    expect(recentPublishCount([daysAgo(7)], NOW)).toBe(0);
    expect(recentPublishCount([daysAgo(6.9)], NOW)).toBe(0);
    expect(recentPublishCount([daysAgo(6.5)], NOW)).toBe(1);
  });

  it('상한에 도달하면 막는다', () => {
    const atLimit = Array.from({ length: WEEKLY_PUBLISH_LIMIT }, () => daysAgo(1));
    expect(canPublish(atLimit, NOW)).toBe(false);
    expect(canPublish(atLimit.slice(1), NOW)).toBe(true);
  });

  it('오래된 기록은 상한을 소모하지 않는다', () => {
    const stale = Array.from({ length: 20 }, (_, i) => daysAgo(8 + i));
    expect(canPublish(stale, NOW)).toBe(true);
  });

  it('깨진 타임스탬프는 무시한다 (셈에서 빠질 뿐 터지지 않는다)', () => {
    expect(recentPublishCount(['not-a-date', '', daysAgo(1)], NOW)).toBe(1);
  });
});
