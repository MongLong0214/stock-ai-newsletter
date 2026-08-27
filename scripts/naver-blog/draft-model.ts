/**
 * 초안 스냅샷·서식 마커·이미지 슬롯.
 *
 * 초안 JSON과 캡처 이미지가 서로 다른 시각의 숫자를 가리키지 않게,
 * 본문·캡션·manifest가 같은 SourceSnapshot을 보게 한다.
 */

export const QUOTE_PREFIX = '>> ';
export const BOLD_RE = /\*\*(.+?)\*\*/g;
export const COLOR_RE = /\[\[([rb]):(.+?)\]\]/g;
export const IMAGE_SLOT_RE = /\{\{image:([^}]+)\}\}/g;

/**
 * 스마트에디터 팔레트에 **실제로 존재하는** 색만 쓴다 (2026-08-27 실측, data-color 71개).
 *
 * 빨강 #ff0010은 팔레트에 그대로 있다. 파랑 #0068ff는 **없다** — 팔레트의 파랑 계열은
 * #0095e9 / #0078cb / #00b3f2 / #004e82 뿐이라 #0068ff에 가장 가까운 #0078cb을 쓴다.
 * 없는 색을 지정하면 팔레트 탐색이 실패하고 발행이 매번 중단된다.
 *
 * 리셋색 #555555는 본문 기본 텍스트색과 같다(발행글 실측 computed color rgb(85,85,85)).
 */
export const RED_HEX = '#ff0010';
export const BLUE_HEX = '#0078cb';
export const RESET_HEX = '#555555';

export const DEFAULT_BLOG_ID = 'stock-matrix';

export interface SourceSnapshot {
  baseline30dAvg?: number;
  change7d?: number;
  newsLastWeek?: number;
  newsThisWeek?: number;
  recent7dAvg?: number;
  score?: number;
  stageKo?: string;
  stockCount?: number;
}

export interface ImagePlacement {
  afterBlock: string;
  caption: string;
  capturedAt: string;
  id: string;
  path: string;
  sha256: string;
  sourceSection: string;
}

export interface DraftMeta {
  generatedAt: string;
  imageManifest: ImagePlacement[];
  postType?: string;
  sourceSnapshot?: SourceSnapshot;
  sourceUpdatedAt?: string;
  themeId?: string;
}

export interface DraftPayload {
  body: string;
  imagePlacements?: ImagePlacement[];
  images: string[];
  meta?: DraftMeta;
  outsideUrl: string;
  tags: string[];
  themeId: string;
  title: string;
}

export type RichSegment =
  | { color: 'b' | 'r'; kind: 'color'; text: string }
  | { kind: 'bold'; text: string }
  | { kind: 'text'; text: string };

