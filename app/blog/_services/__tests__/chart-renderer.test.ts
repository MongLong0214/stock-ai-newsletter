import { describe, expect, it } from 'vitest';
import type { StockSnapshot } from '../market-data';
import {
  monthTicks,
  niceStep,
  rebaseSeries,
  renderComparisonChart,
  renderPriceChart,
  spreadLabels,
  valueDomain,
} from '../chart-renderer';

function snapshot(name: string, start: number, drift: number): StockSnapshot {
  const series = [];
  for (let t = Date.parse('2025-11-10'), i = 0; t <= Date.parse('2026-11-06'); t += 86_400_000) {
    const d = new Date(t);
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    series.push({ date: d.toISOString().slice(0, 10), close: Math.round(start * (1 + drift * i + 0.03 * Math.sin(i / 7))), volume: 1000 + (i % 13) * 300 });
    i += 1;
  }
  const high = series.reduce((a, b) => (b.close > a.close ? b : a));
  const low = series.reduce((a, b) => (b.close < a.close ? b : a));
  const close = series.at(-1)!.close;
  return {
    code: '000000', name, market: 'KOSPI', series, asOf: series.at(-1)!.date, close,
    returns: { m1: 1, m3: 2, y1: Math.round((close / series[0].close - 1) * 1000) / 10 },
    high, low, fromHighPct: Math.round((close / high.close - 1) * 1000) / 10, fullYear: true,
  };
}

/** PNG IHDR의 가로·세로 */
const pngSize = (png: Buffer) => ({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) });
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('chart scales', () => {
  it('picks 1-2-2.5-5 steps and places evenly spaced ticks inside a padded domain', () => {
    expect(niceStep(37)).toBe(50);
    expect(niceStep(0.8)).toBe(1);
    expect(niceStep(2300)).toBe(2500);
    const d = valueDomain([1180, 1420]);
    expect(d.min).toBeLessThan(1180);
    expect(d.max).toBeGreaterThan(1420);
    expect(d.ticks).toEqual([1200, 1300, 1400]);
    expect(d.ticks.every((t) => t >= d.min && t <= d.max)).toBe(true);
    expect(valueDomain([500, 500]).ticks.length).toBeGreaterThan(0);
  });

  it('labels months once and keeps point labels apart', () => {
    const ticks = monthTicks(['2026-01-02', '2026-01-05', '2026-02-02', '2026-03-03']);
    expect(ticks.map((t) => t.date)).toEqual(['2026-02-02', '2026-03-03']);
    const ys = spreadLabels([100, 105, 108], 30, 0, 400);
    expect(ys[1] - ys[0]).toBeGreaterThanOrEqual(30);
    expect(ys[2] - ys[1]).toBeGreaterThanOrEqual(30);
  });

  it('rebases every series to 100 at its first close', () => {
    const [a] = rebaseSeries([snapshot('가', 1000, 0.002)]);
    expect(a.points[0].value).toBe(100);
  });
});

describe('chart rendering', () => {
  it('renders a 1600x900 PNG for one stock and for a comparison', async () => {
    const single = await renderPriceChart(snapshot('LG화학', 300_000, 0.001));
    expect(single.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
    expect(pngSize(single)).toEqual({ width: 1600, height: 900 });

    const comparison = await renderComparisonChart(
      [snapshot('한화에어로스페이스', 300_000, 0.004), snapshot('현대로템', 50_000, 0.003), snapshot('LIG디펜스앤에어로스페이스', 120_000, 0.002), snapshot('한국항공우주', 60_000, -0.0005)],
      '방산 테마 대표 종목 주가 비교',
    );
    expect(pngSize(comparison)).toEqual({ width: 1600, height: 900 });
  }, 60_000);
});
