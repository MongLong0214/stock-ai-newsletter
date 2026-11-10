import { describe, expect, it } from 'vitest';

import { DAILY_POST_COUNT, DRAFT_START_CUTOFF_MS, MAX_DAILY_PUBLISH } from '../pipeline';

describe('blog publish cadence', () => {
  it('keeps daily publishing within the reduced limit and stops starting drafts before the run budget', () => {
    expect(MAX_DAILY_PUBLISH).toBe(1);
    // 시각자료 마감(68분)·스크립트 한도(75분) 전에 초안 하나(실측 6~8분, 생성 재시도 포함 ~25분)가 끝나야 한다
    expect(DRAFT_START_CUTOFF_MS).toBeLessThanOrEqual(40 * 60_000);
    expect(DAILY_POST_COUNT).toBe(MAX_DAILY_PUBLISH);
  });
});
