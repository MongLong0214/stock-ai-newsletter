/**
 * 실측 시세 차트 PNG 렌더러 (next/og = satori + resvg)
 *
 * OG 이미지와 같은 엔진·폰트를 쓴다. 선·면은 SVG, 글자는 satori 텍스트로 그려
 * 한글이 폰트 그대로 래스터화된다(SVG <text>는 resvg가 폰트를 못 찾아 깨진다).
 * 숫자는 전부 KIS 실측값에서 나온다 — 모델이 그린 차트는 쓰지 않는다(YMYL).
 */

import { createElement as h, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { VISUAL_CONFIG } from '../_config/pipeline-config';
import type { PricePoint, StockSnapshot } from './market-data';

const { width: W, height: H } = VISUAL_CONFIG.chartSize;

const COLOR = {
  bg: '#0b1220',
  grid: '#1e293b',
  axis: '#334155',
  text: '#f1f5f9',
  sub: '#94a3b8',
  muted: '#64748b',
  up: '#34d399',
  down: '#f87171',
  volume: '#334155',
  base: '#475569',
};
/** 비교 차트 계열색 — 채도를 낮춘 4색 (첫 색은 사이트 강조색) */
export const SERIES_COLORS = ['#34d399', '#60a5fa', '#fbbf24', '#c084fc'] as const;

const PAD = 64;
const GUTTER = 132;
const PLOT_LEFT = PAD;
const PLOT_RIGHT = W - PAD - GUTTER;
const PLOT_W = PLOT_RIGHT - PLOT_LEFT;

// --- 폰트 ---

type FontDef = { name: string; data: Buffer; weight: 500 | 700; style: 'normal' };
let fontsPromise: Promise<FontDef[]> | null = null;

/** 전체 한글 글리프 폰트 (OG용 subset은 종목명 글자가 빠질 수 있다) */
function loadChartFonts(): Promise<FontDef[]> {
  fontsPromise ??= Promise.all(
    ([500, 700] as const).map(async (weight) => ({
      name: 'Noto Sans KR',
      data: await readFile(join(process.cwd(), `fonts/noto-sans-kr/noto-sans-kr-korean-${weight}-normal.woff`)),
      weight,
      style: 'normal' as const,
    })),
  ).catch((error: unknown) => {
    fontsPromise = null;
    throw error;
  });
  return fontsPromise;
}

// --- 스케일·포맷 (순수) ---

export function niceStep(raw: number): number {
  if (!(raw > 0)) return 1;
  const exp = 10 ** Math.floor(Math.log10(raw));
  const f = raw / exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * exp;
}

/** 위아래 여백을 둔 값 범위와 그 안의 눈금 */
export function valueDomain(values: readonly number[], padRatio = 0.15): { min: number; max: number; ticks: number[] } {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const range = hi - lo || Math.abs(hi) * 0.05 || 1;
  const min = lo - range * padRatio;
  const max = hi + range * padRatio;
  const step = niceStep((max - min) / 5);
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) ticks.push(Number(v.toPrecision(12)));
  return { min, max, ticks };
}

/** 월이 바뀌는 첫 거래일 눈금 (7개 이하로 솎음) */
export function monthTicks(dates: readonly string[]): Array<{ date: string; label: string }> {
  const starts: string[] = [];
  for (let i = 1; i < dates.length; i++) {
    if (dates[i].slice(0, 7) !== dates[i - 1].slice(0, 7)) starts.push(dates[i]);
  }
  const every = Math.max(1, Math.ceil(starts.length / 7));
  return starts
    .filter((_, i) => i % every === 0)
    .map((d, i) => ({ date: d, label: i === 0 || d.slice(5, 7) === '01' ? `${d.slice(0, 4)}.${d.slice(5, 7)}` : `${Number(d.slice(5, 7))}월` }));
}

export const formatWon = (v: number) => `${Math.round(v).toLocaleString('ko-KR')}원`;
export const formatSignedPct = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;
const formatTick = (v: number) => (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('ko-KR') : String(Number(v.toFixed(1))));

/** 겹치는 라벨을 세로로 밀어낸다 (y 오름차순 입력 순서 유지) */
export function spreadLabels(ys: readonly number[], minGap: number, top: number, bottom: number): number[] {
  const order = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y);
  const placed = order.map((o) => o.y);
  for (let k = 1; k < placed.length; k++) placed[k] = Math.max(placed[k], placed[k - 1] + minGap);
  const overflow = placed.length ? placed[placed.length - 1] - bottom : 0;
  if (overflow > 0) for (let k = 0; k < placed.length; k++) placed[k] -= overflow;
  for (let k = 0; k < placed.length; k++) placed[k] = Math.max(placed[k], top + k * minGap);
  const out = new Array<number>(ys.length);
  order.forEach((o, k) => { out[o.i] = placed[k]; });
  return out;
}

