import { describe, expect, it } from 'vitest';

import { KOREAN_MARKET_HOLIDAYS_BY_YEAR } from './holidays';

const KRX_HOLIDAYS_2024 = [
  '2024-01-01',
  '2024-02-09',
  '2024-02-12',
  '2024-03-01',
  '2024-04-10',
  '2024-05-01',
  '2024-05-06',
  '2024-05-15',
  '2024-06-06',
  '2024-08-15',
  '2024-09-16',
  '2024-09-17',
  '2024-09-18',
  '2024-10-01',
  '2024-10-03',
  '2024-10-09',
  '2024-12-25',
  '2024-12-31',
] as const;

describe('2024 Korean market holidays', () => {
  it('registers the complete KRX holiday set without weekend dates', () => {
    const holidays = KOREAN_MARKET_HOLIDAYS_BY_YEAR[2024];

    expect([...holidays].sort()).toEqual([...KRX_HOLIDAYS_2024]);
    expect([...holidays].every((date) => {
      const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
      return weekday !== 0 && weekday !== 6;
    })).toBe(true);
  });
});
