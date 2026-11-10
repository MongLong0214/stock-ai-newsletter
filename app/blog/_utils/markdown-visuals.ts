/**
 * 본문 마크다운에 시각자료를 끼워 넣는 순수 함수 모음
 *
 * 이미지는 `![alt](url "캡션")` 한 줄 문단으로 넣는다. 렌더러(markdown-parser)가
 * 이 형태를 <figure>+<figcaption>으로 바꾸고, 파일명의 `-{w}x{h}.` 로 크기를 채워 CLS를 막는다.
 */

import type { MarketContext, StockSnapshot } from '../_services/market-data';

export interface ImageRef {
  readonly url: string;
  readonly alt: string;
  readonly caption: string;
}

const OWN_BUCKET_PATH = '/storage/v1/object/public/blog-images/';
const COVER_NAME_RE = /-cover-(\d{3,4})x(\d{3,4})\.(?:webp|png|jpe?g)$/;
/** 섹션 사진 — 커버가 없을 때 대표 이미지 후보. 차트(-chart-)는 글자·수치가 있어 쓰지 않는다 */
const SECTION_NAME_RE = /-section\d+-(\d{3,4})x(\d{3,4})\.(?:webp|png|jpe?g)$/;

/** 목록 카드용 커버 — 우리 스토리지 URL만 통과시킨다 */
export function ownCoverOrNull(url: unknown): string | null {
  return typeof url === 'string' && isOwnBlogImageUrl(url) ? url : null;
}

/**
 * 우리 Supabase 프로젝트의 blog-images 버킷 URL인가 (호스트까지 확인).
 * 본문에 끼어든 외부 이미지가 OG·JSON-LD·사이트맵 대표 이미지가 되지 않게 한다.
 */
export function isOwnBlogImageUrl(url: string): boolean {
  let origin: string;
  try {
    origin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').origin;
  } catch {
    return false;
  }
  return url.startsWith(`${origin}${OWN_BUCKET_PATH}`) && /^[\w./:-]+$/.test(url);
}
const IMAGE_LINE_RE = /^!\[([^\]\n]*)\]\((\S+?)(?:\s+"([^"\n]*)")?\)$/;