// --- 요소 헬퍼 ---

const abs = (left: number, top: number, style: CSSProperties = {}): CSSProperties => ({ position: 'absolute', left, top, display: 'flex', ...style });
const text = (style: CSSProperties, children: ReactNode) => h('div', { style: { display: 'flex', ...style } }, children);

function timeScale(dates: readonly string[]) {
  const t0 = Date.parse(dates[0]);
  const t1 = Date.parse(dates[dates.length - 1]);
  const span = t1 - t0 || 1;
  return (date: string) => PLOT_LEFT + ((Date.parse(date) - t0) / span) * PLOT_W;
}

function linearScale(min: number, max: number, top: number, bottom: number) {
  return (v: number) => bottom - ((v - min) / (max - min)) * (bottom - top);
}

const pathOf = (pts: ReadonlyArray<readonly [number, number]>) =>
  pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

function frame(children: ReactNode[], svgChildren: ReactNode[]): ReactElement {
  return h(
    'div',
    { style: { width: W, height: H, display: 'flex', position: 'relative', background: COLOR.bg, fontFamily: 'Noto Sans KR', color: COLOR.text } },
    h('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, style: { position: 'absolute', left: 0, top: 0 } }, ...svgChildren),
    ...children,
  );
}

function header(title: string, subtitle: string, right?: ReactNode): ReactNode {
  return h(
    'div',
    { style: abs(PAD, 52, { width: W - PAD * 2, justifyContent: 'space-between', alignItems: 'flex-start' }) },
    h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', maxWidth: right ? 1040 : W - PAD * 2 } },
      text({ fontSize: 44, fontWeight: 700, lineHeight: 1.25 }, title),
      text({ fontSize: 24, color: COLOR.sub, marginTop: 10 }, subtitle),
    ),
    right ?? null,
  );
}

function footer(source: string): ReactNode {
  return h(
    'div',
    { style: abs(PAD, H - 64, { width: W - PAD * 2, justifyContent: 'space-between', alignItems: 'center' }) },
    text({ fontSize: 20, color: COLOR.muted }, source),
    text({ fontSize: 22, fontWeight: 700, color: COLOR.up }, 'StockMatrix'),
  );
}

/** 눈금 라벨과 끝값 배지가 같은 열에 놓이므로, 배지와 이만큼 가까운 눈금 라벨은 생략한다(선은 유지) */
const PILL_CLEARANCE = 30;

function yGrid(ticks: number[], y: (v: number) => number, svg: ReactNode[], labels: ReactNode[], pills: readonly number[] = []) {
  for (const t of ticks) {
    const yy = y(t);
    svg.push(h('line', { key: `g${t}`, x1: PLOT_LEFT, x2: PLOT_RIGHT, y1: yy, y2: yy, stroke: COLOR.grid, strokeWidth: 1.5 }));
    if (pills.some((p) => Math.abs(p - yy) < PILL_CLEARANCE)) continue;
    labels.push(h('div', { key: `l${t}`, style: abs(PLOT_RIGHT + 16, yy - 14, { fontSize: 20, color: COLOR.muted }) }, formatTick(t)));
  }
}

function xAxis(dates: readonly string[], x: (d: string) => number, axisY: number, svg: ReactNode[], labels: ReactNode[]) {
  svg.push(h('line', { key: 'xa', x1: PLOT_LEFT, x2: PLOT_RIGHT, y1: axisY, y2: axisY, stroke: COLOR.axis, strokeWidth: 2 }));
  for (const t of monthTicks(dates)) {
    const xx = x(t.date);
    svg.push(h('line', { key: `xt${t.date}`, x1: xx, x2: xx, y1: axisY, y2: axisY + 8, stroke: COLOR.axis, strokeWidth: 2 }));
    labels.push(h('div', { key: `xl${t.date}`, style: abs(xx - 60, axisY + 14, { width: 120, justifyContent: 'center', fontSize: 20, color: COLOR.muted }) }, t.label));
  }
}

