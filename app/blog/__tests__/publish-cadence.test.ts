import { describe, expect, it } from 'vitest';

import { DAILY_POST_COUNT, DRAFT_LIMIT, MAX_DAILY_PUBLISH } from '../pipeline';

describe('blog publish cadence', () => {
  it('keeps daily publishing and draft generation within the reduced limits', () => {
    expect(MAX_DAILY_PUBLISH).toBe(1);
    expect(DRAFT_LIMIT).toBeGreaterThanOrEqual(MAX_DAILY_PUBLISH);
    expect(DAILY_POST_COUNT).toBe(MAX_DAILY_PUBLISH);
  });
});
