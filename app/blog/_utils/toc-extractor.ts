/**
 * TOC 아이템 추출 유틸리티 (서버 전용)
 */

export interface TOCItem {
  id: string;
  text: string;
  level: number;
}

/**
 * HTML 콘텐츠에서 TOC 아이템 추출
 * 서버 컴포넌트에서 호출 가능
 */
export function extractTOCItems(html: string): TOCItem[] {
  const items: TOCItem[] = [];
  const regex = /<h([23])[^>]*id="([^"]*)"[^>]*>([^<]*)<\/h[23]>/gi;
  let match;

  while ((match = regex.exec(html)) !== null) {
    items.push({
      level: parseInt(match[1], 10),
      id: match[2],
      text: match[3].trim(),
    });
  }

  return items;
}