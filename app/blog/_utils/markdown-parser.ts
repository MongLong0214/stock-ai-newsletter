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
 * - remark-html: Markdown → HTML 변환 플러그인
 * - rehype-sanitize: XSS 방지를 위한 HTML 정화
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
 * 3. Heading에 ID 추가 (목차용)
 *
 * @param markdown - 변환할 Markdown 텍스트
 * @returns 안전하게 sanitize된 HTML 문자열
 */
export async function parseMarkdown(markdown: string): Promise<string> {
  const result = await remark()
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeSanitize, sanitizeSchema)
    .use(rehypeStringify)
    .process(markdown);

  return addHeadingIds(result.toString());
}
