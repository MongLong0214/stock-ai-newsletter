/**
 * Markdown to HTML 파서 (XSS 방지)
 */

import { remark } from 'remark';
import html from 'remark-html';

/** Markdown을 안전한 HTML로 변환 */
export async function parseMarkdown(markdown: string): Promise<string> {
  const result = await remark().use(html, { sanitize: true }).process(markdown);
  return result.toString();
}