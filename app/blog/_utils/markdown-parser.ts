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
 */

import { remark } from 'remark';
import remarkGfm from 'remark-gfm';
import html from 'remark-html';

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

/**
 * Markdown을 HTML로 변환
 *
 * 변환 과정:
 * 1. Markdown 텍스트 입력
 * 2. remark로 Markdown 파싱
 * 3. remark-gfm으로 테이블, 취소선 등 GFM 기능 지원
 * 4. remark-html로 HTML 변환
 * 5. Heading에 ID 추가 (목차용)
 * 6. HTML 문자열 반환
 *
 * @param markdown - 변환할 Markdown 텍스트
 * @returns 변환된 HTML 문자열
 *
 * @example
 * const html = await parseMarkdown('# 제목\n**굵은 텍스트**');
 * // 결과: '<h1>제목</h1>\n<p><strong>굵은 텍스트</strong></p>'
 */
export async function parseMarkdown(markdown: string): Promise<string> {
  const result = await remark()
    .use(remarkGfm) // GitHub Flavored Markdown: 테이블, 취소선 등 지원
    .use(html)
    .process(markdown);

  return addHeadingIds(result.toString());
}