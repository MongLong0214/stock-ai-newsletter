/**
 * Markdown to HTML 파서
 *
 * 주요 기능:
 * - Markdown 형식 텍스트를 HTML로 변환
 * - GitHub Flavored Markdown (GFM) 지원: 테이블, 취소선 등
 * - Heading에 자동으로 ID 추가 (목차 링크용)
 *
 * 사용 라이브러리:
 * - remark: Markdown 처리 라이브러리
 * - remark-gfm: GitHub Flavored Markdown 플러그인 (테이블, 취소선 등)
 * - remark-rehype: Markdown AST → HTML AST 변환
 * - rehype-sanitize: XSS 방지를 위한 HTML 정화
 * - rehype-stringify: HTML AST → 문자열 변환
 */

import { remark } from 'remark';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';

/**
 * 텍스트를 URL-safe slug로 변환
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

/**
 * Heading 태그에 ID 속성 추가
 */
function addHeadingIds(html: string): string {
  const idCounts: Record<string, number> = {};

  return html.replace(/<h([23])>([^<]+)<\/h[23]>/gi, (match, level, content) => {
    const text = content.trim();
    let id = slugify(text);

    // 중복 ID 처리
    if (idCounts[id]) {
      idCounts[id]++;
      id = `${id}-${idCounts[id]}`;
    } else {
      idCounts[id] = 1;
    }

    return `<h${level} id="${id}">${text}</h${level}>`;
  });
}

const SIZE_IN_NAME_RE = /-(\d{3,4})x(\d{3,4})\.(?:webp|png|jpe?g)(?:[?#]|$)/;
const attr = (tag: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
const escapeAngles = (text: string) => text.replace(/</g, '&#x3C;').replace(/>/g, '&#x3E;');

/**
 * 이미지 한 장뿐인 문단 → <figure> + <figcaption>
 *
 * 파이프라인은 이미지를 `![alt](url "캡션")` 한 줄 문단으로 넣는다. 마크다운에는 figure가
 * 없으므로 title을 캡션으로 옮긴다. 파일명의 `-{w}x{h}.` 로 width/height를 채워 레이아웃
 * 이동(CLS)을 막고, 첫 이미지(커버)만 즉시·우선 로드한다(LCP). 나머지는 지연 로드.
 *
 * sanitize 뒤에 돌므로 입력은 rehype-stringify가 만든 정규 형태다. 속성값은 이미
 * 이스케이프돼 있고, 캡션으로 옮길 때 꺾쇠를 다시 막는다.
 */
export function wrapFigures(html: string): string {
  let index = 0;
  // 속성값 안의 `>`에서 끊기지 않도록 따옴표 구간을 통째로 건너뛴다
  return html.replace(/<p>(<img\s(?:[^>"]|"[^"]*")*>)<\/p>/g, (_, img: string) => {
    const src = attr(img, 'src');
    if (!src) return _;
    const alt = escapeAngles(attr(img, 'alt') ?? '');
    const title = attr(img, 'title');
    const size = SIZE_IN_NAME_RE.exec(src);
    // 우선 로드는 맨 앞 커버뿐이다. 커버가 없는 글에서 첫 섹션 뒤 차트가 LCP 대역폭을 뺏지 않게 한다.
    const eager = index === 0 && /-cover-\d{3,4}x\d{3,4}\./.test(src);
    index += 1;
    const attrs = [
      `src="${src}"`,
      `alt="${alt}"`,
      ...(size ? [`width="${size[1]}"`, `height="${size[2]}"`] : []),
      eager ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"',
      'decoding="async"',
    ].join(' ');
    const caption = title ? `<figcaption>${escapeAngles(title)}</figcaption>` : '';
    return `<figure><img ${attrs}>${caption}</figure>`;
  });
}

// rehype-sanitize용 커스텀 스키마 (기본 스키마 확장)
const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames || []),
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'br', 'hr',
    'strong', 'em', 'u', 's', 'code', 'del',
    'ul', 'ol', 'li',
    'blockquote', 'pre',
    'a', 'img',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'div', 'span',
  ],
  attributes: {
    ...defaultSchema.attributes,
    '*': ['className', 'id'],
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'title'],
  },
};

/**
 * Markdown을 안전한 HTML로 변환 (XSS 방지)
 *
 * 변환 과정:
 * 1. Markdown → HTML 변환 (remark + GFM)
 * 2. rehype-sanitize로 XSS 위험 제거
 * 3. Heading에 ID 추가 (목차용), 이미지 문단 → figure
 * 4. 잔여 **bold** / ***bold+italic*** 패턴 후처리
 *
 * @param markdown - 변환할 Markdown 텍스트
 * @returns 안전하게 sanitize된 HTML 문자열
 */
/**
 * 표를 가로 스크롤 상자로 감싼다 (sanitize 이후 — 우리가 만든 마크업만 추가).
 * 열이 많은 표(시세 7열)가 모바일 폭을 넘으면 body overflow clip에 잘려 숫자를 볼 수 없다.
 */
export function wrapTables(html: string): string {
  return html.replace(/<table>/g, '<div class="table-scroll"><table>').replace(/<\/table>/g, '</table></div>');
}

export async function parseMarkdown(markdown: string): Promise<string> {
  const result = await remark()
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeSanitize, sanitizeSchema)
    .use(rehypeStringify)
    .process(markdown);

  let html = wrapTables(wrapFigures(addHeadingIds(result.toString())));

  // remark가 변환하지 못한 잔여 마크다운 강조 패턴 후처리
  // ***bold+italic*** → <strong><em>text</em></strong> (3개짜리 먼저 처리)
  html = html.replace(/\*{3}([^*]+?)\*{3}/g, '<strong><em>$1</em></strong>');
  // **bold** → <strong>text</strong>
  html = html.replace(/\*{2}([^*]+?)\*{2}/g, '<strong>$1</strong>');

  return html;
}