function pointLabel(x: number, y: number, placeAbove: boolean, title: string, sub: string, key: string): ReactNode {
  const boxW = 236;
  const left = Math.min(Math.max(x - boxW / 2, PLOT_LEFT), PLOT_RIGHT - boxW);
  return h(
    'div',
    {
      key,
      style: abs(left, placeAbove ? y - 70 : y + 16, {
        width: boxW, flexDirection: 'column', alignItems: 'center', padding: '6px 10px',
        background: COLOR.bg, border: `1.5px solid ${COLOR.axis}`, borderRadius: 10,
      }),
    },
    text({ fontSize: 21, fontWeight: 700 }, title),
    text({ fontSize: 16, color: COLOR.sub }, sub),
  );
}

function valuePill(y: number, value: string, color: string, key: string): ReactNode {
  return h('div', {
    key,
    style: abs(PLOT_RIGHT + 8, y - 17, {
      height: 34, padding: '0 10px', alignItems: 'center', borderRadius: 8,
      background: color, color: COLOR.bg, fontSize: 20, fontWeight: 700,
    }),
  }, value);
}

async function toPng(element: ReactElement): Promise<Buffer> {
  const response = new ImageResponse(element, { width: W, height: H, fonts: await loadChartFonts() });
  return Buffer.from(await response.arrayBuffer());
}

const periodLabel = (s: StockSnapshot) => (s.fullYear ? '1년' : `${Math.max(1, Math.round(s.series.length / 21))}개월`);

// --- 차트 ---

export const KIS_SOURCE = '출처: 한국투자증권 Open API 일봉(수정주가)';