/** alt·캡션에서 마크다운 구문을 깨는 문자를 걷어낸다 */
function clean(text: string, max: number): string {
  return text
    .replace(/[[\]"<>\\`|*_~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .trim();
}

export function imageMarkdown(image: ImageRef): string {
  return `![${clean(image.alt, 200)}](${image.url} "${clean(image.caption, 140)}")`;
}

/** 코드 펜스 밖의 줄 번호 집합으로 헤딩을 찾는다 */
function h2Indexes(lines: readonly string[]): number[] {
  const out: number[] = [];
  let fenced = false;
  lines.forEach((line, i) => {
    if (/^\s*```/.test(line)) fenced = !fenced;
    else if (!fenced && /^##\s+\S/.test(line)) out.push(i);
  });
  return out;
}

const headingText = (line: string) => line.replace(/^##\s+/, '').trim();

/** 본문의 H2 제목 목록 (코드 펜스 제외) */
export function listH2Headings(markdown: string): string[] {
  const lines = markdown.split('\n');
  return h2Indexes(lines).map((i) => headingText(lines[i]));
}

/** 커버: 맨 앞 H1 바로 뒤(없으면 맨 앞) */
export function insertCover(markdown: string, image: ImageRef): string {
  const lines = markdown.split('\n');
  const firstContent = lines.findIndex((l) => l.trim() !== '');
  const block = imageMarkdown(image);
  if (firstContent !== -1 && /^#\s+\S/.test(lines[firstContent])) {
    return [...lines.slice(0, firstContent + 1), '', block, ...lines.slice(firstContent + 1)].join('\n').replace(/\n{3,}/g, '\n\n');
  }
  return `${block}\n\n${markdown.trimStart()}`;
}

const isParagraphLine = (line: string) =>
  line.trim() !== '' && !/^\s*(#|\||[-*+]\s|\d+[.)]\s|>|```|!\[)/.test(line);

/**
 * H2 섹션의 첫 문단 뒤에 이미지를 넣는다. 첫 블록이 문단이 아니면(표·목록) 헤딩 바로 뒤.
 * 헤딩을 못 찾으면 null — 호출부가 그 이미지를 버린다.
 */
export function insertInSection(markdown: string, heading: string, image: ImageRef): string | null {
  const lines = markdown.split('\n');
  const target = heading.trim();
  const at = h2Indexes(lines).find((i) => headingText(lines[i]) === target);
  if (at === undefined) return null;

  let i = at + 1;
  while (i < lines.length && lines[i].trim() === '') i++;
  let insertAt = at + 1;
  if (i < lines.length && isParagraphLine(lines[i])) {
    while (i < lines.length && lines[i].trim() !== '') i++;
    insertAt = i;
  }
  return [...lines.slice(0, insertAt), '', imageMarkdown(image), '', ...lines.slice(insertAt)].join('\n').replace(/\n{3,}/g, '\n\n');
}

/** "1. …", "Step 2: …"처럼 번호가 붙은 H2 */
const NUMBERED_H2_RE = /^##\s+(?:\d+\s*[.)]|step\s*\d+)/i;

/**
 * 첫 섹션 뒤(두 번째 H2 앞)에 블록을 넣는다. 번호 붙은 H2 목록("1. …", "2. …") 사이라면
 * 목록을 쪼개지 않도록 그 목록 앞으로 옮긴다. H2가 하나 이하면 끝에 붙인다.
 */
export function insertAfterFirstSection(markdown: string, block: string): string {
  const lines = markdown.split('\n');
  const h2 = h2Indexes(lines);
  if (h2.length < 2) return `${markdown.trimEnd()}\n\n${block}\n`;
  let at = 1;
  while (at > 0 && NUMBERED_H2_RE.test(lines[h2[at]]) && NUMBERED_H2_RE.test(lines[h2[at - 1]])) at -= 1;
  const index = h2[at];
  return [...lines.slice(0, index), block, '', ...lines.slice(index)].join('\n').replace(/\n{3,}/g, '\n\n');
}

// --- 실측 데이터 섹션 ---

const won = (v: number) => `${Math.round(v).toLocaleString('ko-KR')}원`;
const signed = (v: number | null) => (v === null ? '-' : `${v > 0 ? '+' : ''}${v.toFixed(1)}%`);
const moved = (v: number) =>
  v > 0 ? `${v.toFixed(1)}% 올랐습니다` : v < 0 ? `${Math.abs(v).toFixed(1)}% 내렸습니다` : '거의 변동이 없었습니다';
const periodOf = (s: StockSnapshot) => (s.fullYear ? '최근 1년' : `최근 ${s.series.length}거래일`);
/** 기간 등락률 — 1년이 안 되면 기간 첫날 종가 대비 */
export const periodReturn = (s: StockSnapshot) =>
  s.returns.y1 ?? Math.round((s.close / s.series[0].close - 1) * 1000) / 10;

/**
 * 비교용 등락률 — 비교 차트(chart-renderer rebaseSeries)와 같은 기준.
 * 전 종목이 1년을 채우면 1년 등락률(표와 동일), 아니면 공통 시작일(가장 늦은 첫 거래일) 종가 대비.
 * 기간이 다른 등락률을 나란히 순위 매기지 않기 위해서다.
 */
export function comparisonReturns(stocks: readonly StockSnapshot[]): { label: string; values: number[] } {
  if (stocks.every((s) => s.fullYear)) return { label: '최근 1년', values: stocks.map(periodReturn) };
  const start = stocks.map((s) => s.series[0].date).sort().at(-1) ?? '';
  return {
    label: `${start} 이후`,
    values: stocks.map((s) => {
      const base = s.series.find((p) => p.date >= start)?.close ?? s.series[0].close;
      return Math.round((s.close / base - 1) * 1000) / 10;
    }),
  };
}

/** 데이터 섹션 제목 (차트 제목과 같은 기준) */
export function dataSectionTitle(ctx: MarketContext): string {
  const names = ctx.stocks.slice(0, 4).map((s) => s.name);
  // 한 종목이면 테마 글이어도 단일 종목 차트·문장이다 — 제목도 그 종목으로
  if (ctx.stocks.length === 1) return `${names[0]} 주가 흐름`;
  if (!ctx.direct && ctx.theme) return `${ctx.theme.name} 테마 대표 종목 주가`;
  return `${names.join('·')} 주가 비교`;
}

/** 비교 차트 제목 */
export function comparisonChartTitle(ctx: MarketContext): string {
  if (!ctx.direct && ctx.theme) return `${ctx.theme.name} 테마 대표 종목 주가 비교`;
  return `${ctx.stocks.slice(0, 4).map((s) => s.name).join(' · ')} 주가 비교`;
}

function stockTable(stocks: readonly StockSnapshot[]): string {
  const rows = stocks.map((s) =>
    `| ${s.name} | ${won(s.close)} | ${signed(s.returns.m1)} | ${signed(s.returns.m3)} | ${signed(s.returns.y1)} | ${won(s.high.close)} | ${signed(s.fromHighPct)} |`);
  return ['| 종목 | 종가 | 1개월 | 3개월 | 1년 | 기간 최고 종가 | 최고가 대비 |', '|:--|--:|--:|--:|--:|--:|--:|', ...rows].join('\n');
}

function summary(ctx: MarketContext): string {
  const [first] = ctx.stocks;
  if (ctx.stocks.length === 1) {
    const s = first;
    // 반올림된 fromHighPct(-0.04% → 0)로 판정하면 최고가 아래인데 "최고 종가"라고 쓰게 된다
    const high = s.close >= s.high.close
      ? '기준일 종가가 이 기간의 최고 종가입니다.'
      : `기준일 종가는 최고 종가보다 ${Math.max(0.1, Math.abs(s.fromHighPct)).toFixed(1)}% 낮습니다.`;
    // 숫자+단위 뒤에 조사를 붙이지 않는 문형 (원이었고/원으로 같은 받침 처리 회피)
    return `${s.name}의 ${s.asOf} 종가는 ${won(s.close)}입니다. ${periodOf(s)} 동안 주가는 ${moved(periodReturn(s))}. 같은 기간 종가 기준 최고가는 ${won(s.high.close)}(${s.high.date}), 최저가는 ${won(s.low.close)}(${s.low.date})입니다. ${high}`;
  }
  const cmp = comparisonReturns(ctx.stocks);
  const ranked = ctx.stocks.map((s, i) => ({ s, v: cmp.values[i] })).sort((a, b) => b.v - a.v).map((r) => r.s);
  const list = ctx.stocks.map((s, i) => `${s.name} ${signed(cmp.values[i])}`).join(', ');
  const lead = !ctx.direct && ctx.theme
    ? `최근 거래일 거래대금이 많은 ${ctx.theme.name} 테마 종목 ${ctx.stocks.length}개를 골랐습니다. `
    : '';
  const span = cmp.label;
  // "가장 많이 오른/내린"은 부호에 따라 틀린 말이 된다(둘 다 올랐는데 "내린 종목") — 높고 낮음으로만 말한다
  const compare = ranked.length === 2
    ? `두 종목 중 등락률이 더 높은 종목은 ${ranked[0].name}입니다.`
    : `등락률이 가장 높은 종목은 ${ranked[0].name}, 가장 낮은 종목은 ${ranked[ranked.length - 1].name}입니다.`;
  return `${lead}${span} 등락률은 ${list}입니다. ${compare}`;
}

/**
 * 실측 데이터 섹션: 차트 + 사실 문장 + 수익률 표 + 산식·출처 주석.
 * 문장은 전부 숫자에서 결정적으로 만든다 — 모델 문장이 아니므로 수치 왜곡이 없다.
 */
export function buildDataSection(ctx: MarketContext, chart: ImageRef | null): string {
  const parts = [`## 데이터로 보는 ${dataSectionTitle(ctx)}`];
  if (chart) parts.push(imageMarkdown(chart));
  parts.push(summary(ctx));
  parts.push(stockTable(ctx.stocks));
  parts.push(`> ${ctx.asOf} 종가 기준입니다. 1개월·3개월 등락률은 21·63거래일 전 종가와 비교한 단순 등락률이고, 1년은 1년 전 첫 거래일 종가와 비교했으며 배당은 반영하지 않았습니다. 시세는 한국투자증권 Open API 수정주가입니다. 과거 주가 흐름이 앞으로의 수익을 보장하지 않습니다.`);
  if (ctx.theme) parts.push(`${ctx.theme.name} 테마의 관심도와 뉴스 흐름은 [${ctx.theme.name} 테마 데이터](/themes/${ctx.theme.id})에서 매일 갱신됩니다.`);
  return parts.join('\n\n');
}

/** 차트 대체텍스트: 차트가 말하는 숫자를 그대로 문장으로 */
export function chartAlt(ctx: MarketContext): string {
  if (ctx.stocks.length === 1) {
    const s = ctx.stocks[0];
    return `${s.name} ${periodOf(s)} 일별 종가 차트. 시작 ${s.series[0].date} 종가 ${won(s.series[0].close)}, 기준일 ${s.asOf} 종가 ${won(s.close)}(${signed(periodReturn(s))}), 최고 ${won(s.high.close)}(${s.high.date}), 최저 ${won(s.low.close)}(${s.low.date})`;
  }
  const cmp = comparisonReturns(ctx.stocks);
  return `${ctx.stocks.map((s) => s.name).join(', ')} 주가를 시작일 종가 100으로 환산해 비교한 선 차트(${cmp.label}). ${ctx.stocks.map((s, i) => `${s.name} ${signed(cmp.values[i])}`).join(', ')}`;
}

// --- 커버 추출 (렌더·스키마·사이트맵 공용) ---

export interface CoverImage {
  readonly url: string;
  readonly alt: string;
  /** 본문 캡션 ("… · AI 생성 이미지"). 없으면 alt */
  readonly caption: string;
  readonly width: number;
  readonly height: number;
}

/**
 * 글의 대표 이미지(목록 썸네일·JSON-LD·OG 두 번째 후보)를 찾는다. 없으면 null (기존 글).
 *
 * 커버가 우선이고, 커버가 없으면 첫 섹션 사진을 쓴다. 커버는 비전 검수에서 글자·로고가
 * 보이면 탈락하는데(2026-11-10 키보드 자판 2회 탈락), 그때 검수를 통과한 섹션 사진이
 * 본문에 있어도 대표 이미지가 비어 목록이 회색 칸이 됐다.
 */
export function extractCoverImage(markdown: string | null | undefined): CoverImage | null {
  if (!markdown) return null;
  let section: CoverImage | null = null;
  for (const raw of markdown.split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('![')) continue;
    const m = IMAGE_LINE_RE.exec(line);
    if (!m || !isOwnBlogImageUrl(m[2])) continue;
    const toImage = (size: RegExpExecArray): CoverImage =>
      ({ url: m[2], alt: m[1], caption: m[3] || m[1], width: Number(size[1]), height: Number(size[2]) });
    const cover = COVER_NAME_RE.exec(m[2]);
    if (cover) return toImage(cover);
    const sectionSize = section ? null : SECTION_NAME_RE.exec(m[2]);
    if (sectionSize) section = toImage(sectionSize);
  }
  return section;
}

/** 본문 맨 앞의 H1 제거 — 페이지 헤더가 이미 제목 H1을 그린다(중복 H1 방지) */
export function stripLeadingH1(markdown: string): string {
  // [ \t]+ — 빈 `#` 줄 뒤의 다음 줄까지 먹지 않게 줄바꿈을 넘지 않는다
  return markdown.replace(/^\s*#[ \t]+[^\n]*\n*/, '');
}
