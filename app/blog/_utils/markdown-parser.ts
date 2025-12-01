/**
 * Markdown to HTML 파서
 *
 * [이 파일의 역할]
 * - Markdown 형식 텍스트를 HTML로 변환
 * - XSS(크로스 사이트 스크립팅) 공격 방지
 *
 * [Markdown이란?]
 * - 텍스트를 꾸밀 수 있는 간단한 문법
 * - 예: **굵게**, *기울임*, # 제목
 * - GitHub, 블로그 등에서 널리 사용
 *
 * [XSS 공격이란?]
 * - 악성 스크립트를 삽입하여 사용자 정보 탈취
 * - 예: <script>alert('해킹!')</script>
 * - sanitize: true로 악성 코드 제거
 *
 * [사용 라이브러리]
 * - remark: Markdown 처리 라이브러리
 * - remark-html: Markdown → HTML 변환 플러그인
 */

import { remark } from 'remark';
import html from 'remark-html';

/**
 * Markdown을 안전한 HTML로 변환
 *
 * [변환 과정]
 * 1. Markdown 텍스트 입력
 * 2. remark로 Markdown 파싱
 * 3. remark-html로 HTML 변환 (sanitize로 악성 코드 제거)
 * 4. HTML 문자열 반환
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
    .use(html, { sanitize: true }) // sanitize: XSS 방지를 위해 위험한 태그 제거
    .process(markdown);

  return result.toString();
}