/** 단일 종목: 종가 선 + 거래량 + 최고·최저 표시 */
export async function renderPriceChart(stock: StockSnapshot): Promise<Buffer> {
  const { series } = stock;
  const dates = series.map((p) => p.date);
  const x = timeScale(dates);
  const priceTop = 196;
  const priceBottom = 610;
  const volTop = 650;
  const volBottom = 744;
  const domain = valueDomain(series.map((p) => p.close));
  const y = linearScale(domain.min, domain.max, priceTop, priceBottom);
  const first = series[0];
  const change = Math.round((stock.close / first.close - 1) * 1000) / 10;
  const trend = change >= 0 ? COLOR.up : COLOR.down;

  const svg: ReactNode[] = [];
  const labels: ReactNode[] = [];
  yGrid(domain.ticks.filter((t) => y(t) >= priceTop - 1 && y(t) <= priceBottom + 1), y, svg, labels, [y(stock.close)]);

  // 거래량
  const vols = series.map((p) => p.volume ?? 0);
  const maxVol = Math.max(...vols);
  if (maxVol > 0) {
    const barW = Math.max(1.5, (PLOT_W / series.length) * 0.62);
    series.forEach((p, i) => {
      const hgt = ((p.volume ?? 0) / maxVol) * (volBottom - volTop);
      if (hgt > 0) svg.push(h('rect', { key: `v${i}`, x: x(p.date) - barW / 2, y: volBottom - hgt, width: barW, height: hgt, fill: COLOR.volume }));
    });
    labels.push(h('div', { key: 'vl', style: abs(PLOT_LEFT, volTop - 30, { fontSize: 18, color: COLOR.muted }) }, '거래량'));
  }
  xAxis(dates, x, volBottom, svg, labels);

  const pts = series.map((p) => [x(p.date), y(p.close)] as const);
  const line = pathOf(pts);
  svg.push(h('path', { key: 'area', d: `${line} L${pts[pts.length - 1][0].toFixed(1)},${priceBottom} L${pts[0][0].toFixed(1)},${priceBottom} Z`, fill: trend, fillOpacity: 0.08 }));
  svg.push(h('path', { key: 'line', d: line, stroke: trend, strokeWidth: 3.5, fill: 'none', strokeLinejoin: 'round', strokeLinecap: 'round' }));

  for (const [key, p, above] of [['hi', stock.high, true], ['lo', stock.low, false]] as const) {
    const px = x(p.date);
    const py = y(p.close);
    svg.push(h('circle', { key: `${key}c`, cx: px, cy: py, r: 7, fill: COLOR.bg, stroke: trend, strokeWidth: 3 }));
    labels.push(pointLabel(px, py, above, `${above ? '최고' : '최저'} ${formatWon(p.close)}`, p.date, key));
  }
  const last = pts[pts.length - 1];
  svg.push(h('circle', { key: 'lastc', cx: last[0], cy: last[1], r: 6, fill: trend }));
  labels.push(valuePill(last[1], Math.round(stock.close).toLocaleString('ko-KR'), trend, 'lastp'));

  const right = h(
    'div',
    { style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end' } },
    text({ fontSize: 44, fontWeight: 700 }, formatWon(stock.close)),
    text({ fontSize: 24, color: trend, marginTop: 6, fontWeight: 700 }, `${periodLabel(stock)} ${formatSignedPct(change)}`),
  );

  return toPng(frame(
    [header(`${stock.name} ${stock.fullYear ? '최근 1년' : `최근 ${periodLabel(stock)}`} 주가 추이`, `일별 종가 · ${first.date} ~ ${stock.asOf}`, right), ...labels, footer(`${KIS_SOURCE} · 기준일 ${stock.asOf}`)],
    svg,
  ));
}

/** 공통 시작일 이후로 맞춘 뒤 시작일 종가 = 100으로 환산 */
export function rebaseSeries(stocks: readonly StockSnapshot[]): Array<{ stock: StockSnapshot; points: Array<{ date: string; value: number }> }> {
  const start = stocks.map((s) => s.series[0].date).sort().at(-1) ?? '';
  return stocks.map((stock) => {
    const kept: PricePoint[] = stock.series.filter((p) => p.date >= start);
    const base = kept[0]?.close ?? 1;
    return { stock, points: kept.map((p) => ({ date: p.date, value: (p.close / base) * 100 })) };
  });
}

/** 여러 종목: 시작일 = 100 상대 수익률 비교 */
export async function renderComparisonChart(stocks: readonly StockSnapshot[], title: string): Promise<Buffer> {
  const rebased = rebaseSeries(stocks.slice(0, SERIES_COLORS.length));
  const dates = [...new Set(rebased.flatMap((r) => r.points.map((p) => p.date)))].sort();
  const x = timeScale(dates);
  const top = 236;
  const bottom = 744;
  const domain = valueDomain([100, ...rebased.flatMap((r) => r.points.map((p) => p.value))], 0.08);
  const y = linearScale(domain.min, domain.max, top, bottom);

  const svg: ReactNode[] = [];
  const labels: ReactNode[] = [];
  const pillYs = spreadLabels(rebased.map((r) => y(r.points.at(-1)?.value ?? 100)), 38, top, bottom);
  yGrid(domain.ticks.filter((t) => y(t) >= top - 1 && y(t) <= bottom + 1), y, svg, labels, pillYs);
  svg.push(h('line', { key: 'base', x1: PLOT_LEFT, x2: PLOT_RIGHT, y1: y(100), y2: y(100), stroke: COLOR.base, strokeWidth: 2, strokeDasharray: '8 8' }));
  xAxis(dates, x, bottom, svg, labels);

  rebased.forEach((r, i) => {
    const color = SERIES_COLORS[i];
    const pts = r.points.map((p) => [x(p.date), y(p.value)] as const);
    svg.push(h('path', { key: `s${i}`, d: pathOf(pts), stroke: color, strokeWidth: 3.5, fill: 'none', strokeLinejoin: 'round', strokeLinecap: 'round' }));
    const last = pts[pts.length - 1];
    svg.push(h('circle', { key: `e${i}`, cx: last[0], cy: last[1], r: 6, fill: color }));
  });
  pillYs.forEach((yy, i) => {
    const value = rebased[i].points.at(-1)?.value ?? 100;
    labels.push(valuePill(yy, value.toFixed(1), SERIES_COLORS[i], `p${i}`));
  });

  const legend = h(
    'div',
    { style: abs(PAD, 170, { gap: 36, flexWrap: 'wrap', width: W - PAD * 2 }) },
    ...rebased.map((r, i) => {
      const change = (r.points.at(-1)?.value ?? 100) - 100;
      return h(
        'div',
        { key: `lg${i}`, style: { display: 'flex', alignItems: 'center', gap: 10, fontSize: 24 } },
        h('div', { style: { width: 16, height: 16, borderRadius: 8, background: SERIES_COLORS[i] } }),
        text({ fontWeight: 700 }, r.stock.name),
        text({ color: change >= 0 ? COLOR.up : COLOR.down, fontWeight: 700 }, formatSignedPct(change)),
      );
    }),
  );

  const start = dates[0];
  const end = dates[dates.length - 1];
  return toPng(frame(
    [header(title, `시작일 종가 = 100 · ${start} ~ ${end}`), legend, ...labels, footer(`${KIS_SOURCE} · 기준일 ${end}`)],
    svg,
  ));
}
