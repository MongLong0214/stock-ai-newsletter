import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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

describe('theme-history-seed.json', () => {
  // 머지 후 main은 Actions 캐시(브랜치 스코프)를 못 읽으므로 이 파일이 유일한 쿨다운
  // 근거다. 항목이 조용히 무동작이 되면 발행된 테마가 쿨다운 안에 재발행된다.
  //
  // 이 테스트가 잡는 것: 오타·절단·잘못된 시각.
  // 이 테스트가 잡지 못하는 것: 형식은 맞지만 실존하지 않는 테마 ID(실제로 한 번 들어갔다).
  // 그 계열은 `_source` 필드에 재도출 절차를 적어두는 것으로 막는다 — CI 아티팩트의
  // state/theme-history.json이 권위 있는 값이고, 이름→ID는 랭킹 API로 대조한다.
  const seed = JSON.parse(
    readFileSync(join(process.cwd(), 'scripts', 'naver-blog', 'theme-history-seed.json'), 'utf-8'),
  ) as Record<string, string>;

  it('설명 키를 뺀 모든 항목이 UUID와 유효한 ISO 시각이다', () => {
    const entries = Object.entries(seed).filter(([k]) => !k.startsWith('_'));
    expect(entries.length).toBeGreaterThan(0);
    for (const [id, iso] of entries) {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(Number.isFinite(Date.parse(iso))).toBe(true);
      expect(Date.parse(iso)).toBeLessThanOrEqual(Date.now());
    }
  });

});
