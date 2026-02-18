/** HTML 태그 제거 + 엔티티 디코딩 */
export function stripHtml(text: string): string {
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .trim()
}

/** 정규식 특수문자 이스케이프 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 기사 제목이 테마 키워드와 관련있는지 확인 */
export function isRelevantArticle(title: string, keywords: string[]): boolean {
  return keywords.some(keyword => {
    if (keyword.length <= 3 && /^[A-Za-z0-9]+$/.test(keyword)) {
      return new RegExp(`\\b${escapeRegex(keyword)}\\b`, 'i').test(title)
    }
    return title.includes(keyword)
  })
}