/** 서식 마커·이미지 슬롯을 걷어낸 순수 본문 */
export const stripFormat = (body: string): string =>
  body
    .replace(IMAGE_SLOT_RE, '')
    .replace(new RegExp(QUOTE_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '')
    .replace(/\*\*/g, '')
    .replace(/\[\[([rb]):(.+?)\]\]/g, '$2')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

export const countQuotes = (body: string): number =>
  body.split('\n').filter((line) => line.startsWith(QUOTE_PREFIX)).length;

export const countBold = (body: string): number => [...body.matchAll(new RegExp(BOLD_RE, 'g'))].length;

export const countColor = (body: string): number => [...body.matchAll(new RegExp(COLOR_RE, 'g'))].length;

export const firstSentence = (body: string): string => {
  const plain = stripFormat(body);
  const idx = plain.search(/[.。]/);
  return idx === -1 ? plain : plain.slice(0, idx + 1);
};

/** 제목이 "X 관련주"로 시작하면 그 구가 본문 첫 문장에 그대로 있어야 한다 */
export const titleKeyword = (title: string): string | null => {
  const match = title.match(/^(.+? 관련주)/);
  return match ? match[1] : null;
};

export const imageSlot = (id: string): string => `{{image:${id}}}`;

export function parseRich(text: string): RichSegment[] {
  const tokens: RichSegment[] = [];
  const matcher = /\*\*(.+?)\*\*|\[\[([rb]):(.+?)\]\]/g;
  let cursor = 0;
  let match = matcher.exec(text);
  while (match) {
    if (match.index > cursor) tokens.push({ kind: 'text', text: text.slice(cursor, match.index) });
    if (match[2] === 'r' || match[2] === 'b') {
      tokens.push({ kind: 'color', color: match[2], text: match[3] });
    } else {
      tokens.push({ kind: 'bold', text: match[1] });
    }
    cursor = match.index + match[0].length;
    match = matcher.exec(text);
  }
  if (cursor < text.length) tokens.push({ kind: 'text', text: text.slice(cursor) });
  return tokens.filter((token) => token.kind !== 'text' || token.text.length > 0);
}

/**
 * 본문 숫자의 단일 진실 원천은 상세 API다.
 * 랭킹은 후보 선정에만 쓰고, 값이 달라도 상세를 택한다(조용히 랭킹 값을 쓰지 않는다).
 */
export function pickDetailNumbers(
  ranking: { change7d: number; score: number },
  detail: { change7d: number; score: number },
): { change7d: number; diverged: boolean; score: number } {
  const diverged = ranking.score !== detail.score || ranking.change7d !== detail.change7d;
  return { change7d: detail.change7d, diverged, score: detail.score };
}

export function formatChange(n: number): string {
  const abs = Number.isInteger(n) ? String(Math.abs(n)) : Math.abs(n).toFixed(1);
  return `${n >= 0 ? '+' : '-'}${abs}점`;
}

export function snapshotCaption(
  id: string,
  themeName: string,
  snap: SourceSnapshot,
  asOf?: string,
): string {
  const change = formatChange(snap.change7d ?? 0);
  if (id.includes('hero')) {
    return `${themeName} 테마 점수 ${snap.score}점과 7일 변화 ${change}, 기준일 ${asOf ?? ''}`.trim();
  }
  if (id.includes('stocks')) {
    return `${themeName} 관련주 ${snap.stockCount ?? 0}개 현재가·등락률 비교`;
  }
  if (id.includes('trend')) {
    return `${themeName} 테마 점수 추이, 기준일 ${asOf ?? ''}`.trim();
  }
  if (id.includes('news')) {
    return `${themeName} 관련 뉴스 ${snap.newsThisWeek ?? 0}건 (이번 주), 기준일 ${asOf ?? ''}`.trim();
  }
  return `${themeName} 화면, 기준일 ${asOf ?? ''}`.trim();
}

/** 발행기가 초안 태그를 잘라내지 못하게, 받은 배열을 그대로 돌려준다 */
export function tagsToEnter(tags: readonly string[]): string[] {
  if (tags.length < 8 || tags.length > 12) {
    throw new Error(`태그 ${tags.length}개 (규격 8~12) — 잘라내지 않고 중단한다`);
  }
  return [...tags];
}

/**
 * 세션에서 읽은 블로그 ID와 발행 대상이 다르면 로그인 재실행을 요구한다.
 * 로그인 자동화는 하지 않는다.
 */
export function resolveBlogId(detected: string | undefined, envId: string | undefined): string {
  const intended = envId || DEFAULT_BLOG_ID;
  if (detected && detected !== intended) {
    throw new Error(
      `세션 계정(${detected})이 발행 대상(${intended})과 다릅니다. ` +
        '사용자가 npm run naver:login 재실행 필요',
    );
  }
  if (!detected && !envId) {
    throw new Error('세션에서 블로그 ID를 감지하지 못했습니다. NAVER_BLOG_ID를 설정하세요.');
  }
  return detected || intended;
}

const BLOG_ID_RE = /blog\.naver\.com\/([A-Za-z0-9_-]+)/;

export function detectBlogIdFromUrl(url: string): string | undefined {
  return url.match(BLOG_ID_RE)?.[1];
}
