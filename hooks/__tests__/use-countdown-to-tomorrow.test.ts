import { describe, expect, it } from 'vitest';
import { formatRemaining, nextDeliveryAt } from '../use-countdown-to-tomorrow';

/** KST 벽시계 → epoch ms */
const kst = (iso: string) => Date.parse(`${iso}+09:00`);

describe('next newsletter delivery countdown', () => {
  it('targets 07:30 KST today before delivery, the next trading day after it', () => {
    expect(nextDeliveryAt(kst('2026-11-11T06:00:00'))).toBe(kst('2026-11-11T07:30:00'));
    expect(nextDeliveryAt(kst('2026-11-11T07:45:00'))).toBe(kst('2026-11-12T07:30:00'));
  });

  it('skips weekends and market holidays', () => {
    // 금요일 오후 → 월요일
    expect(nextDeliveryAt(kst('2026-11-13T15:00:00'))).toBe(kst('2026-11-16T07:30:00'));
    // 12/24(목) 오후 → 12/25 성탄절 휴장 → 12/28(월)
    expect(nextDeliveryAt(kst('2026-12-24T15:00:00'))).toBe(kst('2026-12-28T07:30:00'));
  });

  it('formats days once the wait exceeds a day', () => {
    expect(formatRemaining(((20 * 60) + 29) * 60_000 + 33_000)).toBe('20시간 29분 33초');
    expect(formatRemaining((64 * 60 + 30) * 60_000)).toBe('2일 16시간 30분');
  });
});
